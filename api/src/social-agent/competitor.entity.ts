import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  OneToMany, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { SocialPlatform } from './social-post.entity';

/**
 * Phase 5: competitor channel tracking.
 *
 * REALITY CHECK: scraping competitor posts via the public APIs is against ToS
 * for LinkedIn / Instagram / YouTube. So this entity supports MANUAL tracking
 * only — admin enters handle, name, optional follower count + makes notes.
 */
@Entity('competitor_channels')
export class CompetitorChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  platform: SocialPlatform;

  @Column({ type: 'varchar', length: 200 })
  handle: string;

  @Column({ type: 'varchar', length: 200 })
  displayName: string;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  /** Manual snapshot: follower count last time admin checked */
  @Column({ type: 'int', nullable: true })
  followerCount: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  followerCountUpdatedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @OneToMany(() => CompetitorNote, (n) => n.competitor, { cascade: true })
  notes: CompetitorNote[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('competitor_notes')
export class CompetitorNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  competitorId: string;

  @ManyToOne(() => CompetitorChannel, (c) => c.notes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'competitorId' })
  competitor: CompetitorChannel;

  @Column({ type: 'text' })
  content: string;

  /** Optional URL to a specific post being noted */
  @Column({ type: 'text', nullable: true })
  referenceUrl: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  authorEmail: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
