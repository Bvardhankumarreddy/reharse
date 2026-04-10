import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  AfterLoad,
} from 'typeorm';
import type { Session } from '../sessions/session.entity';

@Entity('users')
export class User {
  /** Clerk user ID — used as primary key so no UUID mismatch */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true })
  imageUrl: string;

  // Onboarding preferences
  @Column({ nullable: true })
  targetRole: string;

  @Column({ nullable: true })
  targetCompany: string;

  @Column({ nullable: true })
  experienceLevel: string;

  @Column({ nullable: true })
  goalType: string; // job_search | promotion | career_change | explore

  /** product | service | startup | consulting | fintech | any */
  @Column({ nullable: true, type: 'varchar' })
  companyType: string | null;

  // Resume
  @Column({ nullable: true })
  resumeUrl: string;   // S3 key of the active (latest) resume

  @Column({ nullable: true, type: 'text' })
  resumeText: string;  // Extracted plain text (used by AI engine)

  // Version history — JSON array of all uploaded resumes, newest first
  @Column({ nullable: true, type: 'json' })
  resumeVersions: Array<{
    key:        string;   // S3 object key
    fileName:   string;   // Original filename shown to user
    uploadedAt: string;   // ISO timestamp
    version:    number;   // 1-based, monotonically increasing
  }> | null;

  // Streak
  @Column({ default: 0 })
  currentStreak: number;

  @Column({ default: 0 })
  longestStreak: number;

  @Column({ nullable: true, type: 'date' })
  lastActiveDate: Date;

  @Column({ default: false })
  onboardingCompleted: boolean;

  // Target interview date (user-set countdown)
  @Column({ nullable: true, type: 'date' })
  interviewDate: Date | null;

  // Google Calendar OAuth — only the refresh token is stored; access tokens are fetched on demand
  @Column({ nullable: true, type: 'text' })
  googleRefreshToken: string | null;

  // Razorpay billing
  @Column({ nullable: true, type: 'varchar' })
  razorpayCustomerId: string | null;

  @Column({ nullable: true, type: 'varchar' })
  razorpaySubscriptionId: string | null;

  /** 'free' | 'pro' */
  @Column({ type: 'varchar', default: 'free' })
  subscriptionTier: string;

  /** 'active' | 'past_due' | 'cancelled' | null */
  @Column({ nullable: true, type: 'varchar' })
  subscriptionStatus: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  subscriptionEndsAt: Date | null;

  // JD Match weekly usage tracking (server-side enforcement)
  @Column({ nullable: true, type: 'varchar' })
  jdMatchWeekKey: string | null;   // ISO week string, e.g. "2025-W15"

  @Column({ type: 'int', default: 0 })
  jdMatchUsesWeek: number;

  /** Computed: true when a refresh token exists. Set after load and serialised instead of the raw token. */
  googleCalendarConnected: boolean;

  @AfterLoad()
  setCalendarConnected() {
    this.googleCalendarConnected = !!this.googleRefreshToken;
  }

  toJSON() {
    const { googleRefreshToken: _secret, ...rest } = this as Record<string, unknown>;
    void _secret;
    return rest;
  }

  // Interview preferences: mode, adaptive, starHints, feedbackDepth
  @Column({ nullable: true, type: 'json' })
  preferences: {
    mode?: string;
    adaptive?: boolean;
    starHints?: boolean;
    feedbackDepth?: string;
  } | null;

  // Notification toggles
  @Column({ nullable: true, type: 'json' })
  notificationPreferences: {
    daily?: boolean;
    weekly?: boolean;
    newQ?: boolean;
    aiCoach?: boolean;
    session?: boolean;
  } | null;

  // Multiple target companies (stored as JSON array)
  @Column({ nullable: true, type: 'simple-array' })
  targetCompanies: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany('Session', (session: Session) => session.user)
  sessions: Session[];
}
