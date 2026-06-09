import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { AiPulseVertical } from './news-item.entity';

@Entity('ai_pulse_vertical_config')
export class AiPulseVerticalConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  vertical: AiPulseVertical;

  @Column({ type: 'varchar', length: 255, nullable: true })
  display_name: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', nullable: true })
  day_of_week: number | null;

  @Column({ type: 'time', nullable: true })
  publish_time: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  avatar_id_english: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  avatar_id_telugu: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  voice_id_english: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  voice_id_telugu: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  brand_color: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  accent_color: string | null;

  @Column({ type: 'jsonb', nullable: true })
  tone_keywords: string[] | null;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
