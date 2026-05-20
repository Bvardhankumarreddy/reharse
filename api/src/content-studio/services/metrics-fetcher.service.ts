import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublishedVideo } from '../entities/published-video.entity';
import { LessonMetrics } from '../entities/lesson-metrics.entity';
import { YouTubeDataService } from './youtube-data.service';

/**
 * Periodic pull of per-lesson YouTube metrics for everything in
 * cs_published_videos. Public counts (views/likes/comments) come from the
 * Data API — no OAuth needed. The Analytics-only fields (ctr, retention,
 * subscribersGained, avg view duration) remain null until OAuth wiring
 * lands in the publishing slice.
 */
@Injectable()
export class MetricsFetcherService {
  private readonly logger = new Logger(MetricsFetcherService.name);

  constructor(
    @InjectRepository(PublishedVideo)
    private readonly published: Repository<PublishedVideo>,
    @InjectRepository(LessonMetrics)
    private readonly metrics: Repository<LessonMetrics>,
    private readonly yt: YouTubeDataService,
  ) {}

  async fetchAll(): Promise<{ scanned: number; saved: number }> {
    if (!this.yt.isConfigured()) {
      this.logger.warn('CS_YT_API_KEY not set — metrics fetcher dormant');
      return { scanned: 0, saved: 0 };
    }
    const published = await this.published.find({
      where: [{ status: 'uploaded' }, { status: 'live' }],
    });
    if (published.length === 0) return { scanned: 0, saved: 0 };

    const ids = published
      .map((p) => p.youtubeVideoId)
      .filter((s): s is string => !!s);
    if (ids.length === 0) return { scanned: 0, saved: 0 };

    const vids = await this.yt.fetchVideos(ids);
    const byId = new Map(vids.map((v) => [v.id, v]));

    let saved = 0;
    for (const p of published) {
      if (!p.youtubeVideoId) continue;
      const v = byId.get(p.youtubeVideoId);
      if (!v) continue;
      await this.metrics.save(
        this.metrics.create({
          lessonId: p.lessonId,
          youtubeVideoId: p.youtubeVideoId,
          views: v.viewCount,
          likes: v.likeCount,
          comments: v.commentCount,
          raw: v.raw,
        }),
      );
      saved++;
    }
    this.logger.log(`Metrics sweep: ${saved}/${published.length} lessons`);
    return { scanned: published.length, saved };
  }

  /** Latest metrics snapshot for a lesson. */
  async latestFor(lessonId: string): Promise<LessonMetrics | null> {
    return this.metrics.findOne({
      where: { lessonId },
      order: { fetchedAt: 'DESC' },
    });
  }
}
