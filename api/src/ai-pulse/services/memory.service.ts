import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import {
  AiPulseMemory, AiPulseMemoryType, AiPulseMemoryScope,
} from '../entities/memory.entity';
import { AiPulseVertical } from '../entities/news-item.entity';

@Injectable()
export class AiPulseMemoryService {
  private readonly logger = new Logger(AiPulseMemoryService.name);

  constructor(
    @InjectRepository(AiPulseMemory)
    private readonly memories: Repository<AiPulseMemory>,
  ) {}

  /**
   * Insert a memory if no semantically-equivalent one exists yet for
   * the same (vertical, memory_type). Equivalence is checked by a
   * normalized content hash so trivial rewording is deduped.
   * Returns the new memory or null if it was already known.
   */
  async promoteUnique(
    vertical: AiPulseVertical,
    memoryType: AiPulseMemoryType,
    content: string,
    appliesTo: AiPulseMemoryScope[],
    evidence: string[] = [],
  ): Promise<AiPulseMemory | null> {
    const trimmed = content.trim();
    if (!trimmed) return null;
    const hash = this.contentHash(trimmed);

    const existing = await this.memories
      .createQueryBuilder('m')
      .where('m.vertical = :v', { v: vertical })
      .andWhere('m.memory_type = :t', { t: memoryType })
      .andWhere('m.is_active = true')
      .getMany();
    const dup = existing.find((m) => this.contentHash(m.content) === hash);
    if (dup) {
      // Top up the evidence on the existing memory so the more it's
      // seen, the stronger the signal. De-dup evidence script IDs.
      const merged = Array.from(new Set([...(dup.evidence ?? []), ...evidence]));
      if (merged.length !== (dup.evidence?.length ?? 0)) {
        await this.memories.update(dup.id, { evidence: merged });
      }
      return null;
    }
    const saved = await this.memories.save(
      this.memories.create({
        vertical, memory_type: memoryType, content: trimmed,
        evidence, applies_to: appliesTo, is_active: true,
      }),
    );
    this.logger.log(`Promoted ${memoryType} for ${vertical}: "${trimmed.slice(0, 60)}…"`);
    return saved;
  }

  /**
   * Return active memories for one vertical that apply to a given
   * scope (script / thumbnail / distribution). Newest first.
   */
  async relevantFor(
    vertical: AiPulseVertical, scope: AiPulseMemoryScope, limit = 8,
  ): Promise<AiPulseMemory[]> {
    return this.memories
      .createQueryBuilder('m')
      .where('m.vertical = :v', { v: vertical })
      .andWhere('m.is_active = true')
      .andWhere(`m.applies_to::jsonb @> :scope::jsonb`, { scope: JSON.stringify([scope]) })
      .orderBy('m.created_at', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Format memories as a tight markdown block to inject into an LLM
   * user prompt. Empty memories → empty string (caller skips the block).
   */
  format(memories: AiPulseMemory[]): string {
    if (memories.length === 0) return '';
    const byType: Record<string, string[]> = {};
    for (const m of memories) {
      (byType[m.memory_type] ??= []).push(`- ${m.content}`);
    }
    const lines: string[] = ['LEARNED PATTERNS FROM PAST WINNERS (obey verbatim):'];
    for (const [type, items] of Object.entries(byType)) {
      lines.push(`[${type}]`);
      lines.push(...items);
    }
    return lines.join('\n');
  }

  private contentHash(s: string): string {
    const norm = s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return createHash('sha1').update(norm).digest('hex').slice(0, 16);
  }
}
