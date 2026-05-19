import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, OneToMany,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Topic } from './topic.entity';
import { DialogueSegment } from './dialogue-segment.entity';
import { EpisodeAsset } from './episode-asset.entity';
import { LanguageVersion } from './language-version.entity';
import type { CharacterKey } from '../config/cast.config';

export type EpisodeStatus =
  | 'planning' | 'dialogue_generated' | 'generating_videos' | 'ready'
  | 'approved' | 'published' | 'rejected' | 'failed';

@Entity('ai_squad_episodes')
export class Episode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  topicId: string;

  @ManyToOne(() => Topic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topicId' })
  topic: Topic;

  @Index()
  @Column({ type: 'int' })
  episodeNumber: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title: string | null;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'planning' })
  status: EpisodeStatus;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  charactersUsed: CharacterKey[];

  @Column({ type: 'int', default: 2 })
  characterCount: number;

  @Column({ type: 'varchar', length: 50, default: 'long' })
  format: 'long' | 'short';

  @Column({ type: 'text', nullable: true })
  fullDialogueText: string | null;

  @Column({ type: 'int', nullable: true })
  durationEstimateSeconds: number | null;

  @Column({ type: 'int', default: 0 })
  totalSegments: number;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  llmCostUsd: number;

  @Column({ type: 'int', default: 0 })
  heygenCostCredits: number;

  @Column({ type: 'jsonb', nullable: true })
  thumbnailPrompts: unknown[] | null;

  @Column({ type: 'int', nullable: true })
  selectedThumbnailIndex: number | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  thumbnailImageUrl: string | null;

  @Column({ type: 'jsonb', nullable: true })
  distributionPackage: Record<string, unknown> | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  distributionCostUsd: number;

  // ── Multi-language ────────────────────────────────────────────────────
  @Column({ type: 'jsonb', default: () => `'["english"]'::jsonb` })
  languages: string[];

  @Column({ type: 'varchar', length: 20, default: 'english' })
  primaryLanguage: string;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  translationCostUsd: number;

  @OneToMany(() => LanguageVersion, (lv) => lv.episode)
  languageVersions: LanguageVersion[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  publishedYoutubeUrl: string | null;

  @OneToMany(() => DialogueSegment, (s) => s.episode)
  segments: DialogueSegment[];

  @OneToMany(() => EpisodeAsset, (a) => a.episode)
  assets: EpisodeAsset[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
