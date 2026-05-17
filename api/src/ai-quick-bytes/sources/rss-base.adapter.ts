import { BaseSourceAdapter, RawNewsItem } from './base-source.adapter';
// rss-parser ships `export = Parser` (CommonJS). With module:commonjs and no
// esModuleInterop, a default import compiles to `.default` which is undefined.
// import-equals is the correct interop here.
import Parser = require('rss-parser');

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
          // Some feeds (e.g. Google AI) return author/creator as an object
          // ({ name }) or array, not a string — coerce defensively.
          author: this.normalizeAuthor(
            item.creator ?? (item as { author?: unknown }).author,
          ),
          publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
          metadata: { guid: item.guid },
        }))
        .filter((i) => i.url.length > 0);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** RSS author/creator may be a string, { name }, array, or undefined. */
  private normalizeAuthor(raw: unknown): string | undefined {
    if (!raw) return undefined;
    if (typeof raw === 'string') return raw.trim() || undefined;
    if (Array.isArray(raw)) {
      const joined = raw.map((r) => this.normalizeAuthor(r)).filter(Boolean).join(', ');
      return joined || undefined;
    }
    if (typeof raw === 'object') {
      const o = raw as { name?: unknown; _?: unknown };
      const v = o.name ?? o._;
      return typeof v === 'string' ? v.trim() || undefined : undefined;
    }
    return undefined;
  }
}
