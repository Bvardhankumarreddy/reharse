import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { WeeklyContentPlan } from './weekly-content-plan.entity';

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

  @Column({ type: 'varchar', length: 30, default: 'planned' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
