import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export type InsightType =
  | 'best_time' | 'best_hashtags' | 'top_content'
  | 'underperforming' | 'platform_recommendation';

@Entity('social_insights')
export class SocialInsight {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  insightType: InsightType;

  @Column({ type: 'varchar', length: 50, nullable: true })
  platform: string | null;

  /** { finding, recommendation, supportingNumbers? } */
  @Column({ type: 'jsonb' })
  insightData: Record<string, unknown>;

  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0 })
  confidenceScore: number;

  @Column({ type: 'varchar', length: 20, default: 'claude' })
  generatedBy: string;

  @Column({ type: 'timestamptz' })
  dataPeriodStart: Date;

  @Column({ type: 'timestamptz' })
  dataPeriodEnd: Date;

  @Column({ type: 'boolean', default: true })
  isActionable: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  appliedAt: Date | null;

  @CreateDateColumn()
  generatedAt: Date;
}
