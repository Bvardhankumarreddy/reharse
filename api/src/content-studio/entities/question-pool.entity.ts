import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

/** One MCQ in the weekly question pool. Each is cross-provider validated. */
@Entity('cs_question_pools')
export class QuestionPool {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  planId: string | null;

  @Column({ type: 'uuid' })
  brandId: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  options: string[];

  @Column({ type: 'int', nullable: true })
  correctIndex: number | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  difficulty: QuestionDifficulty | null;

  /** Model id of the validator (or null if validation was skipped). */
  @Column({ type: 'varchar', length: 30, nullable: true })
  validatedBy: string | null;

  @Column({ type: 'boolean', nullable: true })
  validationPassed: boolean | null;

  /** draft | valid | invalid | drawn */
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  @Column({ type: 'text', nullable: true })
  explanation: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
