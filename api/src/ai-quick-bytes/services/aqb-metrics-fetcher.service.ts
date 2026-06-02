import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { ShortScript } from '../entities/short-script.entity';
import { AqbShortMetric } from '../entities/short-metric.entity';

/**
 * Pulls YouTube view/like/comment stats for AQB shorts that are published +
 * have a youtubeVideoId. Inserts a fresh snapshot row each run (so we keep a
 * time series). Dormant if CS_YT_API_KEY is unset — never throws on cron.
 *
 * Uses raw axios against videos.list?part=statistics (read-only, public),
 * keeping this module decoupled from the Content Studio YouTube service.
 */
@Injectable()
export class AqbMetricsFetcherService {
  private readonly logger = new Logger(AqbMetricsFetcherService.name);
  private readonly apiKey: string | undefined;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ShortScript) private readonly scripts: Repository<ShortScript>,
    @InjectRepository(AqbShortMetric) private readonly metrics: Repository<AqbShortMetric>,
  ) {
    this.apiKey = this.config.get<string>('CS_YT_API_KEY');
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Pull stats for every published short — both the English video AND
   * (when present) the Telugu video. Saves separate metric rows per
   * language so the postmortem agent can read each side independently.
   */
  async fetchAll(batchSize = 50): Promise<{ scanned: number; saved: number }> {
    if (!this.isConfigured()) {
      this.logger.warn('CS_YT_API_KEY not set — AQB metrics fetcher dormant');
      return { scanned: 0, saved: 0 };
    }
    const shorts = await this.scripts
      .createQueryBuilder('s')
      .where(`s.status = :st`, { st: 'published' })
      .andWhere(`(s."youtubeVideoId" IS NOT NULL OR s."teluguYoutubeVideoId" IS NOT NULL)`)
      .orderBy('s."createdAt"', 'DESC')
      .limit(500)
      .getMany();

    let saved = 0;
    saved += await this.fetchForLanguage(shorts, 'en', batchSize);
    saved += await this.fetchForLanguage(shorts, 'te', batchSize);
    this.logger.log(`AQB metrics sweep: ${shorts.length} shorts (EN+TE), ${saved} snapshots`);
    return { scanned: shorts.length, saved };
  }

  /** Per-language pass. Calls videos.list with the right id per short. */
  private async fetchForLanguage(
    shorts: ShortScript[], language: 'en' | 'te', batchSize: number,
  ): Promise<number> {
    const idOf = (s: ShortScript): string | null =>
      language === 'te' ? s.teluguYoutubeVideoId : s.youtubeVideoId;
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
            params: { part: 'statistics', id: ids.join(','), key: this.apiKey },
            timeout: 20_000,
          },
        );
        const byId = new Map<string, { v: number; l: number | null; c: number | null }>();
        for (const it of (data?.items ?? []) as Array<{
          id: string;
          statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
        }>) {
          byId.set(it.id, {
            v: Number(it.statistics?.viewCount ?? 0),
            l: it.statistics?.likeCount != null ? Number(it.statistics.likeCount) : null,
            c: it.statistics?.commentCount != null ? Number(it.statistics.commentCount) : null,
          });
        }
        for (const s of batch) {
          const vid = idOf(s)!;
          const stat = byId.get(vid);
          if (!stat) continue;
          await this.metrics.save(
            this.metrics.create({
              scriptId: s.id,
              youtubeVideoId: vid,
              language,
              views: stat.v,
              likes: stat.l,
              comments: stat.c,
            }),
          );
          saved++;
        }
      } catch (e) {
        this.logger.warn(
          `AQB metrics batch (${language}) failed: ${(e as Error).message}`,
        );
      }
    }
    return saved;
  }

  /**
   * Latest snapshot per published short, summing views across BOTH
   * languages (EN + TE) so a short's "total reach" is what the rolling
   * mean compares — winners are concepts that performed well, not
   * single-language outliers.
   */
  async latestPerShort(): Promise<Array<{ scriptId: string; views: number }>> {
    const rows: Array<{ scriptId: string; views: string }> = await this.metrics.query(`
      WITH latest_per_lang AS (
        SELECT DISTINCT ON ("scriptId", language) "scriptId", language, views
          FROM aqb_short_metrics
         ORDER BY "scriptId", language, "fetchedAt" DESC
      )
      SELECT "scriptId", SUM(views)::text AS views
        FROM latest_per_lang
       GROUP BY "scriptId"
    `);
    return rows.map((r) => ({ scriptId: r.scriptId, views: Number(r.views) }));
  }
}
