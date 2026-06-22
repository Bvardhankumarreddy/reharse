import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

export type MemoryType =
  | 'voice' | 'style' | 'hook' | 'structure' | 'do' | 'dont'
  | 'title_pattern' | 'tag_pattern'   // SEO miner output (Improvement Agent)
  // Cinematic scene patterns mined from lesson postmortems — e.g.
  // "10-13 scenes per lesson wins", "open chapters with close-up of hands".
  // Per brand; consumed by the scene agent via brand-memory.relevantFor('scene').
  | 'scene_pattern';

/** Reusable brand voice/style/pattern fed into agent prompts. */
@Entity('cs_brand_memories')
export class BrandMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  brandId: string;

  @Column({ type: 'varchar', length: 30 })
  memoryType: MemoryType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'numeric', precision: 4, scale: 2, default: 1 })
  weight: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Memory injection v2 — agent types this memory applies to. Empty array
   * = applies to all agents (backward compatible). Values mirror AgentType.
   */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  appliesTo: string[];

  @CreateDateColumn()
  createdAt: Date;
}
