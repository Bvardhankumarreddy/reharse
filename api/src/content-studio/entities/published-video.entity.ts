import {
  Entity, PrimaryGeneratedColumn, Column, Index, Unique,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type PublishStatus = 'pending' | 'uploaded' | 'live' | 'failed';

@Entity('cs_published_videos')
@Unique(['lessonId'])
export class PublishedVideo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  lessonId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  youtubeVideoId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  youtubeUrl: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /** Base64-encoded PNG from DALL-E (or another image model). */
  @Column({ type: 'text', nullable: true })
  thumbnailB64: string | null;

  @Column({ type: 'text', nullable: true })
  thumbnailPrompt: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  thumbnailModel: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: PublishStatus;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
