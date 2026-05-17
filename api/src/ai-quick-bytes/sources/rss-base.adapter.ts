import Parser from 'rss-parser';
import { BaseSourceAdapter, RawNewsItem } from './base-source.adapter';

export abstract class RssBaseAdapter extends BaseSourceAdapter {
  protected parser = new Parser({
    timeout: 30000,
    headers: { 'User-Agent': 'AetherStackAI-NewsBot/1.0' },
  });

  protected abstract feedUrl: string;

  async fetch(): Promise<RawNewsItem[]> {
    try {
      const feed = await this.parser.parseURL(this.feedUrl);
      return feed.items
        .map((item) => ({
          title: item.title?.trim() || 'Untitled',
          url: item.link?.trim() || '',
          content: item.contentSnippet || item.content || undefined,
          summary: item.contentSnippet || undefined,
          author: item.creator || (item as { author?: string }).author || undefined,
          publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
          metadata: { guid: item.guid },
        }))
        .filter((i) => i.url.length > 0);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
