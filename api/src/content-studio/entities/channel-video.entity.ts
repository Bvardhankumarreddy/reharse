import {
  Entity, PrimaryGeneratedColumn, Column, Index, Unique,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * A video from the brand's OWN YouTube channel (back catalog). Populated by
 * ChannelVideoFetcherService from the channel's uploads playlist. Used for
 * "what's working" insights + fed into the Strategy + Improvement agents.
 * NOTE: bigint columns come back as strings from the pg driver — coerce with
 * Number() before arithmetic.
 */
@Entity('cs_channel_videos')
@Unique(['brandId', 'externalId'])
export class ChannelVideo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  brandId: string;

  @Column({ type: 'uuid', nullable: true })
  channelId: string | null;

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

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  fetchedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
