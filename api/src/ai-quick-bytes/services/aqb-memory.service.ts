import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AqbMemory, AqbMemoryTask } from '../entities/aqb-memory.entity';

/**
 * Curated learning store for AQB. The 4 existing services (scoring, script,
 * thumbnail, distribution) each call `relevantFor(task)` and append the
 * formatted block to their prompts — so when there are no memories the
 * prompts are unchanged.
 */
@Injectable()
export class AqbMemoryService {
  private readonly logger = new Logger(AqbMemoryService.name);

  constructor(
    @InjectRepository(AqbMemory) private readonly repo: Repository<AqbMemory>,
  ) {}

  async relevantFor(task: AqbMemoryTask, limit = 8): Promise<AqbMemory[]> {
    return this.repo
      .createQueryBuilder('m')
      .where('m."isActive" = true')
      .andWhere(
        `(jsonb_array_length(m."appliesTo") = 0 OR m."appliesTo" @> :tag::jsonb)`,
        { tag: JSON.stringify([task]) },
      )
      .orderBy('m.weight', 'DESC')
      .addOrderBy('m."updatedAt"', 'DESC')
      .limit(limit)
      .getMany();
  }

  /** Pretty-print memories for inclusion in an LLM system prompt. */
  format(rows: AqbMemory[]): string {
    if (rows.length === 0) return '';
    const lines = rows.map((m) => `  • [${m.memoryType}] ${m.content}`);
    return [
      'WHAT WE\'VE LEARNED FROM PAST PERFORMANCE (lean into these):',
      ...lines,
    ].join('\n');
  }

  async list(): Promise<AqbMemory[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { weight: 'DESC', updatedAt: 'DESC' },
      take: 50,
    });
  }

  /** Add a memory if no active one already has the same content+type (dedupe). */
  async promoteUnique(
    memoryType: AqbMemory['memoryType'],
    content: string,
    appliesTo: AqbMemoryTask[],
    weight = 2,
  ): Promise<AqbMemory | null> {
    const existing = await this.repo.findOne({
      where: { memoryType, content, isActive: true },
    });
    if (existing) return null;
    return this.repo.save(
      this.repo.create({
        memoryType,
        content: content.slice(0, 600),
        weight,
        appliesTo,
        isActive: true,
      }),
    );
  }

  async deactivate(id: string): Promise<void> {
    await this.repo.update(id, { isActive: false });
  }
}
