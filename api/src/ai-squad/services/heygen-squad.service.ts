import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DialogueSegment } from '../entities/dialogue-segment.entity';
import { Episode } from '../entities/episode.entity';
import { LanguageVersion } from '../entities/language-version.entity';
import { castAvatars, CharacterKey } from '../config/cast.config';
import { getVoiceId, LanguageCode } from '../config/languages.config';

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
    @InjectRepository(LanguageVersion)
    private readonly langRepo: Repository<LanguageVersion>,
    private readonly config: ConfigService,
  ) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('aiSquad.heygen.apiKey');
  }

  /** Queue HeyGen videos for one language's pending segments. */
  async generateEpisodeVideos(
    episodeId: string,
    language = 'english',
  ): Promise<{ queued: number; failed: number; language: string; skipped: boolean }> {
    if (!this.isConfigured()) {
      this.logger.warn('HEYGEN_API_KEY not set — video generation deferred');
      return { queued: 0, failed: 0, language, skipped: true };
    }

    const segments = await this.segmentRepo.find({
      where: { episodeId, languageCode: language, heygenStatus: 'pending' },
      order: { segmentOrder: 'ASC' },
    });

    let queued = 0;
    let failed = 0;
    for (const seg of segments) {
      try {
        const videoId = await this.queueSegment(seg, language);
        await this.segmentRepo.update(seg.id, {
          heygenStatus: 'queued',
          heygenVideoId: videoId,
          heygenError: null,
        });
        queued++;
      } catch (e) {
        this.logger.error(`Segment ${seg.id} (${language}) queue failed: ${(e as Error).message}`);
        await this.segmentRepo.update(seg.id, {
          heygenStatus: 'failed',
          heygenError: (e as Error).message.slice(0, 1000),
        });
        failed++;
      }
    }

    await this.langRepo.update(
      { episodeId, languageCode: language },
      { status: 'generating_videos' },
    );
    if (language === 'english') {
      await this.episodeRepo.update(episodeId, { status: 'generating_videos' });
    }
    return { queued, failed, language, skipped: false };
  }

  /** Run every configured language sequentially. */
  async generateAllLanguages(episodeId: string) {
    const ep = await this.episodeRepo.findOne({ where: { id: episodeId } });
    if (!ep) throw new Error('Episode not found');
    const results = [];
    for (const lang of ep.languages?.length ? ep.languages : ['english']) {
      results.push(await this.generateEpisodeVideos(episodeId, lang));
    }
    return results;
  }

  private async queueSegment(
    seg: DialogueSegment,
    language: string,
  ): Promise<string> {
    const a = castAvatars()[seg.characterKey as CharacterKey];
    if (!a?.avatarId) {
      throw new Error(`No HeyGen avatar configured for ${seg.characterKey}`);
    }
    const voiceId = getVoiceId(seg.characterKey, language as LanguageCode);
    if (!voiceId) {
      throw new Error(`No ${language} voice configured for ${seg.characterKey}`);
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
            voice_id: voiceId,
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

  /**
   * Per-language readiness — a LanguageVersion is ready when ALL of its own
   * segments are ready (not the whole episode across languages).
   */
  async checkLanguageReadiness(episodeId: string, language: string): Promise<boolean> {
    const segs = await this.segmentRepo.find({
      where: { episodeId, languageCode: language },
    });
    if (segs.length === 0) return false;

    if (segs.some((s) => s.heygenStatus === 'failed')) {
      await this.langRepo.update(
        { episodeId, languageCode: language },
        { status: 'failed' },
      );
      if (language === 'english') {
        await this.episodeRepo.update(episodeId, { status: 'failed' });
      }
      return false;
    }
    if (segs.every((s) => s.heygenStatus === 'ready')) {
      await this.langRepo.update(
        { episodeId, languageCode: language },
        { status: 'ready' },
      );
      if (language === 'english') {
        await this.episodeRepo.update(episodeId, { status: 'ready' });
      }
      return true;
    }
    return false;
  }
}
