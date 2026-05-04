import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, Index,
} from 'typeorm';
import { SocialPost } from './social-post.entity';

@Entity('post_engagement')
@Index(['socialPostId', 'syncedDate'], { unique: true })
export class PostEngagement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  socialPostId: string;

  @ManyToOne(() => SocialPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'socialPostId' })
  post: SocialPost;

  @Column({ type: 'int', default: 0 })
  likes: number;

  @Column({ type: 'int', default: 0 })
  comments: number;

  @Column({ type: 'int', default: 0 })
  shares: number;

  @Column({ type: 'int', default: 0 })
  saves: number;

  @Column({ type: 'int', default: 0 })
  impressions: number;

  @Column({ type: 'int', default: 0 })
  reach: number;

  @Column({ type: 'int', default: 0 })
  clicks: number;

  /** (likes + comments + shares) / impressions × 100 — calculated at insert */
  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  engagementRate: number;

  /** Date-only stamp for the unique constraint — one snapshot per post per day */
  @Column({ type: 'date' })
  syncedDate: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  syncSource: string | null;

  @Column({ type: 'jsonb', nullable: true })
  rawData: Record<string, unknown> | null;

  @CreateDateColumn()
  syncedAt: Date;
}
