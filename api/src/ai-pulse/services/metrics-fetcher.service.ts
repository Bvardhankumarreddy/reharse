import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { AiPulseScript } from '../entities/news-script.entity';
import { AiPulseMetric } from '../entities/metric.entity';

/**
 * Pulls YouTube view/like/comment stats AND live snippet (title +
 * description) for every published AI Pulse script that has a youtube
 * video id. Mirrors the AQB pattern. videos.list charges 1 quota unit
 * per call regardless of part count, so requesting `snippet` is free.
 */
@Injectable()
export class AiPulseMetricsFetcherService {
  private readonly logger = new Logger(AiPulseMetricsFetcherService.name);
  private readonly apiKey: string | undefined;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(AiPulseScript) private readonly scripts: Repository<AiPulseScript>,
    @InjectRepository(AiPulseMetric) private readonly metrics: Repository<AiPulseMetric>,
  ) {
    this.apiKey = this.config.get<string>('CS_YT_API_KEY');
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async fetchAll(batchSize = 50): Promise<{ scanned: number; saved: number }> {
    if (!this.isConfigured()) {
      this.logger.warn('CS_YT_API_KEY not set — AI Pulse metrics fetcher dormant');
      return { scanned: 0, saved: 0 };
    }
    const shorts = await this.scripts
      .createQueryBuilder('s')
      .where(`s.approval_status = :st`, { st: 'published' })
      .andWhere(`(s.english_youtube_video_id IS NOT NULL OR s.telugu_youtube_video_id IS NOT NULL)`)
      .orderBy('s.published_at', 'DESC')
      .limit(500)
      .getMany();

    let saved = 0;
    saved += await this.fetchForLanguage(shorts, 'en', batchSize);
    saved += await this.fetchForLanguage(shorts, 'te', batchSize);
    this.logger.log(`AI Pulse metrics sweep: ${shorts.length} shorts (EN+TE), ${saved} snapshots`);
    return { scanned: shorts.length, saved };
  }

  /** Single video.list batched call per language, statistics + snippet. */
  private async fetchForLanguage(
    shorts: AiPulseScript[], language: 'en' | 'te', batchSize: number,
  ): Promise<number> {
    const idOf = (s: AiPulseScript): string | null =>
      language === 'te' ? s.telugu_youtube_video_id : s.english_youtube_video_id;
    const eligible = shorts.filter((s) => !!idOf(s));
    if (eligible.length === 0) return 0;

    let saved = 0;
    for (let i = 0; i < eligible.length; i += batchSize) {
      const batch = eligible.slice(i, i + batchSize);
      const ids = batch.map((s) => idOf(s)!).filter(Boolean);
      if (ids.length === 0) continue;
      try {
        const { data } = await axios.get(
          'https://www.googleapis.com/youtube/v3/videos',
          {
            params: { part: 'statistics,snippet', id: ids.join(','), key: this.apiKey },
            timeout: 20_000,
          },
        );
        const byId = new Map<string, {
          v: number; l: number | null; c: number | null;
          title: string | null; description: string | null;
        }>();
        for (const it of (data?.items ?? []) as Array<{
          id: string;
          statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
          snippet?: { title?: string; description?: string };
        }>) {
          byId.set(it.id, {
            v: Number(it.statistics?.viewCount ?? 0),
            l: it.statistics?.likeCount != null ? Number(it.statistics.likeCount) : null,
            c: it.statistics?.commentCount != null ? Number(it.statistics.commentCount) : null,
            title: it.snippet?.title ?? null,
            description: it.snippet?.description ?? null,
          });
        }
        const now = new Date();
        for (const s of batch) {
          const vid = idOf(s)!;
          const stat = byId.get(vid);
          if (!stat) continue;
          await this.metrics.save(
            this.metrics.create({
              script_id: s.id,
              youtube_video_id: vid,
              language,
              views: stat.v,
              likes: stat.l,
              comments: stat.c,
            }),
          );
          if (stat.title != null || stat.description != null) {
            const patch = language === 'te'
              ? {
                  live_telugu_youtube_title: stat.title,
                  live_telugu_youtube_description: stat.description,
                  live_telugu_youtube_fetched_at: now,
                }
              : {
                  live_youtube_title: stat.title,
                  live_youtube_description: stat.description,
                  live_youtube_fetched_at: now,
                };
            await this.scripts.update(s.id, patch);
          }
          saved++;
        }
      } catch (e) {
        this.logger.warn(
          `AI Pulse metrics batch (${language}) failed: ${(e as Error).message}`,
        );
      }
    }
    return saved;
  }

  /** Latest views summed across EN + TE per script. */
  async latestPerShort(): Promise<Array<{ scriptId: string; vertical: string; views: number }>> {
    const rows: Array<{ scriptId: string; vertical: string; views: string }> =
      await this.metrics.query(`
        WITH latest_per_lang AS (
          SELECT DISTINCT ON (script_id, language) script_id, language, views
            FROM ai_pulse_metrics
           ORDER BY script_id, language, fetched_at DESC
        )
        SELECT l.script_id AS "scriptId",
               s.vertical  AS vertical,
               SUM(l.views)::text AS views
          FROM latest_per_lang l
          JOIN ai_pulse_scripts s ON s.id = l.script_id
         GROUP BY l.script_id, s.vertical
      `);
    return rows.map((r) => ({ scriptId: r.scriptId, vertical: r.vertical, views: Number(r.views) }));
  }
}
