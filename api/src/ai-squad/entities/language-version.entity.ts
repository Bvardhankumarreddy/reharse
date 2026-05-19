import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Episode } from './episode.entity';

export type LanguageVersionStatus =
  | 'pending' | 'translating' | 'translated'
  | 'generating_videos' | 'ready' | 'published' | 'failed';

@Entity('ai_squad_language_versions')
@Index('uq_asq_lang_per_episode', ['episodeId', 'languageCode'], { unique: true })
export class LanguageVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  episodeId: string;

  @ManyToOne(() => Episode, (ep) => ep.languageVersions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'episodeId' })
  episode: Episode;

  @Column({ type: 'varchar', length: 20 })
  languageCode: string; // 'english' | 'hindi' | 'telugu'

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  translatedDialogue: unknown[];

  @Column({ type: 'text', nullable: true })
  translatedFullText: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  translationCostUsd: number;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: LanguageVersionStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  publishedYoutubeUrl: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
