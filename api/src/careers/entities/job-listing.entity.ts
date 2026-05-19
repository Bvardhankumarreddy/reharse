import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { CareerCompany } from './career-company.entity';

export type JobStatus = 'active' | 'expired';

/**
 * A single job opening. `embedding vector(1536)` exists in the DB but is NOT
 * declared here — TypeORM has no pgvector type, so it is read/written via raw
 * SQL (mirrors AI Quick Bytes' NewsItem).
 */
@Entity('career_job_listings')
export class JobListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @ManyToOne(() => CareerCompany, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'companyId' })
  companyRef: CareerCompany | null;

  /** ats | aggregator */
  @Column({ type: 'varchar', length: 20 })
  sourceType: string;

  /** greenhouse | lever | ashby | adzuna */
  @Column({ type: 'varchar', length: 40 })
  source: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId: string | null;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  company: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ type: 'boolean', default: false })
  remote: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  seniority: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  employmentType: string | null;

  @Column({ type: 'varchar', length: 2000 })
  applyUrl: string;

  @Column({ type: 'timestamptz', nullable: true })
  postedAt: Date | null;

  @Index()
  @Column({ type: 'varchar', length: 64, unique: true })
  contentHash: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: JobStatus;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
