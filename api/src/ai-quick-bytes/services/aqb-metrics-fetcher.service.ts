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

  /** Pull stats for every published short with a youtubeVideoId. */
  async fetchAll(batchSize = 50): Promise<{ scanned: number; saved: number }> {
    if (!this.isConfigured()) {
      this.logger.warn('CS_YT_API_KEY not set — AQB metrics fetcher dormant');
      return { scanned: 0, saved: 0 };
    }
    const shorts = await this.scripts
      .createQueryBuilder('s')
      .where(`s.status = :st`, { st: 'published' })
      .andWhere(`s."youtubeVideoId" IS NOT NULL`)
      .orderBy('s."createdAt"', 'DESC')
      .limit(500)
      .getMany();

    let saved = 0;
    for (let i = 0; i < shorts.length; i += batchSize) {
      const batch = shorts.slice(i, i + batchSize);
      const ids = batch.map((s) => s.youtubeVideoId!).filter(Boolean);
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
          const stat = byId.get(s.youtubeVideoId!);
          if (!stat) continue;
          await this.metrics.save(
            this.metrics.create({
              scriptId: s.id,
              youtubeVideoId: s.youtubeVideoId!,
              views: stat.v,
              likes: stat.l,
              comments: stat.c,
            }),
          );
          saved++;
        }
      } catch (e) {
        this.logger.warn(`AQB metrics batch failed: ${(e as Error).message}`);
      }
    }
    this.logger.log(`AQB metrics sweep: ${shorts.length} shorts, ${saved} snapshots`);
    return { scanned: shorts.length, saved };
  }

  /** Latest snapshot per published short for the rolling-mean calculation. */
  async latestPerShort(): Promise<Array<{ scriptId: string; views: number }>> {
    const rows: Array<{ scriptId: string; views: string }> = await this.metrics.query(`
      SELECT DISTINCT ON ("scriptId") "scriptId", views
        FROM aqb_short_metrics
       ORDER BY "scriptId", "fetchedAt" DESC
    `);
    return rows.map((r) => ({ scriptId: r.scriptId, views: Number(r.views) }));
  }
}
