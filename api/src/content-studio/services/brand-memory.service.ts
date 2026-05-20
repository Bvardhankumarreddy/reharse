import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandMemory } from '../entities/brand-memory.entity';
import { AgentType } from '../entities/agent-run.entity';
import { OpenAIEmbeddingService } from './openai-embedding.service';

/**
 * Memory injection v2 — return only the memories relevant to the agent
 * making the call. A memory with an empty `appliesTo` array applies to ALL
 * agents (backward compatible with v1 rows).
 *
 * Phase D adds:
 *  - embedOnSave(): compute + persist a 1536-d embedding for new memories
 *    (raw SQL — TypeORM has no vector type, mirrors AQB/careers pattern).
 *  - semanticRelevantFor(): pgvector top-K against a query text, still
 *    filtered by isActive + appliesTo. Falls back to weight-sorted
 *    relevantFor() when no embeddings exist yet.
 */
@Injectable()
export class BrandMemoryService {
  private readonly logger = new Logger(BrandMemoryService.name);

  constructor(
    @InjectRepository(BrandMemory) private readonly repo: Repository<BrandMemory>,
    private readonly emb: OpenAIEmbeddingService,
  ) {}

  async relevantFor(brandId: string, agentType: AgentType): Promise<BrandMemory[]> {
    return this.repo
      .createQueryBuilder('m')
      .where('m."brandId" = :brandId', { brandId })
      .andWhere('m."isActive" = true')
      .andWhere(
        `(jsonb_array_length(m."appliesTo") = 0 OR m."appliesTo" @> :tag::jsonb)`,
        { tag: JSON.stringify([agentType]) },
      )
      .orderBy('m.weight', 'DESC')
      .getMany();
  }

  /** Format the memory block for an LLM prompt (deterministic, ordered). */
  format(memories: BrandMemory[]): string {
    if (memories.length === 0) return '(no brand memories yet)';
    return memories.map((m) => `- [${m.memoryType}] ${m.content}`).join('\n');
  }

  /** Embed and persist for a new/changed memory. Best-effort. */
  async embedOnSave(memoryId: string, content: string): Promise<void> {
    if (!this.emb.isConfigured()) return;
    try {
      const vec = await this.emb.embed(content);
      if (!vec) return;
      const literal = `[${vec.join(',')}]`;
      await this.repo.query(
        `UPDATE cs_brand_memories SET embedding = $1::vector WHERE id = $2`,
        [literal, memoryId],
      );
    } catch (e) {
      this.logger.warn(`Memory embed failed: ${(e as Error).message}`);
    }
  }

  /**
   * Phase D: pgvector top-K against a query text. Filtered by brand, active,
   * applies-to. Returns BrandMemory rows ordered by similarity. Falls back
   * to the v2 weight-sorted list if either embeddings aren't configured or
   * the candidate pool has no embeddings yet.
   */
  async semanticRelevantFor(
    brandId: string, agentType: AgentType, queryText: string, topK = 6,
  ): Promise<BrandMemory[]> {
    if (!this.emb.isConfigured()) return this.relevantFor(brandId, agentType);
    let qvec: number[] | null;
    try {
      qvec = await this.emb.embed(queryText);
    } catch {
      return this.relevantFor(brandId, agentType);
    }
    if (!qvec) return this.relevantFor(brandId, agentType);
    const literal = `[${qvec.join(',')}]`;
    const rows: Array<{ id: string }> = await this.repo.query(
      `
      SELECT id
        FROM cs_brand_memories
       WHERE "brandId" = $1
         AND "isActive" = true
         AND embedding IS NOT NULL
         AND (jsonb_array_length("appliesTo") = 0 OR "appliesTo" @> $2::jsonb)
       ORDER BY embedding <=> $3::vector
       LIMIT $4
      `,
      [brandId, JSON.stringify([agentType]), literal, topK],
    );
    if (rows.length === 0) return this.relevantFor(brandId, agentType);
    const ids = rows.map((r) => r.id);
    const fetched = await this.repo.find({ where: ids.map((id) => ({ id })) });
    // Preserve cosine-distance order.
    const order = new Map(ids.map((id, i) => [id, i]));
    fetched.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return fetched;
  }
}
