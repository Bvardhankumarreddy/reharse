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

  @Column({ type: 'varchar', length: 30, default: 'draft' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
