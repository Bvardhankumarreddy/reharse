import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { NewsItem } from './news-item.entity';

@Entity('aqb_news_scores')
export class NewsScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  newsItemId: string;

  @OneToOne(() => NewsItem, (i) => i.score, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'newsItemId' })
  newsItem: NewsItem;

  @Column({ type: 'int' })
  importanceScore: number;

  @Column({ type: 'int' })
  noveltyScore: number;

  @Column({ type: 'int' })
  viralPotential: number;

  /**
   * Postgres GENERATED ALWAYS column — computed by the DB, never written by
   * the app. Marked insert/update false so TypeORM doesn't try to set it.
   */
  @Index()
  @Column({
    type: 'int',
    insert: false,
    update: false,
    select: true,
  })
  compositeScore: number;

  @Column({ type: 'text', nullable: true })
  reasoning: string | null;

  @Column({ type: 'varchar', length: 100, default: 'gpt-4o-mini' })
  modelUsed: string;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  costUsd: number | null;

  @CreateDateColumn()
  scoredAt: Date;
}
