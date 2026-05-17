import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WebhooksController } from './webhooks.controller';
import { ShortScript } from '../entities/short-script.entity';

describe('WebhooksController (HeyGen signature)', () => {
  const secret = 'test-webhook-secret';
  let controller: WebhooksController;
  let updateMock: jest.Mock;

  async function build(configuredSecret: string | undefined) {
    updateMock = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: getRepositoryToken(ShortScript),
          useValue: { update: updateMock },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'aiQuickBytes.heygen.webhookSecret' ? configuredSecret : undefined,
          },
        },
      ],
    }).compile();
    controller = moduleRef.get(WebhooksController);
  }

  const payload = {
    event_type: 'avatar_video.success',
    event_data: { video_id: 'vid_123', url: 'https://cdn/v.mp4' },
  };

  function sign(body: unknown): string {
    return createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
  }

  it('accepts a correctly-signed payload and marks the script ready', async () => {
    await build(secret);
    const res = await controller.handleHeyGenWebhook(sign(payload), payload);
    expect(res).toEqual({ received: true });
    expect(updateMock).toHaveBeenCalledWith(
      { heygenVideoId: 'vid_123' },
      { status: 'ready', heygenVideoUrl: 'https://cdn/v.mp4' },
    );
  });

  it('rejects an invalid signature', async () => {
    await build(secret);
    await expect(
      controller.handleHeyGenWebhook('deadbeef', payload),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing signature when a secret is configured', async () => {
    await build(secret);
    await expect(
      controller.handleHeyGenWebhook(undefined, payload),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('skips verification when no secret is configured (deferred mode)', async () => {
    await build(undefined);
    const res = await controller.handleHeyGenWebhook(undefined, payload);
    expect(res).toEqual({ received: true });
  });

  it('marks the script failed on avatar_video.fail', async () => {
    await build(secret);
    const failPayload = {
      event_type: 'avatar_video.fail',
      event_data: { video_id: 'vid_x', msg: 'render error' },
    };
    await controller.handleHeyGenWebhook(sign(failPayload), failPayload);
    expect(updateMock).toHaveBeenCalledWith(
      { heygenVideoId: 'vid_x' },
      { status: 'failed', rejectionReason: 'render error' },
    );
  });
});
