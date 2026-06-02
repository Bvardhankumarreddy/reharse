import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { ShortScript } from './short-script.entity';

/**
 * Post-publish YouTube performance snapshot for an AQB short. Populated by
 * AqbMetricsFetcherService (hourly cron). bigint columns return as strings
 * from the pg driver — coerce with Number() before arithmetic.
 */
@Entity('aqb_short_metrics')
export class AqbShortMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  scriptId: string;

  @ManyToOne(() => ShortScript, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scriptId' })
  script: ShortScript;

  @Column({ type: 'varchar', length: 64 })
  youtubeVideoId: string;

  /**
   * Which language video this snapshot belongs to. 'en' for the primary
   * English upload (script.youtubeVideoId), 'te' for the Telugu upload
   * (script.teluguYoutubeVideoId). Defaults 'en' so legacy rows stay
   * correct under the new schema.
   */
  @Index()
  @Column({ type: 'varchar', length: 8, default: 'en' })
  language: 'en' | 'te';

  @Column({ type: 'bigint', default: 0 })
  views: number;

  @Column({ type: 'bigint', nullable: true })
  likes: number | null;

  @Column({ type: 'bigint', nullable: true })
  comments: number | null;

  @Index()
  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  fetchedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
