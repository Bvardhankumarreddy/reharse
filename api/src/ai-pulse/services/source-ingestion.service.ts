import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiPulseNewsItem } from '../entities/news-item.entity';
import { SOURCES, SourceSpec } from '../config/sources.config';

// rss-parser is a CommonJS module that exports the constructor as
// module.exports (no `.default` wrapper). The ES `import Parser from
// 'rss-parser'` form compiles to `rss_parser_1.default` at runtime
// under this project's tsconfig — which is undefined. Going through
// require() bypasses the interop and gets the real constructor.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RssParser = require('rss-parser');

@Injectable()
export class AiPulseIngestionService {
  private readonly logger = new Logger(AiPulseIngestionService.name);
  private parser = new RssParser({ timeout: 15_000 });

  constructor(
    @InjectRepository(AiPulseNewsItem)
    private readonly news: Repository<AiPulseNewsItem>,
  ) {}

  /** Ingest all enabled sources. Returns aggregate stats. */
  async ingestAll(): Promise<{
    total: number;
    new: number;
    duplicates: number;
    per_source: Record<string, { new: number; duplicates: number; total: number }>;
  }> {
    const agg = { total: 0, new: 0, duplicates: 0 };
    const per_source: Record<string, { new: number; duplicates: number; total: number }> = {};

    for (const [key, src] of Object.entries(SOURCES)) {
      if (src.enabled === false) continue;
      try {
        const r = await this.ingestSource(key, src);
        agg.total      += r.total;
        agg.new        += r.new;
        agg.duplicates += r.duplicates;
        per_source[key] = r;
      } catch (e) {
        this.logger.warn(`Source ${key} failed: ${(e as Error).message}`);
        per_source[key] = { new: 0, duplicates: 0, total: 0 };
      }
    }
    this.logger.log(
      `AI Pulse ingest: ${agg.new} new / ${agg.duplicates} dup / ${agg.total} total`,
    );
    return { ...agg, per_source };
  }

  /** Ingest one source. Currently supports RSS — scraper TODO. */
  async ingestSource(
    sourceKey: string, src: SourceSpec,
  ): Promise<{ total: number; new: number; duplicates: number }> {
    const stats = { total: 0, new: 0, duplicates: 0 };
    if (src.type !== 'rss') {
      this.logger.warn(`Source ${sourceKey} is type=${src.type}, not yet supported`);
      return stats;
    }

    const feed = await this.parser.parseURL(src.url);
    // Cap to 20 most-recent items per fetch to keep the cron fast.
    const items = (feed.items ?? []).slice(0, 20);

    for (const item of items) {
      stats.total++;

      // Keyword filter (require ANY of the configured terms).
      if (src.keyword_filter && src.keyword_filter.length > 0) {
        const text = `${item.title ?? ''} ${item.contentSnippet ?? ''}`.toLowerCase();
        const hit = src.keyword_filter.some((kw) => text.includes(kw.toLowerCase()));
        if (!hit) continue;
      }

      const external_id = (item.guid ?? item.link ?? '').slice(0, 500);
      if (!external_id) continue;

      // Dedup on (source_name, external_id) — unique index in DB.
      const existing = await this.news.findOne({
        where: { source_name: src.display_name, external_id },
      });
      if (existing) {
        stats.duplicates++;
        continue;
      }

      const published = item.pubDate ? new Date(item.pubDate) : null;
      await this.news.save(
        this.news.create({
          vertical: src.vertical,
          source_name: src.display_name,
          source_url: item.link ?? src.url,
          source_type: 'rss',
          external_id,
          headline: (item.title ?? '').slice(0, 2000),
          summary: (item.contentSnippet ?? '').slice(0, 4000),
          content: (item.content ?? '').slice(0, 20_000),
          author: item.creator ?? null,
          published_at: published && !isNaN(published.getTime()) ? published : null,
          status: 'pending',
        }),
      );
      stats.new++;
    }
    return stats;
  }
}
