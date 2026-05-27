import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type AqbMemoryType =
  | 'hook' | 'style' | 'thumbnail_style' | 'topic' | 'hashtag' | 'do' | 'dont';

export type AqbMemoryTask =
  | 'scoring' | 'script' | 'thumbnail' | 'distribution';

/**
 * Learned patterns promoted from postmortems / improvement sweeps. Each
 * memory is routed to one or more task types via `appliesTo` — the matching
 * services read them and append a "what we've learned" block to their prompts.
 */
@Entity('aqb_memories')
export class AqbMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 40 })
  memoryType: AqbMemoryType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', default: 1 })
  weight: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  appliesTo: AqbMemoryTask[];

  @Index()
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
