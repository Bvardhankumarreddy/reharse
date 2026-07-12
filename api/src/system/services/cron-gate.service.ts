import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from '../entities/system-setting.entity';

const KEY = 'crons.paused';
const CACHE_TTL_MS = 30_000;

/**
 * Global kill-switch for scheduled (cron) work across the platform.
 *
 * When paused, every worker's cron TICK handler checks isPaused() at the
 * top and returns early. Manual admin actions (regen script, generate
 * scenes, publish, etc.) are NOT gated — the operator still controls
 * those individually. Only scheduled repeaters idle out.
 *
 * Uses a 30-second in-memory cache so a heavy cron minute (many
 * repeaters firing at :00) doesn't hammer Postgres. Cache invalidates
 * immediately when setPaused() runs in the same process; other pods pick
 * up the flip within the TTL. Acceptable trade-off — a 30s lag on a
 * kill-switch is fine for cron work.
 */
@Injectable()
export class CronGateService implements OnModuleInit {
  private readonly logger = new Logger(CronGateService.name);
  private cached: { value: boolean; loadedAt: number } | null = null;

  constructor(
    @InjectRepository(SystemSetting)
    private readonly repo: Repository<SystemSetting>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Warm the cache and log initial state so pod boot logs show the
    // gate's current position.
    try {
      const paused = await this.isPaused();
      this.logger.log(
        `CronGate initialised — crons ${paused ? 'PAUSED (manual only)' : 'RUNNING'}`,
      );
    } catch (e) {
      // Table may not exist yet on a very first deploy before the migration
      // has been applied. Fail open (crons run) so we don't accidentally
      // stall the whole platform on a missing table.
      this.logger.warn(
        `CronGate init skipped — table likely missing ` +
        `(run migration-001-system-settings.sql). ` +
        `Failing OPEN: crons will run. Error: ${(e as Error).message}`,
      );
    }
  }

  async isPaused(): Promise<boolean> {
    if (
      this.cached &&
      Date.now() - this.cached.loadedAt < CACHE_TTL_MS
    ) {
      return this.cached.value;
    }
    let value = false;
    try {
      const row = await this.repo.findOne({ where: { key: KEY } });
      value = Boolean(row?.value);
    } catch {
      // Fail open on any DB error — a broken system_settings table must
      // not turn every cron into a no-op.
      value = false;
    }
    this.cached = { value, loadedAt: Date.now() };
    return value;
  }

  async setPaused(paused: boolean, actor: string | null): Promise<void> {
    const existing = await this.repo.findOne({ where: { key: KEY } });
    if (existing) {
      existing.value = paused;
      existing.updated_by = actor;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({
        key: KEY,
        value: paused,
        updated_by: actor,
      }));
    }
    // Bust local cache immediately so the same-process operator sees the
    // flip on the next isPaused() call.
    this.cached = { value: paused, loadedAt: Date.now() };
    this.logger.log(
      `Crons ${paused ? 'PAUSED' : 'RESUMED'} by ${actor ?? 'system'}`,
    );
  }

  async status(): Promise<{
    paused: boolean;
    updated_at: Date | null;
    updated_by: string | null;
  }> {
    const row = await this.repo.findOne({ where: { key: KEY } });
    return {
      paused: Boolean(row?.value),
      updated_at: row?.updated_at ?? null,
      updated_by: row?.updated_by ?? null,
    };
  }
}
