import {
  Entity, PrimaryGeneratedColumn, Column, Index, OneToMany,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Lesson } from './lesson.entity';

export type PlanStatus = 'planned' | 'generating' | 'ready' | 'failed';

export type PlanApprovalStatus = 'pending' | 'approved' | 'rejected';

@Entity('cs_weekly_content_plans')
export class WeeklyContentPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  brandId: string;

  @Column({ type: 'uuid', nullable: true })
  channelId: string | null;

  @Column({ type: 'date' })
  weekOf: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  theme: string | null;

  @Column({ type: 'text', nullable: true })
  quizScope: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 30, default: 'planned' })
  status: PlanStatus;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  totalCostUsd: number;

  /** Phase E: optional link to a multi-week series. Null = standalone week. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  seriesId: string | null;

  @Column({ type: 'int', nullable: true })
  seriesWeekNumber: number | null;

  /**
   * Last quiz toughness level (1-5) used when generating this plan's pool.
   * 0 = never generated. Each regeneration defaults to last+1 (capped at 5).
   */
  @Column({ type: 'int', default: 0 })
  quizToughness: number;

  /** Curator gate — pipeline can't run until this is 'approved'. */
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  approvalStatus: PlanApprovalStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  approvalNote: string | null;

  @OneToMany(() => Lesson, (l) => l.plan)
  lessons: Lesson[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
