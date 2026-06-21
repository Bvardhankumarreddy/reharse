import {
  Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { ShortScript } from './short-script.entity';

export interface AqbPostmortemContent {
  worked?: string[];
  didntWork?: string[];
  next?: string[];
  reusableHookPattern?: string;
  winningThumbnailStyle?: string;
  topicSignal?: string;

  // ── Scene-aware postmortem fields (only populated when the script had
  // scenes generated; null/omitted otherwise) ───────────────────────────
  /** Total scenes in the video — surfaces "tight 12-scene cuts beat
   *  sprawling 18-scene cuts" patterns when aggregated across winners. */
  sceneCount?: number;
  /** The shot type of the first scene — e.g. "close-up" / "wide establishing"
   *  / "over-shoulder". Strong correlate of stop-the-scroll. */
  openingShotType?: string;
  /** Comma-separated distinct moods used across scenes (e.g.
   *  "curiosity, awe, hope"). Detects which emotional arcs land. */
  moodArc?: string;
  /** Number of distinct named characters that appeared across scenes. */
  characterCount?: number;
  /** Free-text 1-sentence observation about what scene choice clearly
   *  worked or didn't — feeds straight into the scene-gen memory. */
  scenePattern?: string;
}

/** One LLM-analyzed postmortem per published AQB short. */
@Entity('aqb_short_postmortems')
export class AqbShortPostmortem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  scriptId: string;

  @OneToOne(() => ShortScript, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scriptId' })
  script: ShortScript;

  @Column({ type: 'jsonb' })
  content: AqbPostmortemContent;

  @Column({ type: 'varchar', length: 100, nullable: true })
  modelUsed: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  costUsd: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
