import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('cs_channels')
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  brandId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, default: 'youtube' })
  platform: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  channelUrl: string | null;

  /** YouTube channel id (UC…) + handle (@…) for back-catalog ingestion. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  youtubeChannelId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  youtubeHandle: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cadence: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
