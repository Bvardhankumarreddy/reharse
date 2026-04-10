import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionType = 'behavioral' | 'coding' | 'system-design' | 'hr' | 'case-study';

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  type: QuestionType;

  @Index()
  @Column({ type: 'varchar', length: 8 })
  difficulty: Difficulty;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text', nullable: true })
  modelAnswer: string;

  @Column({ type: 'simple-array', default: '' })
  tags: string[];

  /** Companies this question is commonly asked at */
  @Column({ type: 'simple-array', default: '' })
  companies: string[];

  /** Roles this question is relevant for */
  @Column({ type: 'simple-array', default: '' })
  roles: string[];

  /** Average score across all attempts (0-100) */
  @Column({ type: 'float', default: 0 })
  avgScore: number;

  /** Total number of attempts */
  @Column({ default: 0 })
  attemptCount: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
