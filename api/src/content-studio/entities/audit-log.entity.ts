import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

export type AuditEntityType = 'brand' | 'asset' | 'plan' | 'memory';
export type AuditAction = 'created' | 'updated' | 'deleted' | 'rolled_back';

/** One row per admin-driven mutation worth showing in the timeline. */
@Entity('cs_audit_log')
@Index(['entityType', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  entityType: AuditEntityType;

  @Column({ type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userEmail: string | null;

  @Column({ type: 'varchar', length: 40 })
  action: AuditAction;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
