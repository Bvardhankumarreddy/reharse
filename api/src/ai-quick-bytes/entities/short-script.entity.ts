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

  // ── Story-mode metadata (story prompt v2) ───────────────────────────
  /** Generic role + setting — never a real name. Used by the anti-repetition
   *  query to surface "do not reuse" archetypes in the next script gen. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  protagonist: string | null;

  /** Two-emotion arc e.g. "curiosity → surprise" / "frustration → relief".
   *  Used by anti-repetition (don't re-use the same arc back-to-back) and
   *  by downstream agents that want a tone hint. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  emotionalProgression: string | null;

  /** Single sentence the viewer should remember after watching. Acts as a
   *  north star for thumbnail / scene / distribution agents (cleaner than
   *  re-deriving intent from the prose script). */
  @Column({ type: 'text', nullable: true })
  coreMessage: string | null;

  // ── Character cast (anthropomorphic cartoon cast for scene gen) ─────
  // Decided by CharacterCastingService BEFORE script generation, so the
  // script writer references the cast naturally. Scene gen REQUIRES this
  // field to be set — if null on an existing script row, the operator
  // must regenerate the script before regenerating scenes.
  //
  // Stored as JSONB:
  //   main       — exactly 1 character slug; protagonist in every scene
  //   supporting — 0-3 slugs; appear in 1-3 relevant scenes each
  //   cameo      — 0-3 slugs; NAMED in narration only, never depicted
  //
  // Slugs map to rows in the shared `characters` table. NOTE: column
  // is named characterCast (not "cast") because `cast` is a SQL
  // reserved word — using it as an unquoted identifier breaks ALTER
  // TABLE / INSERT statements.
  @Column({ type: 'jsonb', nullable: true })
  characterCast: {
    main:       string;
    supporting: string[];
    cameo:      string[];
    reasoning?: string;
  } | null;

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

  // ── Closing motivational quote (picked from aqb_quotes bank) ───────
  // Persisted ON the script so the admin can see / swap / edit from the
  // approval UI without re-running the picker. Nullable — picker may
  // skip if the bank is empty or the LLM call fails (non-fatal).
  @Column({ type: 'uuid', nullable: true })
  closingQuoteId: string | null;

  @Column({ type: 'text', nullable: true })
  closingQuoteText: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  closingQuoteAuthor: string | null;

  // ── Telugu closing quote (picked independently from the te bank) ──
  // Separate from the English fields so the Telugu video gets a quote
  // by Vemana / Sumati / Annamayya / Sri Sri / Kalam / etc. — NOT a
  // translated English quote. Nullable when the Telugu bank is empty.
  // ── Cinematic scene breakdown (story-mode feature) ───────────────────
  // Populated by SceneGeneratorService on demand from the admin "🎬 Scenes"
  // tab. Doesn't affect the HeyGen / publish flow — purely a host-facing
  // asset the host pastes into ChatGPT image gen, one scene at a time.
  @Column({ type: 'jsonb', nullable: true })
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
      style:                string;       // INLINE in every scene per blueprint
      character_dna:        string;       // INLINE in every scene per blueprint
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

  @Column({ type: 'timestamp', nullable: true })
  scenesGeneratedAt: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0 })
  scenesCostUsd: number;

  // ── Telugu scenes (parallel column, same payload shape as scenes) ───
  // Generated on demand when the operator hits the scene endpoint with
  // ?language=te. Same cast, same visual style — only spoken_text + the
  // voiceover full_text differ (Telugu instead of English). Lets the host
  // paste either EN or TE scenes into VEO / HeyGen / Sora as needed.
  @Column({ type: 'jsonb', nullable: true, name: 'scenes_te' })
  scenesTe: ShortScript['scenes'];

  @Column({ type: 'timestamp', nullable: true, name: 'scenes_te_generated_at' })
  scenesTeGeneratedAt: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0, name: 'scenes_te_cost_usd' })
  scenesTeCostUsd: number;

  @Column({ type: 'uuid', nullable: true })
  teluguClosingQuoteId: string | null;

  @Column({ type: 'text', nullable: true })
  teluguClosingQuoteText: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  teluguClosingQuoteAuthor: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
