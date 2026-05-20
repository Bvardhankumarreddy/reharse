import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type AssetType =
  | 'script' | 'ppt' | 'seo' | 'promo' | 'thumbnail_prompt' | 'quiz_pool';

/** Versioned output of one agent (script, ppt JSON, etc.). */
@Entity('cs_content_assets')
export class ContentAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  planId: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  lessonId: string | null;

  @Column({ type: 'varchar', length: 40 })
  assetType: AssetType;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'jsonb', nullable: true })
  content: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  storageKey: string | null;

  @Column({ type: 'int', nullable: true })
  qualityScore: number | null;

  /** How many grade-revise passes happened before this version was kept. */
  @Column({ type: 'int', default: 0 })
  revisions: number;

  /** Last critique from the Grader (null if it passed first try or wasn't graded). */
  @Column({ type: 'text', nullable: true })
  critique: string | null;

  /** 0–1 confidence: grader + memory-match + revision-count blend. */
  @Column({ type: 'numeric', precision: 3, scale: 2, nullable: true })
  confidence: number | null;

  @Column({ type: 'varchar', length: 30, default: 'draft' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
