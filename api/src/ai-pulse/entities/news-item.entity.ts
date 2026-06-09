import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, Unique,
} from 'typeorm';

export type AiPulseVertical =
  | 'ai_business'
  | 'tech_industry'
  | 'ai_science'
  | 'ai_education'
  | 'ai_society';

export type AiPulseNewsStatus =
  | 'pending' | 'scored' | 'selected' | 'rejected' | 'processed';

@Entity('ai_pulse_news_items')
@Unique('uq_pulse_news_source_extid', ['source_name', 'external_id'])
export class AiPulseNewsItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  vertical: AiPulseVertical;

  @Column({ type: 'varchar', length: 100 })
  source_name: string;

  @Column({ type: 'varchar', length: 2000 })
  source_url: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  source_type: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  external_id: string | null;

  @Column({ type: 'text' })
  headline: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  author: string | null;

  @Column({ type: 'timestamp', nullable: true })
  published_at: Date | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  thumbnail_url: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  entities: Array<{ kind: string; value: string }>;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  relevance_score: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  freshness_score: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  india_relevance_score: number | null;

  @Index()
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  total_score: number | null;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: AiPulseNewsStatus;

  @Column({ type: 'uuid', nullable: true })
  duplicate_of: string | null;

  @CreateDateColumn({ name: 'ingested_at' })
  ingested_at: Date;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
