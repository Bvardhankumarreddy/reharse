import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { NewsSource } from '../entities/news-source.entity';
import { NewsItem } from '../entities/news-item.entity';
import { DedupService } from './dedup.service';
import { BaseSourceAdapter } from '../sources/base-source.adapter';
import { OpenAIBlogAdapter } from '../sources/openai-blog.adapter';
import { GoogleAIAdapter } from '../sources/google-ai.adapter';
import { TheBatchAdapter } from '../sources/the-batch.adapter';
import { TechCrunchAIAdapter } from '../sources/techcrunch-ai.adapter';
import { VentureBeatAIAdapter } from '../sources/venturebeat-ai.adapter';
import { AnthropicNewsAdapter } from '../sources/anthropic.adapter';
import { ArxivAdapter } from '../sources/arxiv.adapter';
import { HackerNewsAdapter } from '../sources/hackernews.adapter';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly adapters: Map<string, BaseSourceAdapter>;

  constructor(
    @InjectRepository(NewsSource)
    private readonly sourceRepo: Repository<NewsSource>,
    @InjectRepository(NewsItem)
    private readonly itemRepo: Repository<NewsItem>,
    private readonly dedup: DedupService,
    private readonly config: ConfigService,
    openaiBlog: OpenAIBlogAdapter,
    googleAI: GoogleAIAdapter,
    theBatch: TheBatchAdapter,
    techCrunch: TechCrunchAIAdapter,
    ventureBeat: VentureBeatAIAdapter,
    anthropic: AnthropicNewsAdapter,
    arxiv: ArxivAdapter,
    hackerNews: HackerNewsAdapter,
  ) {
    // Keys MUST match aqb_news_sources.name exactly.
    this.adapters = new Map<string, BaseSourceAdapter>([
      ['OpenAI Blog', openaiBlog],
      ['Google AI Blog', googleAI],
      ['The Batch', theBatch],
      ['TechCrunch AI', techCrunch],
      ['VentureBeat AI', ventureBeat],
      ['Anthropic News', anthropic],
      ['ArXiv cs.AI', arxiv],
      ['Hacker News AI', hackerNews],
    ]);
  }

  async fetchFromSource(sourceId: string): Promise<number> {
    const source = await this.sourceRepo.findOne({ where: { id: sourceId } });
    if (!source || !source.isActive) return 0;

    const adapter = this.adapters.get(source.name);
    if (!adapter) {
      this.logger.error(`No adapter for source: ${source.name}`);
      return 0;
    }

    let rawItems;
    try {
      rawItems = await adapter.fetch();
    } catch (e) {
      await this.recordSourceError(source.id, (e as Error).message);
      throw e;
    }

    // Freshness filter — only keep stories published within the window.
    // Items with no publishedAt are kept (some scraped sources lack a date);
    // items with a date OLDER than the cutoff are dropped. This is what stops
    // archive feeds dumping years of old posts.
    const freshnessHours =
      this.config.get<number>('aiQuickBytes.limits.freshnessHours') ?? 48;
    const cutoff = new Date(Date.now() - freshnessHours * 3600_000);
    const total = rawItems.length;
    rawItems = rawItems.filter(
      (r) => !r.publishedAt || r.publishedAt >= cutoff,
    );
    const dropped = total - rawItems.length;
    if (dropped > 0) {
      this.logger.log(
        `${source.name}: dropped ${dropped}/${total} as older than ${freshnessHours}h`,
      );
    }

    let saved = 0;
    for (const raw of rawItems) {
      const hash = this.computeHash(raw.title, raw.url);

      const existing = await this.itemRepo.findOne({ where: { contentHash: hash } });
      if (existing) continue;

      if (await this.dedup.isLikelyDuplicate(raw.title)) {
        this.logger.log(`Semantic duplicate skipped: ${raw.title}`);
        continue;
      }

      const item = await this.itemRepo.save(this.itemRepo.create({
        sourceId: source.id,
        title: raw.title.slice(0, 500),
        url: raw.url.slice(0, 2000),
        content: raw.content ?? null,
        summary: raw.summary ?? null,
        author: raw.author?.slice(0, 255) ?? null,
        publishedAt: raw.publishedAt ?? null,
        contentHash: hash,
        status: 'raw',
        metadata: raw.metadata ?? {},
      }));

      // Best-effort embedding for future semantic dedup. Never blocks ingestion.
      if (this.dedup) {
        try {
          const emb = await this.dedup.generateEmbedding(raw.title);
          await this.dedup.storeEmbedding(item.id, emb);
        } catch {
          /* embeddings optional */
        }
      }
      saved++;
    }

    await this.sourceRepo.update(sourceId, {
      lastFetchedAt: new Date(),
      errorCount: 0,
      lastError: null,
    });

    this.logger.log(
      `Source ${source.name}: ${saved} new / ${rawItems.length} fetched`,
    );
    return saved;
  }

  async fetchAllSources(): Promise<{ total: number; perSource: Record<string, number> }> {
    const sources = await this.sourceRepo.find({ where: { isActive: true } });
    const perSource: Record<string, number> = {};
    let total = 0;

    for (const source of sources) {
      try {
        const count = await this.fetchFromSource(source.id);
        perSource[source.name] = count;
        total += count;
      } catch (error) {
        this.logger.error(`Source ${source.name} failed: ${(error as Error).message}`);
        perSource[source.name] = -1;
      }
    }
    return { total, perSource };
  }

  private async recordSourceError(sourceId: string, message: string): Promise<void> {
    await this.sourceRepo
      .createQueryBuilder()
      .update(NewsSource)
      .set({
        lastError: message.slice(0, 1000),
        errorCount: () => '"errorCount" + 1',
      })
      .where('id = :id', { id: sourceId })
      .execute();
  }

  private computeHash(title: string, url: string): string {
    return createHash('sha256').update(`${title}|${url}`).digest('hex');
  }
}
