import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('user_feedbacks')
export class UserFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  /** 1–5 star rating */
  @Column({ type: 'int', nullable: true })
  rating: number | null;

  /** bug | feature | general | praise */
  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn()
  createdAt: Date;
}
