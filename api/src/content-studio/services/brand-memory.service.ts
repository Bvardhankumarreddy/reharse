import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandMemory } from '../entities/brand-memory.entity';
import { AgentType } from '../entities/agent-run.entity';

/**
 * Memory injection v2 — return only the memories relevant to the agent
 * making the call. A memory with an empty `appliesTo` array applies to ALL
 * agents (backward compatible with v1 rows).
 */
@Injectable()
export class BrandMemoryService {
  constructor(
    @InjectRepository(BrandMemory) private readonly repo: Repository<BrandMemory>,
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
}
