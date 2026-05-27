import {
  Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { ShortScript } from './short-script.entity';

export interface AqbPostmortemContent {
  worked?: string[];
  didntWork?: string[];
  next?: string[];
  reusableHookPattern?: string;
  winningThumbnailStyle?: string;
  topicSignal?: string;
}

/** One LLM-analyzed postmortem per published AQB short. */
@Entity('aqb_short_postmortems')
export class AqbShortPostmortem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  scriptId: string;

  @OneToOne(() => ShortScript, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scriptId' })
  script: ShortScript;

  @Column({ type: 'jsonb' })
  content: AqbPostmortemContent;

  @Column({ type: 'varchar', length: 100, nullable: true })
  modelUsed: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  costUsd: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
