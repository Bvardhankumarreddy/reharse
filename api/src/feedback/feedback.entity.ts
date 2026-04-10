import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import type { Session } from '../sessions/session.entity';

@Entity('feedback')
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne('Session', (session: Session) => session.feedback, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: Session;

  @Column()
  sessionId: string;

  /** 0–100 overall score */
  @Column({ type: 'int' })
  overallScore: number;

  /** Dimension scores: { communication, structure, depth, examples, confidence } */
  @Column({ type: 'jsonb' })
  dimensionScores: Record<string, number>;

  /** AI-generated executive summary */
  @Column({ type: 'text' })
  summary: string;

  /** Per-question feedback items */
  @Column({ type: 'jsonb', default: [] })
  questionFeedback: Array<{
    questionId: string;
    question:   string;
    answer:     string;
    score:      number;
    strengths:  string[];
    improvements: string[];
    modelAnswer?: string;
  }>;

  /** Recommended next steps */
  @Column({ type: 'jsonb', default: [] })
  nextSteps: Array<{
    type:        string; // 'practice' | 'read' | 'watch'
    title:       string;
    description: string;
    link?:       string;
  }>;

  /** Weak areas detected */
  @Column({ type: 'jsonb', default: [] })
  weakAreas: string[];

  /** Claude model used to generate */
  @Column({ nullable: true })
  modelUsed: string;

  @CreateDateColumn()
  createdAt: Date;
}
