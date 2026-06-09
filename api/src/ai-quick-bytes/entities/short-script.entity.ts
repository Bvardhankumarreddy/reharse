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

  // ── Live YouTube snippet (auto-refreshed by the metrics fetcher) ───
  // Captures manual title / description edits the curator made on
  // YouTube Studio after upload. Postmortem + improvement agents
  // prefer these over the LLM-generated values when present.
  @Column({ type: 'text', nullable: true })
  liveYoutubeTitle: string | null;

  @Column({ type: 'text', nullable: true })
  liveYoutubeDescription: string | null;

  @Column({ type: 'timestamp', nullable: true })
  liveYoutubeFetchedAt: Date | null;

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

  // ── Telugu auto-translation track (migration-003) ───────────────────
  // Translated by gpt-4o post-save (non-fatal). On approval a Telugu
  // HeyGen video is queued in parallel with the English one — the
  // webhook matches against teluguHeygenVideoId to update the right
  // status column.
  @Column({ type: 'text', nullable: true })
  teluguHook: string | null;

  @Column({ type: 'text', nullable: true })
  teluguBody: string | null;

  @Column({ type: 'text', nullable: true })
  teluguCta: string | null;

  @Column({ type: 'text', nullable: true })
  teluguFullScript: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  teluguTranslationModel: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  teluguTranslationCostUsd: number;

  @Column({ type: 'timestamptz', nullable: true })
  teluguTranslatedAt: Date | null;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  teluguHeygenVideoId: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  teluguHeygenVideoUrl: string | null;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'pending' })
  teluguHeygenStatus: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  teluguYoutubeVideoId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  teluguYoutubeUrl: string | null;

  // Live YouTube snippet for the Telugu upload (parallel to English above).
  @Column({ type: 'text', nullable: true })
  liveTeluguYoutubeTitle: string | null;

  @Column({ type: 'text', nullable: true })
  liveTeluguYoutubeDescription: string | null;

  @Column({ type: 'timestamp', nullable: true })
  liveTeluguYoutubeFetchedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  teluguDistributionPackage: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
