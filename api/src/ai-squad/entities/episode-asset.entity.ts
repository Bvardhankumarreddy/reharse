import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Episode } from './episode.entity';

export type AssetType = 'final_video' | 'thumbnail' | 'shorts_clip';

@Entity('ai_squad_episode_assets')
export class EpisodeAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  episodeId: string;

  @ManyToOne(() => Episode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'episodeId' })
  episode: Episode;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  assetType: AssetType;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  url: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
