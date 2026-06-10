import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';
import { AiPulseVertical } from './news-item.entity';

export type AiPulseMemoryType =
  | 'hook_pattern'
  | 'topic_signal'
  | 'hashtag'
  | 'thumbnail_style'
  | 'dont';

export type AiPulseMemoryScope = 'script' | 'thumbnail' | 'distribution';

@Entity('ai_pulse_memories')
@Index('idx_pulse_memory_vertical_type', ['vertical', 'memory_type', 'is_active'])
export class AiPulseMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  vertical: AiPulseVertical;

  @Column({ type: 'varchar', length: 50 })
  memory_type: AiPulseMemoryType;

  @Column({ type: 'text' })
  content: string;

  /** Script IDs that supported promoting this memory. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  evidence: string[];

  /** Which agents read this memory at gen-time. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  applies_to: AiPulseMemoryScope[];

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;
}
