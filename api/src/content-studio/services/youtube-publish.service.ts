import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { ContentAsset } from '../entities/content-asset.entity';
import {
  PublishedVideo, PublishStatus,
} from '../entities/published-video.entity';
import { YouTubeOAuthService } from './youtube-oauth.service';

/**
 * Phase D / D3 — pushes the lesson's SEO pack + thumbnail PNG to YouTube
 * for an EXISTING uploaded video (we don't stitch MP4s from scripts).
 *
 * Flow (per spec):
 *   1. Host uploads the video manually to YouTube → notes the videoId.
 *   2. Calls POST /lessons/:id/publish { youtubeVideoId }.
 *   3. This service updates the video's title/description/tags (from the
 *      latest SEO asset) and uploads the generated thumbnail PNG (from
 *      cs_published_videos.thumbnailB64), recording the result.
 *
 * Dormant if YouTube OAuth isn't configured — returns a clear "not
 * configured" error rather than half-succeeding.
 */
@Injectable()
export class YouTubePublishService {
  private readonly logger = new Logger(YouTubePublishService.name);

  constructor(
    @InjectRepository(ContentAsset)
    private readonly assetRepo: Repository<ContentAsset>,
    @InjectRepository(PublishedVideo)
    private readonly publishedRepo: Repository<PublishedVideo>,
    private readonly oauth: YouTubeOAuthService,
  ) {}

  isConfigured(): boolean {
    return this.oauth.isConfigured();
  }

  async publishMetadata(
    lessonId: string,
    youtubeVideoId: string,
  ): Promise<PublishedVideo> {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'YouTube OAuth not configured — set CS_YT_OAUTH_CLIENT_ID / _SECRET / _REFRESH_TOKEN',
      );
    }
    const token = await this.oauth.accessToken();
    if (!token) throw new BadRequestException('Could not obtain access token');

    // 1) Read SEO pack.
    const seo = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'seo' },
      order: { version: 'DESC' },
    });
    const seoContent = seo?.content as
      | { chosenTitle?: string; titleVariants?: string[];
          chosenTitleIndex?: number; description?: string; tags?: string[] }
      | null;
    const title =
      seoContent?.chosenTitle ||
      seoContent?.titleVariants?.[seoContent?.chosenTitleIndex ?? 0] ||
      '';
    const description = seoContent?.description ?? '';
    const tags = (seoContent?.tags ?? []).slice(0, 20);

    if (!title) {
      throw new BadRequestException(
        'No SEO asset / chosen title — generate SEO for this lesson first.',
      );
    }

    // 2) Update video metadata (videos.update).
    try {
      await axios.put(
        'https://www.googleapis.com/youtube/v3/videos',
        {
          id: youtubeVideoId,
          snippet: {
            title: title.slice(0, 100),
            description: description.slice(0, 5000),
            tags,
            categoryId: '22', // People & Blogs
          },
        },
        {
          params: { part: 'snippet' },
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );
    } catch (e) {
      const err = (e as {
        response?: { status?: number; data?: { error?: { code?: number; message?: string } } };
        message?: string;
      });
      const status = err.response?.status ?? err.response?.data?.error?.code;
      const ytMsg = err.response?.data?.error?.message ?? err.message ?? 'unknown error';
      if (status === 403) {
        throw new BadRequestException(
          'YouTube rejected the update (403 Forbidden). The video must belong to ' +
          'the connected YouTube channel — you can only edit your own uploads. ' +
          'Double-check the videoId is one of that channel\'s videos.',
        );
      }
      if (status === 404) {
        throw new BadRequestException(
          `YouTube video not found (404). Check the youtubeVideoId — got "${youtubeVideoId}".`,
        );
      }
      throw new BadRequestException(`YouTube videos.update failed: ${ytMsg}`);
    }

    // 3) Upload the generated thumbnail (if present).
    const pub = await this.publishedRepo.findOne({ where: { lessonId } });
    if (pub?.thumbnailB64) {
      try {
        const buf = Buffer.from(pub.thumbnailB64, 'base64');
        await axios.post(
          'https://www.googleapis.com/upload/youtube/v3/thumbnails/set',
          buf,
          {
            params: { videoId: youtubeVideoId, uploadType: 'media' },
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'image/png',
            },
            maxBodyLength: 8 * 1024 * 1024,
            timeout: 60_000,
          },
        );
      } catch (e) {
        const err = (e as { response?: { data?: unknown }; message?: string });
        this.logger.warn(
          `thumbnails.set failed: ${JSON.stringify(err.response?.data ?? err.message)}`,
        );
      }
    }

    // 4) Upsert cs_published_videos row.
    const row = await (async () => {
      if (pub) {
        await this.publishedRepo.update(pub.id, {
          youtubeVideoId,
          youtubeUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
          publishedAt: new Date(),
          status: 'live' as PublishStatus,
          error: null,
        });
        return (await this.publishedRepo.findOne({ where: { id: pub.id } }))!;
      }
      return this.publishedRepo.save(
        this.publishedRepo.create({
          lessonId,
          youtubeVideoId,
          youtubeUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
          publishedAt: new Date(),
          status: 'live' as PublishStatus,
        }),
      );
    })();
    this.logger.log(
      `Published metadata for lesson ${lessonId} → ${row.youtubeUrl}`,
    );
    return row;
  }
}
