import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { NewsItem } from './news-item.entity';
import { ThumbnailVariation } from '../dto/distribution-package.dto';

export type ScriptStatus =
  | 'draft' | 'approved' | 'rejected'
  | 'generating' | 'ready' | 'published' | 'failed';

export type AvatarKey = 'cyber' | 'robot' | 'vardhan';

@Entity('aqb_short_scripts')
export class ShortScript {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Sequential "Day N of AI Quick Bytes". Assigned at generation time. */
  @Index()
  @Column({ type: 'int', nullable: true })
  dayNumber: number | null;

  @Index()
  @Column({ type: 'uuid' })
  newsItemId: string;

  @ManyToOne(() => NewsItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'newsItemId' })
  newsItem: NewsItem;

  @Column({ type: 'text' })
  hook: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'text' })
  cta: string;

  @Column({ type: 'text' })
  fullScript: string;

  @Column({ type: 'int', nullable: true })
  durationEstimateSeconds: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  avatarId: AvatarKey | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  voiceId: string | null;

  @Column({ type: 'int', nullable: true })
  brandVoiceScore: number | null;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status: ScriptStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  heygenVideoId: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  heygenVideoUrl: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  youtubeVideoId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  youtubeUrl: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  costUsd: number | null;

  // ── Thumbnail prompts (3 MrBeast-style variations the host picks from) ──
  // jsonb — legacy rows may hold the old { prompt, overlayText } shape.
  @Column({ type: 'jsonb', nullable: true })
  thumbnailPrompt:
    | { variations: ThumbnailVariation[] }
    | { prompt: string; overlayText: string } // legacy single
    | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  thumbnailCostUsd: number;

  @Column({ type: 'timestamptz', nullable: true })
  thumbnailGeneratedAt: Date | null;

  // ── Distribution package (5-platform posts) ──────────────────────────
  @Column({ type: 'jsonb', nullable: true })
  distributionPackage: Record<string, unknown> | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  distributionCostUsd: number;

  @Column({ type: 'timestamptz', nullable: true })
  distributionGeneratedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
