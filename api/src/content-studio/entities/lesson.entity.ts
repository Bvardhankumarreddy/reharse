import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { WeeklyContentPlan } from './weekly-content-plan.entity';
import type { LessonFormat } from './content-series.entity';

export interface OutlineSection {
  heading: string;
  points: string[];
}

@Entity('cs_lessons')
export class Lesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => WeeklyContentPlan, (p) => p.lessons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planId' })
  plan: WeeklyContentPlan;

  @Column({ type: 'int' })
  lessonNumber: number;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  hook: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  outline: OutlineSection[];

  @Column({ type: 'int', default: 10 })
  targetDurationMinutes: number;

  /** Phase E: lesson "shape" — lecture / live_coding / walkthrough / interview / short. */
  @Column({ type: 'varchar', length: 30, default: 'lecture' })
  lessonFormat: LessonFormat;

  /**
   * Orthogonal to lessonFormat — how explanation is delivered.
   *   'inline'                 — pure narration (talking head; no cues array)
   *   'with_screen_recording'  — narration + structured screenRecordingCues
   *                              array on the script asset's content blob
   */
  @Column({ type: 'varchar', length: 40, default: 'inline' })
  explanationMode: 'inline' | 'with_screen_recording';

  @Column({ type: 'varchar', length: 30, default: 'planned' })
  status: string;

  // ── Live YouTube snippet (auto-refreshed by MetricsFetcherService) ──
  // Mirrors the AQB / AI Pulse live-snippet pattern. Captures whatever
  // the curator manually edited on YouTube Studio so the edit-pattern
  // miner can diff against the LLM-generated SEO asset and learn the
  // human's editorial fingerprint.
  @Column({ type: 'text', nullable: true })
  liveYoutubeTitle: string | null;

  @Column({ type: 'text', nullable: true })
  liveYoutubeDescription: string | null;

  @Column({ type: 'timestamp', nullable: true })
  liveYoutubeFetchedAt: Date | null;

  // ── Cinematic scene breakdown (parallel to AQB / AI Pulse) ──────────
  // Chapter-grouped scenes: each scene tagged with chapter_id linking
  // back to a lesson outline section. Per-brand visual accents are
  // pulled from BrandMemory at gen time and inlined into every scene's
  // "style" field (paste-ready into ChatGPT / Sora / VEO).
  @Column({ type: 'jsonb', nullable: true })
  scenes: {
    scenes: Array<{
      scene_id:             string;
      chapter_id:           string;   // matches an outline section's heading slug
      duration_seconds:     number;
      spoken_text:          string;
      setting:              string;
      subject:              string;
      shot:                 string;
      lighting:             string;
      mood:                 string;
      style:                string;       // INLINE per blueprint
      character_dna:        string;       // INLINE per blueprint
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

  @Column({ type: 'timestamp', nullable: true, name: 'scenes_generated_at' })
  scenesGeneratedAt: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0, name: 'scenes_cost_usd' })
  scenesCostUsd: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
