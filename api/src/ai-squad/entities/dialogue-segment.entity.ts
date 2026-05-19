import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Episode } from './episode.entity';
import type { CharacterKey } from '../config/cast.config';

export type HeyGenStatus = 'pending' | 'queued' | 'generating' | 'ready' | 'failed';

@Entity('ai_squad_dialogue_segments')
@Index('idx_asq_seg_episode_order', ['episodeId', 'segmentOrder'])
export class DialogueSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  episodeId: string;

  @ManyToOne(() => Episode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'episodeId' })
  episode: Episode;

  @Column({ type: 'int' })
  segmentOrder: number;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  characterKey: CharacterKey;

  @Column({ type: 'varchar', length: 50 })
  speakerName: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'text', nullable: true })
  textWithPauses: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  emotionTag: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  durationEstimateSeconds: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  heygenVideoId: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  heygenVideoUrl: string | null;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'pending' })
  heygenStatus: HeyGenStatus;

  @Column({ type: 'text', nullable: true })
  heygenError: string | null;

  /** 'english' | 'hindi' | 'telugu'. English is the source. */
  @Index()
  @Column({ type: 'varchar', length: 20, default: 'english' })
  languageCode: string;

  /** For translated rows: the English segment they were translated from. */
  @Column({ type: 'uuid', nullable: true })
  originalSegmentId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
