import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../entities/channel.entity';
import { ChannelVideo } from '../entities/channel-video.entity';
import { YouTubeDataService } from './youtube-data.service';

/**
 * Ingests the brand's OWN YouTube channel uploads (back catalog) + stats into
 * cs_channel_videos. Mirrors CompetitorFetcherService but for our own channel,
 * so insights / Strategy / Improvement can learn from real performance.
 * Dormant if CS_YT_API_KEY is unset or the channel has no youtube id/handle.
 */
@Injectable()
export class ChannelVideoFetcherService {
  private readonly logger = new Logger(ChannelVideoFetcherService.name);

  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(ChannelVideo) private readonly videos: Repository<ChannelVideo>,
    private readonly yt: YouTubeDataService,
  ) {}

  /** Pull uploads for every channel that has a youtube id/handle. */
  async fetchAll(perChannel = 50): Promise<{ scanned: number; saved: number }> {
    if (!this.yt.isConfigured()) {
      this.logger.warn('CS_YT_API_KEY not set — channel fetcher dormant');
      return { scanned: 0, saved: 0 };
    }
    const channels = await this.channels.find();
    let scanned = 0;
    let saved = 0;
    for (const ch of channels) {
      const ref = ch.youtubeChannelId || ch.youtubeHandle || handleFromUrl(ch.channelUrl);
      if (!ref) continue;
      try {
        saved += await this.fetchOne(ch, ref, perChannel);
        scanned++;
      } catch (e) {
        this.logger.error(`Channel "${ch.name}" sync failed: ${(e as Error).message}`);
      }
    }
    this.logger.log(`Channel sweep: ${scanned} channel(s), ${saved} new/updated videos`);
    return { scanned, saved };
  }

  /** Sync one brand's channel on demand. Returns counts. */
  async fetchForBrand(brandId: string, perChannel = 50): Promise<{ saved: number }> {
    if (!this.yt.isConfigured()) {
      throw new BadRequestException('CS_YT_API_KEY not configured');
    }
    const ch = await this.channels.findOne({ where: { brandId } });
    if (!ch) throw new BadRequestException('Brand has no channel');
    const ref = ch.youtubeChannelId || ch.youtubeHandle || handleFromUrl(ch.channelUrl);
    if (!ref) {
      throw new BadRequestException(
        'Channel has no YouTube id/handle — set it first (e.g. @aetherstackai)',
      );
    }
    const saved = await this.fetchOne(ch, ref, perChannel);
    return { saved };
  }

  private async fetchOne(ch: Channel, ref: string, perChannel: number): Promise<number> {
    const info = await this.yt.resolveChannel(ref);
    if (!info?.uploadsPlaylistId) throw new Error(`Could not resolve channel "${ref}"`);

    // Cache the resolved id for next time.
    if (info.id && ch.youtubeChannelId !== info.id) {
      await this.channels.update(ch.id, { youtubeChannelId: info.id });
    }

    const ids = await this.yt.listRecentUploads(info.uploadsPlaylistId, perChannel);
    const vids = await this.yt.fetchVideos(ids);

    let saved = 0;
    for (const v of vids) {
      const existing = await this.videos.findOne({
        where: { brandId: ch.brandId, externalId: v.id },
      });
      if (existing) {
        await this.videos.update(existing.id, {
          title: v.title.slice(0, 500),
          viewCount: v.viewCount,
          likeCount: v.likeCount,
          commentCount: v.commentCount,
          fetchedAt: new Date(),
        });
        continue;
      }
      await this.videos.save(
        this.videos.create({
          brandId: ch.brandId,
          channelId: ch.id,
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
    await this.channels.update(ch.id, { lastSyncedAt: new Date() });
    return saved;
  }

  /** Top videos by views for a brand. */
  async topForBrand(brandId: string, limit = 15): Promise<ChannelVideo[]> {
    return this.videos.find({
      where: { brandId },
      order: { viewCount: 'DESC' },
      take: limit,
    });
  }

  async listForBrand(brandId: string, limit = 60): Promise<ChannelVideo[]> {
    return this.videos.find({
      where: { brandId },
      order: { publishedAt: 'DESC' },
      take: limit,
    });
  }

  async countForBrand(brandId: string): Promise<number> {
    return this.videos.count({ where: { brandId } });
  }
}

/** Best-effort extract of @handle or channel id from a channel URL. */
function handleFromUrl(url: string | null): string | null {
  if (!url) return null;
  const at = /@[\w.-]+/.exec(url);
  if (at) return at[0];
  const uc = /(UC[\w-]{20,})/.exec(url);
  return uc ? uc[1] : null;
}
