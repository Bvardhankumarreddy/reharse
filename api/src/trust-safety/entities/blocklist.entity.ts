import {
  Entity, PrimaryGeneratedColumn, Column, Index, Unique,
  CreateDateColumn,
} from 'typeorm';

export type BlockType = 'email' | 'ip' | 'device';

@Entity('ts_blocklist')
@Unique('uq_ts_block', ['blockType', 'blockValue'])
export class Blocklist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 40, name: 'block_type' })
  blockType: BlockType;

  @Index()
  @Column({ type: 'varchar', length: 500, name: 'block_value' })
  blockValue: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'blocked_by' })
  blockedBy: string | null;

  @CreateDateColumn({ name: 'blocked_at' })
  blockedAt: Date;

  @Column({ type: 'boolean', default: false })
  permanent: boolean;

  @Column({ type: 'timestamptz', nullable: true, name: 'expires_at' })
  expiresAt: Date | null;
}
