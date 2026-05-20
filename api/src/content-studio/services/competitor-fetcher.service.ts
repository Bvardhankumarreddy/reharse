import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompetitorChannel } from '../entities/competitor-channel.entity';
import { CompetitorVideo } from '../entities/competitor-video.entity';
import { YouTubeDataService } from './youtube-data.service';

@Injectable()
export class CompetitorFetcherService {
  private readonly logger = new Logger(CompetitorFetcherService.name);

  constructor(
    @InjectRepository(CompetitorChannel)
    private readonly channels: Repository<CompetitorChannel>,
    @InjectRepository(CompetitorVideo)
    private readonly videos: Repository<CompetitorVideo>,
    private readonly yt: YouTubeDataService,
  ) {}

  /** Pull last N uploads for every active competitor channel. Dormant if no YT key. */
  async fetchAll(perChannel = 25): Promise<{ scanned: number; saved: number }> {
    if (!this.yt.isConfigured()) {
      this.logger.warn('CS_YT_API_KEY not set — competitor fetcher dormant');
      return { scanned: 0, saved: 0 };
    }
    const active = await this.channels.find({ where: { isActive: true } });
    let scanned = 0;
    let saved = 0;
    for (const ch of active) {
      try {
        const n = await this.fetchOne(ch, perChannel);
        saved += n;
        scanned++;
      } catch (e) {
        const msg = (e as Error).message;
        this.logger.error(`Competitor "${ch.name}" failed: ${msg}`);
        await this.channels
          .createQueryBuilder()
          .update(CompetitorChannel)
          .set({ lastError: msg.slice(0, 1000), errorCount: () => '"errorCount" + 1' })
          .where('id = :id', { id: ch.id })
          .execute();
      }
    }
    this.logger.log(`Competitor sweep: ${scanned}/${active.length} channels, ${saved} new videos`);
    return { scanned, saved };
  }

  async fetchOne(ch: CompetitorChannel, perChannel: number): Promise<number> {
    // Resolve channel id + uploads playlist if missing
    if (!ch.youtubeChannelId) {
      const handle = ch.channelHandle || ch.name;
      const info = await this.yt.resolveChannel(handle);
      if (!info) throw new Error(`Could not resolve channel "${handle}"`);
      ch.youtubeChannelId = info.id;
      await this.channels.update(ch.id, { youtubeChannelId: info.id });
    }
    const info = await this.yt.resolveChannel(ch.youtubeChannelId);
    if (!info?.uploadsPlaylistId) throw new Error('No uploads playlist for channel');

    const ids = await this.yt.listRecentUploads(info.uploadsPlaylistId, perChannel);
    const vids = await this.yt.fetchVideos(ids);

    let saved = 0;
    for (const v of vids) {
      const existing = await this.videos.findOne({
        where: { competitorChannelId: ch.id, externalId: v.id },
      });
      if (existing) {
        // Refresh counts but keep the row
        await this.videos.update(existing.id, {
          viewCount: v.viewCount,
          likeCount: v.likeCount,
          commentCount: v.commentCount,
        });
        continue;
      }
      await this.videos.save(
        this.videos.create({
          competitorChannelId: ch.id,
          externalId: v.id,
          title: v.title.slice(0, 500),
          description: v.description?.slice(0, 8000) ?? null,
          publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
          viewCount: v.viewCount,
          likeCount: v.likeCount,
          commentCount: v.commentCount,
          durationSeconds: v.durationSeconds,
          raw: v.raw,
        }),
      );
      saved++;
    }
    await this.channels.update(ch.id, {
      lastFetchedAt: new Date(),
      lastError: null,
      errorCount: 0,
    });
    return saved;
  }

  /** Top recent competitor videos across a brand, last 30 days. */
  async topRecentForBrand(
    brandId: string, limit = 12, days = 30,
  ): Promise<CompetitorVideo[]> {
    return this.videos
      .createQueryBuilder('v')
      .innerJoin(CompetitorChannel, 'c', 'c.id = v."competitorChannelId"')
      .where('c."brandId" = :brandId', { brandId })
      .andWhere(`v."publishedAt" > NOW() - INTERVAL '${Math.floor(days)} days'`)
      .orderBy('v."viewCount"', 'DESC')
      .limit(limit)
      .getMany();
  }
}
