import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SystemSetting } from '../entities/system-setting.entity';
import { CRON_REGISTRY } from '../constants/cron-registry';

const KEY_PREFIX = 'cron.';
const CACHE_TTL_MS = 30_000;

/**
 * Per-cron kill-switch. Every scheduled TICK handler passes its own
 * cron key (from CRON_KEYS) to isPaused(); the flag is stored per-key
 * so operators can pause individual crons — e.g. stop AQB script-gen
 * while leaving AI Pulse ingestion running.
 *
 * DB keys are 'cron.<key>' (e.g. 'cron.aqb.script-gen'). Kept in the
 * same system_settings table as any future scalar setting; the prefix
 * lets us slice cron-related rows out in one query for the admin list.
 *
 * Manual admin actions (Regen Script, Generate Scenes, publish endpoints)
 * are NEVER gated — they bypass this service entirely.
 *
 * A single-row full-map cache (30s TTL) means the busy :00 cron minute
 * doesn't hammer Postgres; a lookup is a Map hit. Set-side flips bust
 * the same-process cache immediately.
 */
@Injectable()
export class CronGateService implements OnModuleInit {
  private readonly logger = new Logger(CronGateService.name);
  private cache: { map: Map<string, boolean>; loadedAt: number } | null = null;

  constructor(
    @InjectRepository(SystemSetting)
    private readonly repo: Repository<SystemSetting>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const map = await this.loadAll();
      const paused = [...map.entries()].filter(([, v]) => v).map(([k]) => k);
      this.logger.log(
        paused.length === 0
          ? `CronGate initialised — 0 crons paused, ${CRON_REGISTRY.length} running`
          : `CronGate initialised — ${paused.length} paused: ${paused.join(', ')}`,
      );
    } catch (e) {
      this.logger.warn(
        `CronGate init skipped — table likely missing ` +
        `(run migration-001-system-settings.sql). ` +
        `Failing OPEN: all crons will run. Error: ${(e as Error).message}`,
      );
    }
  }

  /** Fast per-key check; cache-first, DB fallback on miss. */
  async isPaused(cronKey: string): Promise<boolean> {
    const map = await this.getMap();
    return map.get(cronKey) ?? false;
  }

  async setPaused(
    cronKey: string,
    paused: boolean,
    actor: string | null,
  ): Promise<void> {
    if (!CRON_REGISTRY.some((c) => c.key === cronKey)) {
      throw new Error(`Unknown cron key: ${cronKey}`);
    }
    const dbKey = KEY_PREFIX + cronKey;
    const existing = await this.repo.findOne({ where: { key: dbKey } });
    if (existing) {
      existing.value = paused;
      existing.updated_by = actor;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({
        key: dbKey,
        value: paused,
        updated_by: actor,
      }));
    }
    // Update the in-process cache immediately so this pod's next
    // isPaused() call sees the change without waiting for the TTL.
    if (this.cache) this.cache.map.set(cronKey, paused);
    this.logger.log(
      `Cron '${cronKey}' ${paused ? 'PAUSED' : 'RESUMED'} by ${actor ?? 'system'}`,
    );
  }

  /** Returns the full status list joined against the registry, for the
   *  admin UI. Rows missing from the DB default to paused=false. */
  async listStatus(): Promise<Array<{
    key:        string;
    label:      string;
    module:     string;
    schedule:   string;
    paused:     boolean;
    updated_at: Date | null;
    updated_by: string | null;
  }>> {
    const rows = await this.repo.find({
      where: { key: In(CRON_REGISTRY.map((c) => KEY_PREFIX + c.key)) },
    });
    const byKey = new Map<string, SystemSetting>(
      rows.map((r) => [r.key.slice(KEY_PREFIX.length), r]),
    );
    return CRON_REGISTRY.map((c) => {
      const row = byKey.get(c.key);
      return {
        key:        c.key,
        label:      c.label,
        module:     c.module,
        schedule:   c.schedule,
        paused:     Boolean(row?.value),
        updated_at: row?.updated_at ?? null,
        updated_by: row?.updated_by ?? null,
      };
    });
  }

  private async getMap(): Promise<Map<string, boolean>> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS) {
      return this.cache.map;
    }
    let map: Map<string, boolean>;
    try {
      map = await this.loadAll();
    } catch {
      // Fail open on any DB error — a broken settings table must not
      // turn every cron into a no-op.
      map = new Map();
    }
    this.cache = { map, loadedAt: Date.now() };
    return map;
  }

  private async loadAll(): Promise<Map<string, boolean>> {
    const rows = await this.repo.find({
      where: { key: In(CRON_REGISTRY.map((c) => KEY_PREFIX + c.key)) },
    });
    return new Map(rows.map((r) => [r.key.slice(KEY_PREFIX.length), Boolean(r.value)]));
  }
}
