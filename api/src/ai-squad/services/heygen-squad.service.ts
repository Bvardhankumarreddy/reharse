import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DialogueSegment } from '../entities/dialogue-segment.entity';
import { Episode } from '../entities/episode.entity';
import { castAvatars, CharacterKey } from '../config/cast.config';

/**
 * Multi-avatar HeyGen integration. Each dialogue segment becomes one HeyGen
 * video (the correct avatar/voice for that character). Final stitching of the
 * 20-30 segment clips is manual (CapCut/Descript), per spec.
 *
 * Dormant until HEYGEN_API_KEY + the 5 avatar/voice IDs are set — every
 * method degrades gracefully instead of throwing on a missing key.
 */
@Injectable()
export class HeyGenSquadService {
  private readonly logger = new Logger(HeyGenSquadService.name);

  constructor(
    @InjectRepository(DialogueSegment)
    private readonly segmentRepo: Repository<DialogueSegment>,
    @InjectRepository(Episode)
    private readonly episodeRepo: Repository<Episode>,
    private readonly config: ConfigService,
  ) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('aiSquad.heygen.apiKey');
  }

  async generateEpisodeVideos(
    episodeId: string,
  ): Promise<{ queued: number; failed: number; skipped: boolean }> {
    if (!this.isConfigured()) {
      this.logger.warn('HEYGEN_API_KEY not set — video generation deferred');
      return { queued: 0, failed: 0, skipped: true };
    }

    const segments = await this.segmentRepo.find({
      where: { episodeId, heygenStatus: 'pending' },
      order: { segmentOrder: 'ASC' },
    });

    let queued = 0;
    let failed = 0;
    for (const seg of segments) {
      try {
        const videoId = await this.queueSegment(seg);
        await this.segmentRepo.update(seg.id, {
          heygenStatus: 'queued',
          heygenVideoId: videoId,
          heygenError: null,
        });
        queued++;
      } catch (e) {
        this.logger.error(`Segment ${seg.id} queue failed: ${(e as Error).message}`);
        await this.segmentRepo.update(seg.id, {
          heygenStatus: 'failed',
          heygenError: (e as Error).message.slice(0, 1000),
        });
        failed++;
      }
    }

    await this.episodeRepo.update(episodeId, { status: 'generating_videos' });
    return { queued, failed, skipped: false };
  }

  private async queueSegment(seg: DialogueSegment): Promise<string> {
    const avatars = castAvatars();
    const a = avatars[seg.characterKey as CharacterKey];
    if (!a?.avatarId || !a?.voiceId) {
      throw new Error(`No HeyGen avatar/voice configured for ${seg.characterKey}`);
    }

    const baseUrl = this.config.get<string>('aiSquad.heygen.baseUrl');
    const apiKey = this.config.get<string>('aiSquad.heygen.apiKey');
    const appUrl = this.config.get<string>('aiSquad.appUrl');

    const { data } = await axios.post(
      `${baseUrl}/video/generate`,
      {
        video_inputs: [{
          character: { type: 'avatar', avatar_id: a.avatarId, avatar_style: 'normal' },
          voice: {
            type: 'text',
            voice_id: a.voiceId,
            input_text: seg.textWithPauses ?? seg.text,
          },
          background: { type: 'color', value: '#0A0E27' },
        }],
        dimension: { width: 1920, height: 1080 }, // 16:9 landscape
        callback_url: `${appUrl}/api/v1/webhooks/ai-squad/heygen`,
      },
      { headers: { 'X-Api-Key': apiKey }, timeout: 30000 },
    );
    return data?.data?.video_id;
  }

  /** Mark the episode ready when every segment is ready; failed → failed. */
  async checkEpisodeReadiness(episodeId: string): Promise<boolean> {
    const segs = await this.segmentRepo.find({ where: { episodeId } });
    if (segs.length === 0) return false;
    if (segs.some((s) => s.heygenStatus === 'failed')) {
      await this.episodeRepo.update(episodeId, { status: 'failed' });
      return false;
    }
    if (segs.every((s) => s.heygenStatus === 'ready')) {
      await this.episodeRepo.update(episodeId, { status: 'ready' });
      return true;
    }
    return false;
  }
}
