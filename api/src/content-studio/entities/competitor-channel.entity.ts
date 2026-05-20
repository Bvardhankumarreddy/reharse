import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('cs_competitor_channels')
export class CompetitorChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  brandId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  channelHandle: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  youtubeChannelId: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastFetchedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'int', default: 0 })
  errorCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
