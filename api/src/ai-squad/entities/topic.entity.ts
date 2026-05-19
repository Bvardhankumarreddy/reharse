import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Theme } from './theme.entity';
import type { CharacterKey } from '../config/cast.config';

export type TopicType = 'explainer' | 'debate' | 'speculation' | 'walkthrough' | 'story';
export type TopicFormat = 'long' | 'short';
export type TopicStatus =
  | 'planned' | 'dialogue_generated' | 'in_production' | 'completed' | 'archived';

@Entity('ai_squad_topics')
export class Topic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  themeId: string;

  @ManyToOne(() => Theme, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'themeId' })
  theme: Theme;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  angle: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  topicType: TopicType | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  recommendedCharacters: CharacterKey[];

  @Column({ type: 'varchar', length: 50, default: 'beginner' })
  difficulty: 'beginner' | 'intermediate' | 'advanced';

  @Column({ type: 'int', default: 8 })
  estimatedDurationMinutes: number;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'long' })
  format: TopicFormat;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  keyConcepts: string[];

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'planned' })
  status: TopicStatus;

  @Column({ type: 'date', nullable: true })
  scheduledFor: string | null;

  @Column({ type: 'boolean', default: true })
  llmGenerated: boolean;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  generationCostUsd: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
