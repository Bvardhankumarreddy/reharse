import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

/**
 * Separate from cs_audit_log — different volume profile (every quiz
 * start/submit decision logs here) and different schema (no entity
 * before/after diff, just action + details).
 */
@Entity('ts_audit_log')
export class TsAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  actor: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true, name: 'target_type' })
  targetType: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true, name: 'target_id' })
  targetId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ type: 'inet', nullable: true, name: 'ip_address' })
  ipAddress: string | null;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
