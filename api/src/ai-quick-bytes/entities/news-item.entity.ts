import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToOne,
} from 'typeorm';
import { NewsSource } from './news-source.entity';
import { NewsScore } from './news-score.entity';

export type NewsItemStatus =
  | 'raw' | 'scored' | 'scripted' | 'approved'
  | 'generating' | 'ready' | 'published' | 'rejected' | 'failed';

@Entity('aqb_news_items')
export class NewsItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  sourceId: string | null;

  @ManyToOne(() => NewsSource, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'sourceId' })
  source: NewsSource;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'varchar', length: 2000 })
  url: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  author: string | null;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  fetchedAt: Date;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  contentHash: string;

  // NOTE: the `embedding vector(1536)` column exists in the DB (created by
  // migration-001) but is intentionally NOT declared here — TypeORM has no
  // pgvector type and would fight schema-sync. DedupService reads/writes it
  // exclusively via raw SQL.

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'raw' })
  status: NewsItemStatus;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  topicTags: string[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @OneToOne(() => NewsScore, (s) => s.newsItem)
  score: NewsScore | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
