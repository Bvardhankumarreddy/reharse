import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { ShortScript } from './short-script.entity';

export type PublishPlatform = 'youtube' | 'instagram' | 'linkedin';
export type PublishStatus = 'pending' | 'success' | 'failed';

@Entity('aqb_publishing_log')
export class PublishingLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  scriptId: string;

  @ManyToOne(() => ShortScript, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scriptId' })
  script: ShortScript;

  @Column({ type: 'varchar', length: 50 })
  platform: PublishPlatform;

  @Column({ type: 'varchar', length: 50 })
  status: PublishStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  externalUrl: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  scheduledFor: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
