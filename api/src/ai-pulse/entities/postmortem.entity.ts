import {
  Entity, PrimaryGeneratedColumn, Column, Unique, Index,
  CreateDateColumn,
} from 'typeorm';
import { AiPulseVertical } from './news-item.entity';

export interface AiPulsePostmortemContent {
  worked?: string[];
  didntWork?: string[];
  next?: string[];
  reusableHookPattern?: string;
  winningThumbnailStyle?: string;
  topicSignal?: string;
  winningHashtags?: string[];
}

@Entity('ai_pulse_postmortems')
@Unique('uq_pulse_postmortem_script', ['script_id'])
export class AiPulsePostmortem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  script_id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  vertical: AiPulseVertical;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  content: AiPulsePostmortemContent;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model_used: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0 })
  cost_usd: number;

  @CreateDateColumn()
  created_at: Date;
}
