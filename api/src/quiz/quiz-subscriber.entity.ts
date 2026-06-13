import {
  Entity, PrimaryGeneratedColumn, Column, Index, Unique, CreateDateColumn,
} from 'typeorm';

@Entity('quiz_subscribers')
@Unique('uq_quiz_sub_email', ['email'])
@Unique('uq_quiz_sub_token', ['unsubscribeToken'])
export class QuizSubscriber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  email: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name: string | null;

  @Column({ name: 'youtube_handle', type: 'varchar', length: 100, nullable: true })
  youtubeHandle: string | null;

  @Column({ name: 'unsubscribe_token', type: 'varchar', length: 64 })
  unsubscribeToken: string;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Quiz week numbers we've already emailed this subscriber about. */
  @Column({ name: 'notified_weeks', type: 'jsonb', default: () => "'[]'::jsonb" })
  notifiedWeeks: number[];

  @CreateDateColumn({ name: 'subscribed_at' })
  subscribedAt: Date;

  @Column({ name: 'last_notified_at', type: 'timestamp', nullable: true })
  lastNotifiedAt: Date | null;
}
