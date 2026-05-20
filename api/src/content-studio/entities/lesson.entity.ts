import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { WeeklyContentPlan } from './weekly-content-plan.entity';
import type { LessonFormat } from './content-series.entity';

export interface OutlineSection {
  heading: string;
  points: string[];
}

@Entity('cs_lessons')
export class Lesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => WeeklyContentPlan, (p) => p.lessons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planId' })
  plan: WeeklyContentPlan;

  @Column({ type: 'int' })
  lessonNumber: number;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  hook: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  outline: OutlineSection[];

  @Column({ type: 'int', default: 10 })
  targetDurationMinutes: number;

  /** Phase E: lesson "shape" — lecture / live_coding / walkthrough / interview / short. */
  @Column({ type: 'varchar', length: 30, default: 'lecture' })
  lessonFormat: LessonFormat;

  @Column({ type: 'varchar', length: 30, default: 'planned' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
