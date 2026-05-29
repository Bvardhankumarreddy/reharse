import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { QuizBundle } from './quiz-bundle.entity';

export type BundleQuestionType =
  | 'mcq'
  | 'true_false'
  | 'multi_select'
  | 'numeric';

export type BundleDifficulty = 'easy' | 'medium' | 'hard';

/**
 * One row in a quiz bundle. Shape mirrors the admin Quiz Module importer
 * CSV columns so the CSV renderer is a straight column map.
 */
@Entity('cs_quiz_bundle_questions')
export class QuizBundleQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'bundle_id' })
  bundleId: string;

  @ManyToOne(() => QuizBundle, (b) => b.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bundle_id' })
  bundle: QuizBundle;

  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'varchar', length: 20, name: 'question_type' })
  questionType: BundleQuestionType;

  @Column({ type: 'text', name: 'question_text' })
  questionText: string;

  @Column({ type: 'text', nullable: true, name: 'option_a' })
  optionA: string | null;

  @Column({ type: 'text', nullable: true, name: 'option_b' })
  optionB: string | null;

  @Column({ type: 'text', nullable: true, name: 'option_c' })
  optionC: string | null;

  @Column({ type: 'text', nullable: true, name: 'option_d' })
  optionD: string | null;

  @Column({ type: 'varchar', length: 1, nullable: true, name: 'correct_answer' })
  correctAnswer: string | null;

  @Column({ type: 'text', nullable: true, name: 'correct_answers' })
  correctAnswers: string | null;

  @Column({ type: 'numeric', nullable: true, name: 'correct_number' })
  correctNumber: string | null;

  @Column({ type: 'numeric', nullable: true, name: 'numeric_tolerance' })
  numericTolerance: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true, name: 'numeric_unit' })
  numericUnit: string | null;

  @Column({ type: 'int', default: 1 })
  points: number;

  @Column({ type: 'varchar', length: 10 })
  difficulty: BundleDifficulty;

  @Column({ type: 'text', nullable: true })
  category: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_mandatory' })
  isMandatory: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
