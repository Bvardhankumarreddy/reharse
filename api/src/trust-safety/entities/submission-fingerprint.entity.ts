import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

@Entity('ts_submission_fingerprints')
export class SubmissionFingerprint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true, name: 'submission_id' })
  submissionId: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'session_id' })
  sessionId: string | null;

  @Index()
  @Column({ type: 'int', name: 'quiz_week' })
  quizWeek: number;

  @Index()
  @Column({ type: 'varchar', length: 255, name: 'user_email' })
  userEmail: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'user_name' })
  userName: string | null;

  @Index()
  @Column({ type: 'inet', name: 'ip_address' })
  ipAddress: string;

  @Column({ type: 'varchar', length: 80, nullable: true, name: 'ip_country' })
  ipCountry: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true, name: 'ip_region' })
  ipRegion: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true, name: 'ip_city' })
  ipCity: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true, name: 'ip_latitude' })
  ipLatitude: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true, name: 'ip_longitude' })
  ipLongitude: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_vpn' })
  isVpn: boolean;

  @Column({ type: 'text', nullable: true, name: 'user_agent' })
  userAgent: string | null;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'device_fingerprint' })
  deviceFingerprint: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'browser_id' })
  browserId: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true, name: 'screen_resolution' })
  screenResolution: string | null;

  @Column({ type: 'int', nullable: true, name: 'total_time_seconds' })
  totalTimeSeconds: number | null;

  @Column({ type: 'int', nullable: true })
  score: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb", name: 'question_ids' })
  questionIds: string[];

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, name: 'avg_time_per_question_seconds' })
  avgTimePerQuestionSeconds: string | null;

  @Column({ type: 'int', nullable: true, name: 'fastest_answer_seconds' })
  fastestAnswerSeconds: number | null;

  @Column({ type: 'int', default: 0, name: 'tab_switch_count' })
  tabSwitchCount: number;

  @Column({ type: 'boolean', default: false, name: 'copy_paste_detected' })
  copyPasteDetected: boolean;

  /** 'start' (created on session create) or 'submit' (final row). */
  @Column({ type: 'varchar', length: 20, default: 'submit' })
  phase: 'start' | 'submit';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
