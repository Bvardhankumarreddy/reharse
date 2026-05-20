import {
  Entity, PrimaryGeneratedColumn, Column, Index, Unique, CreateDateColumn,
} from 'typeorm';

@Entity('cs_competitor_videos')
@Unique(['competitorChannelId', 'externalId'])
export class CompetitorVideo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  competitorChannelId: string;

  @Column({ type: 'varchar', length: 64 })
  externalId: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'bigint', default: 0 })
  viewCount: number;

  @Column({ type: 'bigint', nullable: true })
  likeCount: number | null;

  @Column({ type: 'bigint', nullable: true })
  commentCount: number | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  raw: Record<string, unknown>;

  @CreateDateColumn({ name: 'fetchedAt' })
  fetchedAt: Date;
}
