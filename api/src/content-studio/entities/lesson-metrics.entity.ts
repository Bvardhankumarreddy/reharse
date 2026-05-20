import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

@Entity('cs_lesson_metrics')
export class LessonMetrics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  lessonId: string;

  @Column({ type: 'varchar', length: 64 })
  youtubeVideoId: string;

  @Column({ type: 'bigint', default: 0 })
  views: number;

  @Column({ type: 'bigint', nullable: true })
  likes: number | null;

  @Column({ type: 'bigint', nullable: true })
  comments: number | null;

  /** Click-through rate from Analytics API (OAuth required). 0..1. */
  @Column({ type: 'numeric', precision: 6, scale: 4, nullable: true })
  ctr: number | null;

  @Column({ type: 'int', nullable: true })
  avgViewDurationSec: number | null;

  /** Retention as % (e.g. 42.5). Analytics API only. */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  retentionPct: number | null;

  @Column({ type: 'int', nullable: true })
  subscribersGained: number | null;

  @CreateDateColumn({ name: 'fetchedAt' })
  fetchedAt: Date;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  raw: Record<string, unknown>;
}
