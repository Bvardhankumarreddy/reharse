import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique,
} from 'typeorm';
import type { SocialPlatform } from './social-post.entity';

/** Weekly audience demographics snapshot per platform.
 *  Phase 5: only Instagram is wired (LinkedIn requires Marketing Dev Platform tier). */
@Entity('audience_snapshots')
@Unique('uq_audience_per_week', ['platform', 'snapshotDate'])
export class AudienceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  platform: SocialPlatform;

  @Column({ type: 'date' })
  snapshotDate: string;

  /** Total followers / subscribers / connections at snapshot time */
  @Column({ type: 'int', default: 0 })
  totalAudience: number;

  /** Age buckets as { "13-17": pct, "18-24": pct, ... } */
  @Column({ type: 'jsonb', default: {} })
  ageBuckets: Record<string, number>;

  /** Gender breakdown as { male: pct, female: pct, unknown: pct } */
  @Column({ type: 'jsonb', default: {} })
  gender: Record<string, number>;

  /** Top countries as { "US": pct, "IN": pct, ... } */
  @Column({ type: 'jsonb', default: {} })
  topCountries: Record<string, number>;

  /** Top cities as { "Mumbai": pct, "Bangalore": pct, ... } */
  @Column({ type: 'jsonb', default: {} })
  topCities: Record<string, number>;

  @Column({ type: 'jsonb', nullable: true })
  rawData: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
