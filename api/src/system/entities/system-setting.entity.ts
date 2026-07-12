import {
  Column, Entity, PrimaryColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * Simple key/value store for operator-tunable global settings.
 *
 * Currently used by CronGateService (key='crons.paused'). Kept as a
 * generic table so future single-value settings (feature flags,
 * kill-switches) can reuse it instead of proliferating one-column tables.
 */
@Entity('system_settings')
export class SystemSetting {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @Column({ type: 'varchar', length: 255, nullable: true })
  updated_by: string | null;

  @UpdateDateColumn()
  updated_at: Date;
}
