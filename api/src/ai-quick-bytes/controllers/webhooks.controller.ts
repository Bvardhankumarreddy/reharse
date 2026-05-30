import {
  Controller, Post, Body, Headers, Logger,
  BadRequestException, HttpCode,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { ShortScript } from '../entities/short-script.entity';

interface HeyGenWebhookPayload {
  event_type: string;
  event_data: {
    video_id: string;
    url?: string;
    msg?: string;
  };
}

/**
 * Public route — HeyGen posts here when a video finishes.
 * NOT behind AdminGuard (external caller). Authenticity is enforced via the
 * x-heygen-signature HMAC-SHA256 header when HEYGEN_WEBHOOK_SECRET is set.
 */
@Controller('webhooks/ai-quick-bytes')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    @InjectRepository(ShortScript)
    private readonly scriptRepo: Repository<ShortScript>,
    private readonly config: ConfigService,
  ) {}

  @Post('heygen')
  @HttpCode(200)
  async handleHeyGenWebhook(
    @Headers('x-heygen-signature') signature: string | undefined,
    @Body() payload: HeyGenWebhookPayload,
  ) {
    this.verifySignature(signature, payload);

    const videoId = payload?.event_data?.video_id;
    if (!videoId) throw new BadRequestException('Missing event_data.video_id');

    // The same /heygen webhook handles both tracks — find the script by
    // either column, then update only the column that matched.
    const script = await this.scriptRepo.findOne({
      where: [{ heygenVideoId: videoId }, { teluguHeygenVideoId: videoId }],
    });
    if (!script) {
      this.logger.warn(`HeyGen webhook for unknown video ${videoId} — ignoring`);
      return { received: true, matched: false };
    }
    const isTelugu = script.teluguHeygenVideoId === videoId;
    const lang = isTelugu ? 'telugu' : 'english';

    if (payload.event_type === 'avatar_video.success') {
      const url = payload.event_data.url ?? null;
      if (isTelugu) {
        await this.scriptRepo.update(script.id, {
          teluguHeygenStatus: 'ready',
          teluguHeygenVideoUrl: url,
        });
      } else {
        // English is the primary track — overall `status` follows it.
        await this.scriptRepo.update(script.id, {
          status: 'ready',
          heygenVideoUrl: url,
        });
      }
      this.logger.log(`HeyGen ${lang} video ready: ${videoId}`);
    } else if (payload.event_type === 'avatar_video.fail') {
      const msg = payload.event_data.msg ?? 'HeyGen generation failed';
      if (isTelugu) {
        // Telugu failure is non-fatal: English ships on its own.
        await this.scriptRepo.update(script.id, {
          teluguHeygenStatus: 'failed',
        });
        this.logger.warn(`HeyGen telugu video failed: ${videoId} — ${msg}`);
      } else {
        await this.scriptRepo.update(script.id, {
          status: 'failed',
          rejectionReason: msg,
        });
        this.logger.warn(`HeyGen english video failed: ${videoId} — ${msg}`);
      }
    } else {
      this.logger.log(`Unhandled HeyGen event: ${payload.event_type}`);
    }

    return { received: true, lang };
  }

  /**
   * HMAC-SHA256 over the JSON body, compared in constant time. Skipped only
   * when no secret is configured (deferred-integration mode) so local/dev
   * doesn't hard-fail; once HEYGEN_WEBHOOK_SECRET is set it is enforced.
   */
  private verifySignature(signature: string | undefined, payload: unknown): void {
    const secret = this.config.get<string>('aiQuickBytes.heygen.webhookSecret');
    if (!secret) {
      this.logger.warn('HEYGEN_WEBHOOK_SECRET not set — webhook signature NOT verified');
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
