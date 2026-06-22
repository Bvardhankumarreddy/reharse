import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

export interface PostmortemContent {
  worked: string[];
  didntWork: string[];
  next: string[];
  /** Optional: extracted hook pattern the Improvement Agent should reuse. */
  reusableHookPattern?: string;

  // ── Scene-aware fields (only populated when the lesson had scenes) ──
  // Mined by the improvement-loop into BrandMemory(type=scene_pattern).
  // Null/0/empty for older lessons without scenes — no special-casing
  // needed downstream.
  sceneCount?:           number;
  openingShotType?:      string;     // scene 01's shot
  moodArc?:              string;     // comma-separated distinct moods
  characterCount?:       number;
  scenePattern?:         string;     // one-line observation worth promoting
  bestPerformingChapter?: string;    // chapter_id whose scenes felt strongest
}

@Entity('cs_lesson_postmortems')
export class LessonPostmortem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  lessonId: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  content: PostmortemContent;

  @Column({ type: 'varchar', length: 100, nullable: true })
  modelUsed: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  costUsd: number;

  @CreateDateColumn()
  createdAt: Date;
}
