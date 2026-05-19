import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type AtsPlatform = 'greenhouse' | 'lever' | 'ashby';

/** A company whose ATS public job board we poll. */
@Entity('career_companies')
export class CareerCompany {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  atsPlatform: AtsPlatform;

  /** Slug in the ATS public job-board URL. */
  @Column({ type: 'varchar', length: 255 })
  boardToken: string;

  @Index()
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** seed | user_target */
  @Column({ type: 'varchar', length: 20, default: 'seed' })
  source: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastFetchedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'int', default: 0 })
  errorCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
