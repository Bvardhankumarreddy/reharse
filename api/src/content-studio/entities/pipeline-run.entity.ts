import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type PipelineStage =
  | 'script' | 'ppt' | 'seo' | 'thumbnail' | 'promo' | 'quiz' | 'draw';
export type PipelineStatus =
  | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface StageFailure {
  stage: PipelineStage;
  error: string;
  at: string;
}

/** One end-to-end orchestrated run of a weekly plan's downstream agents. */
@Entity('cs_pipeline_runs')
export class PipelineRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  planId: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'queued' })
  status: PipelineStatus;

  @Column({ type: 'varchar', length: 20, nullable: true })
  currentStage: PipelineStage | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  stagesCompleted: PipelineStage[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  stagesFailed: StageFailure[];

  /** Where a Resume should restart from after a failure. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  resumableFrom: PipelineStage | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  costAtStart: number;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  costDelta: number;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  'script', 'ppt', 'seo', 'thumbnail', 'promo', 'quiz', 'draw',
];
