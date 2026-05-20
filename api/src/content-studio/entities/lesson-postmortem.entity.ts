import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

export interface PostmortemContent {
  worked: string[];
  didntWork: string[];
  next: string[];
  /** Optional: extracted hook pattern the Improvement Agent should reuse. */
  reusableHookPattern?: string;
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
