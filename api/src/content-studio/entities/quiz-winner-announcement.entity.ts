import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export interface QuizWinner {
  rank: number;
  name: string;
  score: number;
  maxScore: number;
  timeSeconds: number;
  prizeInr: number;
}

export interface WinnerPosts {
  youtube_community?: string;
  instagram?: { caption: string; hashtags: string[]; full_text: string };
  linkedin?:  { body: string;    hashtags: string[]; full_text: string };
  whatsapp_channel?: string;
  whatsapp_status?:  string;
}

export interface WinnerThumbnailVariation {
  style: 'podium' | 'speed_highlight' | 'hall_of_fame';
  headline: string;
  prompt: string;
  reasoning: string;
  estimatedCtrScore: number;
}

@Entity('cs_quiz_winner_announcements')
export class QuizWinnerAnnouncement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'plan_id' })
  planId: string;

  @Column({ type: 'uuid', name: 'brand_id' })
  brandId: string;

  @Index()
  @Column({ type: 'int', name: 'quiz_number' })
  quizNumber: number;

  @Column({ type: 'text', nullable: true, name: 'quiz_topic' })
  quizTopic: string | null;

  @Column({ type: 'int', nullable: true, name: 'total_participants' })
  totalParticipants: number | null;

  @Column({ type: 'text', nullable: true, name: 'speed_highlight' })
  speedHighlight: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  winners: QuizWinner[];

  @Column({ type: 'jsonb', nullable: true })
  posts: WinnerPosts | null;

  @Column({ type: 'jsonb', nullable: true, name: 'thumbnail_prompts' })
  thumbnailPrompts: WinnerThumbnailVariation[] | null;

  @Column({ type: 'varchar', length: 80, nullable: true, name: 'posts_model' })
  postsModel: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true, name: 'thumbnails_model' })
  thumbnailsModel: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, name: 'posts_cost_usd', default: 0 })
  postsCostUsd: string;

  @Column({ type: 'numeric', precision: 10, scale: 6, name: 'thumbnails_cost_usd', default: 0 })
  thumbnailsCostUsd: string;

  @Column({ type: 'varchar', length: 40, default: 'generated' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
