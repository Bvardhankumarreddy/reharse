import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NewsItem } from '../entities/news-item.entity';
import { OpenAIClientService } from './openai-client.service';

@Injectable()
export class DedupService {
  private readonly logger = new Logger(DedupService.name);

  constructor(
    @InjectRepository(NewsItem)
    private readonly itemRepo: Repository<NewsItem>,
    private readonly openai: OpenAIClientService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Returns true if a semantically-similar item was ingested in the last 7
   * days (cosine similarity ≥ threshold). Falls back to "not duplicate" if
   * embeddings are unavailable so ingestion never hard-blocks on OpenAI.
   */
  async isLikelyDuplicate(title: string): Promise<boolean> {
    if (!this.openai.isConfigured()) return false;

    let embedding: number[];
    try {
      embedding = await this.generateEmbedding(title);
    } catch (e) {
      this.logger.warn(`Embedding failed, skipping semantic dedup: ${(e as Error).message}`);
      return false;
    }

    const threshold = this.config.get<number>(
      'aiQuickBytes.limits.duplicateSimilarityThreshold',
    ) ?? 0.85;

    const vectorLiteral = `[${embedding.join(',')}]`;
    const rows = await this.itemRepo.query(
      `SELECT id, title, 1 - (embedding <=> $1::vector) AS similarity
         FROM aqb_news_items
        WHERE embedding IS NOT NULL
          AND "fetchedAt" > NOW() - INTERVAL '7 days'
        ORDER BY embedding <=> $1::vector
        LIMIT 1`,
      [vectorLiteral],
    );

    if (rows.length > 0 && Number(rows[0].similarity) >= threshold) {
      this.logger.log(
        `Semantic duplicate (${Number(rows[0].similarity).toFixed(3)}): "${title}" ~ "${rows[0].title}"`,
      );
      return true;
    }
    return false;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const model = this.config.get<string>('aiQuickBytes.openai.embeddingModel')
      ?? 'text-embedding-3-small';
    const res = await this.openai.getClient().embeddings.create({
      model,
      input: text.slice(0, 8000),
    });
    return res.data[0].embedding;
  }

  /** Persist the embedding for an item (raw SQL — TypeORM has no vector type). */
  async storeEmbedding(itemId: string, embedding: number[]): Promise<void> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    await this.itemRepo.query(
      `UPDATE aqb_news_items SET embedding = $1::vector WHERE id = $2`,
      [vectorLiteral, itemId],
    );
  }
}
