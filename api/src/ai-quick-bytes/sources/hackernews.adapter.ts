import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseSourceAdapter, RawNewsItem } from './base-source.adapter';

interface HnHit {
  title: string;
  url: string | null;
  story_text: string | null;
  author: string;
  created_at: string;
  objectID: string;
  points: number;
  num_comments: number;
}

@Injectable()
export class HackerNewsAdapter extends BaseSourceAdapter {
  constructor() { super('Hacker News AI'); }

  async fetch(): Promise<RawNewsItem[]> {
    try {
      const since = Math.floor(Date.now() / 1000) - 86400; // last 24h
      const url =
        `https://hn.algolia.com/api/v1/search?query=AI&tags=story` +
        `&numericFilters=created_at_i>${since}&hitsPerPage=30`;
      const { data } = await axios.get<{ hits: HnHit[] }>(url, { timeout: 30000 });

      return data.hits
        .filter((hit) => hit.title && hit.points >= 50) // high-engagement only
        .map((hit) => ({
          title: hit.title,
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          summary: hit.story_text || undefined,
          author: hit.author,
          publishedAt: new Date(hit.created_at),
          metadata: { points: hit.points, comments: hit.num_comments },
        }));
    } catch (error) {
      return this.handleError(error);
    }
  }
}
