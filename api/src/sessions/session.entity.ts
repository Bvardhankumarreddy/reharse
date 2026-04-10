import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import type { User } from '../users/user.entity';
import type { Feedback } from '../feedback/feedback.entity';

export type InterviewType = 'behavioral' | 'coding' | 'system-design' | 'hr' | 'case-study';
export type SessionMode   = 'text' | 'voice' | 'mixed';
export type SessionStatus = 'pending' | 'active' | 'completed' | 'abandoned';

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('User', (user: User) => user.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  interviewType: InterviewType;

  @Column({ nullable: true })
  targetRole: string;

  @Column({ nullable: true })
  targetCompany: string;

  @Column({ nullable: true })
  experienceLevel: string;

  @Column({ type: 'varchar', length: 8, default: 'text' })
  mode: SessionMode;

  @Column({ default: 45 })
  durationMinutes: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: SessionStatus;

  /** Overall score 0-100, populated after feedback is generated */
  @Column({ nullable: true, type: 'int' })
  overallScore: number | null;

  /** UUIDs of question-bank questions pinned for this session (empty = AI-generated) */
  @Column({ type: 'simple-array', nullable: true })
  pinnedQuestionIds: string[] | null;

  /** JSONB: array of { questionId, answer, score, feedback } */
  @Column({ type: 'jsonb', default: [] })
  transcript: object[];

  @Column({ nullable: true, type: 'timestamp' })
  startedAt: Date | null;

  @Column({ nullable: true, type: 'timestamp' })
  completedAt: Date | null;

  @OneToOne('Feedback', (feedback: Feedback) => feedback.session)
  feedback: Feedback;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
