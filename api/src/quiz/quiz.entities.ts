import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('quiz_configs')
export class QuizConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'int' })
  quizWeek: number;

  @Column({ type: 'varchar', length: 200, default: 'Weekly AI Quiz' })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  /** Quiz availability window — public can only start within this range */
  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  /** Session timer in minutes — once user starts, they have this much time total */
  @Column({ type: 'int', default: 5 })
  durationMinutes: number;

  /** How many questions to ask per quiz attempt (mix of mandatory + random) */
  @Column({ type: 'int', default: 5 })
  questionsPerQuiz: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type QuizQuestionType = 'mcq' | 'true_false' | 'multi_select' | 'numeric';

@Entity('quiz_questions')
export class QuizQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16, default: 'mcq' })
  questionType: QuizQuestionType;

  @Column({ type: 'text' })
  questionText: string;

  // ── For mcq, true_false, multi_select ──
  @Column({ type: 'text', default: '' })
  optionA: string;

  @Column({ type: 'text', default: '' })
  optionB: string;

  @Column({ type: 'text', default: '' })
  optionC: string;

  @Column({ type: 'text', default: '' })
  optionD: string;

  /** Single-letter answer for mcq + true_false (true_false: A=True, B=False) */
  @Column({ type: 'varchar', length: 1, nullable: true })
  correctAnswer: 'A' | 'B' | 'C' | 'D' | null;

  /** Comma-separated for multi_select (e.g. "A,C,D") */
  @Column({ type: 'simple-array', nullable: true })
  correctAnswers: string[] | null;

  // ── For numeric ──
  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
  correctNumber: number | null;

  /** Acceptable absolute tolerance, e.g. 5 means within ±5 of correctNumber */
  @Column({ type: 'numeric', precision: 18, scale: 6, default: 0 })
  numericTolerance: number;

  /** Display label for numeric (e.g. "billion parameters", "%", "million") */
  @Column({ type: 'varchar', length: 50, nullable: true })
  numericUnit: string | null;

  @Column({ type: 'int', default: 1 })
  points: number;

  @Index()
  @Column({ type: 'varchar', length: 8 })
  difficulty: 'easy' | 'medium' | 'hard';

  @Column({ type: 'varchar', length: 200 })
  category: string;

  @Index()
  @Column({ type: 'int' })
  quizWeek: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** If true, this question is always included in every quiz attempt for its week */
  @Column({ type: 'boolean', default: false })
  isMandatory: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('quiz_submissions')
@Unique('uq_email_per_week', ['email', 'quizWeek'])
export class QuizSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  fullName: string;

  @Index()
  @Column({ type: 'varchar', length: 200 })
  email: string;

  @Column({ type: 'varchar', length: 200 })
  upiId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  youtubeHandle: string | null;

  @Index()
  @Column({ type: 'int' })
  quizWeek: number;

  @Column({ type: 'int', default: 0 })
  totalScore: number;

  @Column({ type: 'int', default: 0 })
  totalTimeSeconds: number;

  @Column({ type: 'bigint', nullable: true })
  tiebreakerAnswer: number | null;

  @Column({ type: 'int', nullable: true })
  winnerRank: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @CreateDateColumn()
  submittedAt: Date;

  @OneToMany(() => QuizSubmissionAnswer, (a) => a.submission, { cascade: true })
  answers: QuizSubmissionAnswer[];
}

@Entity('quiz_submission_answers')
export class QuizSubmissionAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  submissionId: string;

  @ManyToOne(() => QuizSubmission, (s) => s.answers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submissionId' })
  submission: QuizSubmission;

  @Column()
  questionId: string;

  @ManyToOne(() => QuizQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'questionId' })
  question: QuizQuestion;

  /** Single-letter for mcq/true_false; comma-separated for multi_select; "n/a" for numeric */
  @Column({ type: 'varchar', length: 50 })
  selectedAnswer: string;

  /** Numeric answer (only when questionType=numeric) */
  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
  selectedNumber: number | null;

  @Column({ type: 'boolean' })
  isCorrect: boolean;

  @Column({ type: 'int', default: 0 })
  pointsEarned: number;

  @Column({ type: 'int', default: 0 })
  timeTakenSeconds: number;
}

/**
 * Active quiz session — server-side state for an in-progress quiz.
 * Stores chosen question order, correct answers, and start time
 * so the client only sees one question at a time and can't tamper with scoring.
 */
@Entity('quiz_sessions')
export class QuizSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  fullName: string;

  @Index()
  @Column({ type: 'varchar', length: 200 })
  email: string;

  @Column({ type: 'varchar', length: 200 })
  upiId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  youtubeHandle: string | null;

  @Column({ type: 'int' })
  quizWeek: number;

  /** Ordered list of question IDs chosen for this session */
  @Column({ type: 'jsonb' })
  questionIds: string[];

  /** Index into questionIds — current question number (0-based) */
  @Column({ type: 'int', default: 0 })
  currentIndex: number;

  /** Answers so far — one entry per answered question */
  @Column({ type: 'jsonb', default: [] })
  answers: Array<{
    questionId: string;
    selectedAnswer: string; // 'A' / 'B,C' / 'n/a'
    selectedNumber?: number | null;
    isCorrect: boolean;
    pointsEarned: number;
    timeTakenSeconds: number;
  }>;

  @Column({ type: 'timestamp' })
  startedAt: Date;

  /** Hard cutoff for the entire session (computed as startedAt + durationMinutes) */
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  /** Time when current question was shown — used to compute timeTaken */
  @Column({ type: 'timestamp', nullable: true })
  questionStartedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  completed: boolean;

  @Column({ type: 'uuid', nullable: true })
  submissionId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
