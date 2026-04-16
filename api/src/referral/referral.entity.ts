import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('referrals')
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 12 })
  code: string;

  @Column()
  referrerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrerId' })
  referrer: User;

  @Column({ nullable: true })
  referredUserId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'referredUserId' })
  referredUser: User;

  @Column({ type: 'varchar', default: 'pending' })
  status: 'pending' | 'completed' | 'rewarded';

  @Column({ default: false })
  referrerRewarded: boolean;

  @Column({ default: false })
  referredRewarded: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
