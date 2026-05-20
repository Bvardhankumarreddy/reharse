import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import type { PipelineStage } from './pipeline-run.entity';

export type DlqStatus = 'pending' | 'retried' | 'abandoned';

/** What we stash on every pipeline-stage failure so a human can triage. */
export interface PipelineFailurePayload {
  runId: string;
  planId: string;
  stage: PipelineStage;
}

@Entity('cs_dead_letter_jobs')
export class DeadLetterJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** e.g. 'pipeline-stage-failure' */
  @Index()
  @Column({ type: 'varchar', length: 60 })
  jobType: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload: PipelineFailurePayload | Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: DlqStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
