import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { AiPulseNewsItem, AiPulseVertical } from './news-item.entity';

export type AiPulseApprovalStatus =
  | 'pending_review' | 'approved' | 'rejected' | 'published';

export type AiPulseVideoStatus =
  | 'pending' | 'queued' | 'processing' | 'ready' | 'failed';

export interface AiPulseThumbnailPrompt {
  style: string;
  headline: string;
  prompt: string;
  source_badge: string;   // mandatory: "via [Source Name]"
}

export interface AiPulseDistributionPackage {
  youtube?: {
    title: string;
    description: string;     // must include full source URL
    tags: string[];
    pinned_comment: string;  // must include full source URL
  };
  instagram?: {
    caption: string;
    hashtags: string[];
    full_text: string;       // must include full source URL
    pinned_comment: string;
  };
  linkedin?: {
    body: string;
    hashtags: string[];
    full_text: string;       // must include full source URL
  };
  whatsapp_channel?: { full_text: string };
  whatsapp_status?:  { full_text: string };
  source_reference: {        // mandatory metadata
    name: string;
    url: string;
  };
}

@Entity('ai_pulse_scripts')
export class AiPulseScript {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  news_item_id: string;

  @ManyToOne(() => AiPulseNewsItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'news_item_id' })
  news_item: AiPulseNewsItem;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  vertical: AiPulseVertical;

  @Column({ type: 'varchar', length: 500, nullable: true })
  english_title: string | null;

  @Column({ type: 'text', nullable: true })
  english_hook: string | null;

  @Column({ type: 'text', nullable: true })
  english_full_script: string | null;

  @Column({ type: 'int', nullable: true })
  english_word_count: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  telugu_title: string | null;

  @Column({ type: 'text', nullable: true })
  telugu_hook: string | null;

  @Column({ type: 'text', nullable: true })
  telugu_full_script: string | null;

  @Column({ type: 'int', nullable: true })
  telugu_word_count: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  llm_model: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0 })
  llm_cost_usd: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  english_avatar_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  english_voice_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  english_video_id: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  english_video_url: string | null;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  english_video_status: AiPulseVideoStatus;

  // ── YouTube video IDs (extracted from URL on mark-published) ──────
  @Column({ type: 'varchar', length: 50, nullable: true })
  english_youtube_video_id: string | null;

  // ── Live YouTube snippet (auto-refreshed by the metrics fetcher) ──
  @Column({ type: 'text', nullable: true })
  live_youtube_title: string | null;

  @Column({ type: 'text', nullable: true })
  live_youtube_description: string | null;

  @Column({ type: 'timestamp', nullable: true })
  live_youtube_fetched_at: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  telugu_avatar_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  telugu_voice_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  telugu_video_id: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  telugu_video_url: string | null;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  telugu_video_status: AiPulseVideoStatus;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telugu_youtube_video_id: string | null;

  @Column({ type: 'text', nullable: true })
  live_telugu_youtube_title: string | null;

  @Column({ type: 'text', nullable: true })
  live_telugu_youtube_description: string | null;

  @Column({ type: 'timestamp', nullable: true })
  live_telugu_youtube_fetched_at: Date | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  thumbnail_prompts: AiPulseThumbnailPrompt[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  thumbnail_urls: string[];

  @Column({ type: 'jsonb', nullable: true })
  distribution_package: AiPulseDistributionPackage | null;

  // Telugu mirror of distribution_package — YouTube title in Telugu code-mix
  // style + Telugu description + Telugu hashtags etc. Populated by the
  // distribution generator when called with language='te'.
  @Column({ type: 'jsonb', nullable: true })
  telugu_distribution_package: AiPulseDistributionPackage | null;

  // ── Cinematic scene breakdown (parallel to AQB scenes) ──────────────
  // Populated on demand from the admin "🎬 Scenes" panel. Per-scene
  // structured JSON prompts, blueprint-aligned: style + character_dna
  // inlined in every scene; per-vertical visual accents baked into style.
  // Includes a voiceover + music block for MiniMax / Lyria / Suno.
  @Column({ type: 'jsonb', nullable: true, name: 'scenes' })
  scenes: {
    scenes: Array<{
      scene_id:             string;
      duration_seconds:     number;
      spoken_text:          string;
      setting:              string;
      subject:              string;
      shot:                 string;
      lighting:             string;
      mood:                 string;
      style:                string;
      character_dna:        string;
      reference_image_url?: string | null;
    }>;
    scene_count:        number;
    total_duration_sec: number;
    voiceover: {
      full_text:    string;
      voice_style:  string;
      pacing_notes: string;
    };
    music: {
      style:          string;
      tempo:          string;
      mood:           string;
      minimax_prompt: string;
    };
  } | null;

  // ── Character cast (anthropomorphic cartoon cast for scene gen) ─────
  // Decided by CharacterCastingService BEFORE script generation, so the
  // script writer references the cast naturally. Scene gen REQUIRES this
  // field — existing scripts must be regenerated before scenes can be
  // regenerated with the per-character DNA system.
  //
  //   main       — 1 character slug; protagonist, appears in every scene
  //   supporting — 0-3 slugs; appear in 1-3 relevant scenes each
  //   cameo      — 0-3 slugs; NAMED in narration only, never depicted
  //
  // Slugs map to rows in the shared `characters` table.
  @Column({ type: 'jsonb', nullable: true })
  cast: {
    main:       string;
    supporting: string[];
    cameo:      string[];
    reasoning?: string;
  } | null;

  @Column({ type: 'timestamp', nullable: true, name: 'scenes_generated_at' })
  scenes_generated_at: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0, name: 'scenes_cost_usd' })
  scenes_cost_usd: number;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'pending_review' })
  approval_status: AiPulseApprovalStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  approved_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  scheduled_publish_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  published_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
