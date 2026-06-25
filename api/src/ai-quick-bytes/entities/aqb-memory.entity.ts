import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type AqbMemoryType =
  | 'hook' | 'style' | 'thumbnail_style' | 'topic' | 'hashtag' | 'do' | 'dont'
  // Scene-generator patterns mined from postmortems of videos that included
  // cinematic scenes — e.g. "opening close-up beats wide establishing",
  // "12-14 scenes wins", "multi-character (2-3) beats single-character".
  | 'scene_pattern'
  // Patterns mined from the DIFF between LLM-generated title/description
  // and what the curator actually published on YouTube. Captures the
  // human's editorial fingerprint (verb swaps, shortened brand names,
  // added em-dash hooks, restructured descriptions) so the next gen
  // pre-applies them. Fed into both script + distribution prompts.
  | 'edit_pattern';

export type AqbMemoryTask =
  | 'scoring' | 'script' | 'thumbnail' | 'distribution'
  // Scene generator reads memories tagged with 'scene' before emitting
  // the per-scene JSON payload.
  | 'scene';

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
