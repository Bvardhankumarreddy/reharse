import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { AiPulseScript } from './news-script.entity';

@Entity('ai_pulse_metrics')
@Index('idx_pulse_metrics_script_lang', ['script_id', 'language', 'fetched_at'])
export class AiPulseMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  script_id: string;

  @ManyToOne(() => AiPulseScript, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'script_id' })
  script: AiPulseScript;

  @Column({ type: 'varchar', length: 50 })
  youtube_video_id: string;

  @Column({ type: 'varchar', length: 8, default: 'en' })
  language: 'en' | 'te';

  @Column({ type: 'int', default: 0 })
  views: number;

  @Column({ type: 'int', nullable: true })
  likes: number | null;

  @Column({ type: 'int', nullable: true })
  comments: number | null;

  @CreateDateColumn({ name: 'fetched_at' })
  fetched_at: Date;
}
