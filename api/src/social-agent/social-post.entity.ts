import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type SocialPlatform =
  | 'linkedin_page' | 'linkedin_personal'
  | 'instagram_feed' | 'instagram_story'
  | 'whatsapp_status' | 'youtube_community';

export type SocialContentType =
  | 'lesson_drop' | 'quiz_winners' | 'quiz_announcement'
  | 'engagement_post' | 'custom';

export type SocialPostStatus =
  | 'draft' | 'pending_approval' | 'approved'
  | 'published_manual' | 'rejected';

export type SocialGeneratedBy = 'manual' | 'claude';

@Entity('social_posts')
export class SocialPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  platform: SocialPlatform;

  @Column({ type: 'varchar', length: 30 })
  contentType: SocialContentType;

  @Column({ type: 'text' })
  textContent: string;

  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'text', nullable: true })
  linkUrl: string | null;

  @Index()
  @Column({ type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /** External URL after publishing (e.g. LinkedIn post URL) */
  @Column({ type: 'text', nullable: true })
  externalUrl: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pending_approval' })
  status: SocialPostStatus;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  generatedBy: SocialGeneratedBy;

  /** Original context used to generate (so we can regenerate later) */
  @Column({ type: 'jsonb', nullable: true })
  generationContext: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  approvedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
