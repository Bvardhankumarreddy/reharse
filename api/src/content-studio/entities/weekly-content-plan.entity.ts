import {
  Entity, PrimaryGeneratedColumn, Column, Index, OneToMany,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Lesson } from './lesson.entity';

export type PlanStatus = 'planned' | 'generating' | 'ready' | 'failed';

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

  @OneToMany(() => Lesson, (l) => l.plan)
  lessons: Lesson[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
