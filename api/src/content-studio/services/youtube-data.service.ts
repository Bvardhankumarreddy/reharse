import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Read-only YouTube Data API client. Uses just an API key (no OAuth).
 * Used by the Competitor agent + the public-counts side of the Metrics
 * agent. Dormant when CS_YT_API_KEY is unset.
 */

export interface YtChannelInfo {
  id: string;
  title: string;
  uploadsPlaylistId: string;
}

export interface YtVideoLite {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  likeCount: number | null;
  commentCount: number | null;
  raw: Record<string, unknown>;
}

@Injectable()
export class YouTubeDataService {
  private readonly logger = new Logger(YouTubeDataService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('contentStudio.youtube.apiKey');
  }

  private apiKey(): string {
    const key = this.config.get<string>('contentStudio.youtube.apiKey');
    if (!key) throw new Error('CS_YT_API_KEY not set');
    return key;
  }

  /** Resolve "@handle" or "UCxxx" to channel info. */
  async resolveChannel(handleOrId: string): Promise<YtChannelInfo | null> {
    const params = handleOrId.startsWith('UC')
      ? { id: handleOrId }
      : { forHandle: handleOrId.replace(/^@/, '') };
    const { data } = await axios.get(
      'https://www.googleapis.com/youtube/v3/channels',
      {
        params: {
          part: 'snippet,contentDetails',
          ...params,
          key: this.apiKey(),
        },
        timeout: 20_000,
      },
    );
    const item = data.items?.[0];
    if (!item) return null;
    return {
      id: item.id,
      title: item.snippet?.title ?? '',
      uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? '',
    };
  }

  /** Latest N uploads for a channel (uses its "uploads" playlist). */
  async listRecentUploads(uploadsPlaylistId: string, max = 25): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    while (ids.length < max) {
      const { data } = await axios.get(
        'https://www.googleapis.com/youtube/v3/playlistItems',
        {
          params: {
            part: 'contentDetails',
            playlistId: uploadsPlaylistId,
            maxResults: Math.min(50, max - ids.length),
            ...(pageToken ? { pageToken } : {}),
            key: this.apiKey(),
          },
          timeout: 20_000,
        },
      );
      for (const it of (data.items ?? [])) {
        const id = it.contentDetails?.videoId;
        if (id) ids.push(id);
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return ids.slice(0, max);
  }

  async fetchVideos(videoIds: string[]): Promise<YtVideoLite[]> {
    if (videoIds.length === 0) return [];
    const out: YtVideoLite[] = [];
    // Data API videos.list takes up to 50 ids per call.
    for (let i = 0; i < videoIds.length; i += 50) {
      const slice = videoIds.slice(i, i + 50);
      const { data } = await axios.get(
        'https://www.googleapis.com/youtube/v3/videos',
        {
          params: {
            part: 'snippet,statistics,contentDetails',
            id: slice.join(','),
            key: this.apiKey(),
          },
          timeout: 20_000,
        },
      );
      for (const it of (data.items ?? [])) {
        out.push({
          id: it.id,
          title: it.snippet?.title ?? '',
          description: it.snippet?.description ?? '',
          publishedAt: it.snippet?.publishedAt ?? '',
          durationSeconds: parseIso8601Duration(it.contentDetails?.duration ?? ''),
          viewCount: Number(it.statistics?.viewCount ?? 0),
          likeCount: it.statistics?.likeCount != null ? Number(it.statistics.likeCount) : null,
          commentCount: it.statistics?.commentCount != null ? Number(it.statistics.commentCount) : null,
          raw: it,
        });
      }
    }
    return out;
  }
}

/** ISO 8601 "PT1H2M3S" → 3723 seconds. */
function parseIso8601Duration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}
