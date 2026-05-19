import {
  Controller, Post, Body, Headers, Logger, HttpCode, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { DialogueSegment } from '../entities/dialogue-segment.entity';
import { HeyGenSquadService } from '../services/heygen-squad.service';

interface HeyGenWebhookPayload {
  event_type: string;
  event_data: { video_id: string; url?: string; msg?: string };
}

/**
 * Public route — HeyGen posts here per finished segment video.
 * NOT behind AdminGuard. HMAC-SHA256 verified when HEYGEN_WEBHOOK_SECRET set.
 */
@Controller('webhooks/ai-squad')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    @InjectRepository(DialogueSegment)
    private readonly segmentRepo: Repository<DialogueSegment>,
    private readonly heygen: HeyGenSquadService,
    private readonly config: ConfigService,
  ) {}

  @Post('heygen')
  @HttpCode(200)
  async handle(
    @Headers('x-heygen-signature') signature: string | undefined,
    @Body() payload: HeyGenWebhookPayload,
  ) {
    this.verify(signature, payload);

    const videoId = payload?.event_data?.video_id;
    if (!videoId) throw new BadRequestException('Missing event_data.video_id');

    const seg = await this.segmentRepo.findOne({
      where: { heygenVideoId: videoId },
    });
    if (!seg) {
      this.logger.warn(`Webhook for unknown video_id ${videoId}`);
      return { received: false };
    }

    if (payload.event_type === 'avatar_video.success') {
      await this.segmentRepo.update(seg.id, {
        heygenStatus: 'ready',
        heygenVideoUrl: payload.event_data.url ?? null,
      });
      await this.heygen.checkLanguageReadiness(seg.episodeId, seg.languageCode);
    } else if (payload.event_type === 'avatar_video.fail') {
      await this.segmentRepo.update(seg.id, {
        heygenStatus: 'failed',
        heygenError: payload.event_data.msg ?? 'HeyGen generation failed',
      });
      await this.heygen.checkLanguageReadiness(seg.episodeId, seg.languageCode);
    }
    return { received: true };
  }

  private verify(signature: string | undefined, payload: unknown): void {
    const secret = this.config.get<string>('aiSquad.heygen.webhookSecret');
    if (!secret) {
      this.logger.warn('HEYGEN_WEBHOOK_SECRET not set — signature NOT verified');
      return;
    }
    if (!signature) throw new BadRequestException('Missing x-heygen-signature');
    const expected = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid webhook signature');
    }
  }
}
