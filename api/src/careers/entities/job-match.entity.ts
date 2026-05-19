import {
  Entity, PrimaryGeneratedColumn, Column, Index, Unique, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { JobListing } from './job-listing.entity';

export type MatchStatus = 'matched' | 'saved' | 'dismissed' | 'applied';

/** A scored (user, job) pair. User status survives re-matching. */
@Entity('career_job_matches')
@Unique(['userId', 'jobListingId'])
@Index(['userId', 'status'])
export class JobMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  userId: string;

  @Column({ type: 'uuid' })
  jobListingId: string;

  @ManyToOne(() => JobListing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobListingId' })
  job: JobListing;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  matchScore: number;

  @Column({ type: 'numeric', precision: 6, scale: 4, nullable: true })
  similarity: number | null;

  @Column({ type: 'text', nullable: true })
  rationale: string | null;

  @Column({ type: 'varchar', length: 20, default: 'matched' })
  status: MatchStatus;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  computedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
