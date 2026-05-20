import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { YouTubeOAuthService } from './youtube-oauth.service';
import { ConfigService } from '@nestjs/config';

export interface YtComment {
  id: string;
  authorDisplayName: string;
  textOriginal: string;
  publishedAt: string;
  likeCount: number;
}

/**
 * Phase D / D4 — read recent top-level comments on one of our published
 * videos, and post a reply. Reading works with the public Data API key;
 * posting REQUIRES OAuth (dormant without it).
 */
@Injectable()
export class YouTubeCommentService {
  private readonly logger = new Logger(YouTubeCommentService.name);

  constructor(
    private readonly oauth: YouTubeOAuthService,
    private readonly config: ConfigService,
  ) {}

  canRead(): boolean {
    return !!this.config.get<string>('contentStudio.youtube.apiKey');
  }
  canWrite(): boolean {
    return this.oauth.isConfigured();
  }

  async listTopLevel(videoId: string, max = 50): Promise<YtComment[]> {
    const key = this.config.get<string>('contentStudio.youtube.apiKey');
    if (!key) return [];
    const { data } = await axios.get(
      'https://www.googleapis.com/youtube/v3/commentThreads',
      {
        params: {
          part: 'snippet', videoId, maxResults: Math.min(100, max),
          order: 'time', key,
        },
        timeout: 30_000,
      },
    );
    const out: YtComment[] = [];
    for (const t of (data.items ?? [])) {
      const top = t.snippet?.topLevelComment?.snippet ?? {};
      const id = t.snippet?.topLevelComment?.id;
      if (!id) continue;
      out.push({
        id,
        authorDisplayName: top.authorDisplayName ?? '',
        textOriginal: top.textOriginal ?? '',
        publishedAt: top.publishedAt ?? '',
        likeCount: Number(top.likeCount ?? 0),
      });
    }
    return out;
  }

  /** Post a reply to a top-level comment. OAuth required. */
  async postReply(parentId: string, text: string): Promise<{ id: string }> {
    if (!this.canWrite()) {
      throw new Error('YouTube OAuth not configured — cannot post comment replies');
    }
    const token = await this.oauth.accessToken();
    if (!token) throw new Error('Could not obtain access token');
    const { data } = await axios.post(
      'https://www.googleapis.com/youtube/v3/comments',
      { snippet: { parentId, textOriginal: text } },
      {
        params: { part: 'snippet' },
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30_000,
      },
    );
    return { id: data?.id ?? '' };
  }
}
