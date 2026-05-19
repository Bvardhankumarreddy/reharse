import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

export type AgentType =
  | 'strategy' | 'script' | 'ppt' | 'quiz' | 'seo' | 'promo' | 'thumbnail';

/** One LLM call's cost/latency/outcome — the cost + audit trail. */
@Entity('cs_agent_runs')
export class AgentRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  planId: string | null;

  @Column({ type: 'uuid', nullable: true })
  lessonId: string | null;

  @Column({ type: 'varchar', length: 40 })
  agentType: AgentType;

  @Column({ type: 'varchar', length: 30, nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @Column({ type: 'int', default: 0 })
  promptTokens: number;

  @Column({ type: 'int', default: 0 })
  completionTokens: number;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  costUsd: number;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'varchar', length: 20, default: 'success' })
  status: 'success' | 'failed';

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
