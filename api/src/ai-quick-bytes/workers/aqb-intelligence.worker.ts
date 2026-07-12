import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bull';
import axios from 'axios';
import { AqbMetricsFetcherService } from '../services/aqb-metrics-fetcher.service';
import { AqbPostmortemAgent } from '../agents/aqb-postmortem.agent';
import { AqbImprovementAgent } from '../agents/aqb-improvement.agent';
import { CronGateService } from '../../system/services/cron-gate.service';

export const AQB_INTELLIGENCE_QUEUE = 'aqb-intelligence';

/**
 * Runs the AQB learning loop:
 *  - aqb-metrics-sweep    : hourly @ :20 — pull YouTube stats for published shorts.
 *  - aqb-postmortem-sweep : daily 04:30 UTC — generate postmortems for shorts ≥3d old.
 *  - aqb-improvement-sweep: daily 06:00 UTC — promote winners to AqbMemory.
 *
 * Improvement runs daily (was weekly) so a NEW winner discovered today
 * influences tomorrow's script-gen cron at 05:30 UTC the next day, instead
 * of waiting up to 7 days. promoteUnique() dedupes by content hash, so
 * idle days are no-ops — no noise accumulates.
 *
 * Quiet by design: only Slack-notify when a run actually changes something
 * (matches Content Studio's pattern). Slack uses CS_SLACK_WEBHOOK_URL when set.
 */
@Injectable()
@Processor(AQB_INTELLIGENCE_QUEUE)
export class AqbIntelligenceWorker implements OnModuleInit {
  private readonly logger = new Logger(AqbIntelligenceWorker.name);
  private readonly slackUrl: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: AqbMetricsFetcherService,
    private readonly postmortem: AqbPostmortemAgent,
    private readonly improvement: AqbImprovementAgent,
    private readonly cronGate: CronGateService,
    @InjectQueue(AQB_INTELLIGENCE_QUEUE) private readonly queue: Queue,
  ) {
    this.slackUrl = this.config.get<string>('CS_SLACK_WEBHOOK_URL');
  }

  async onModuleInit() {
    // Bull-MQ keys repeatables by (name, jobId, cron). When we change a
    // cron expression for a job that's already registered, Bull treats
    // it as a brand-new repeatable AND leaves the old one armed — so
    // both fire until the worker is wiped. Defensive cleanup: drop any
    // stale repeatable whose cron doesn't match the current canonical
    // value below, then re-register from scratch.
    const canonical: Array<{ name: string; cron: string; jobId: string }> = [
      { name: 'aqb-metrics-sweep',     cron: '20 * * * *', jobId: 'aqb-metrics-cron' },
      { name: 'aqb-postmortem-sweep',  cron: '30 4 * * *', jobId: 'aqb-postmortem-cron' },
      { name: 'aqb-improvement-sweep', cron: '0 6 * * *',  jobId: 'aqb-improvement-cron' },
    ];
    try {
      const existing = await this.queue.getRepeatableJobs();
      let dropped = 0;
      for (const job of existing) {
        const match = canonical.find((c) => c.name === job.name);
        // Drop if it's one of ours but the cron has drifted (e.g. we
        // just flipped improvement from Mondays to daily), so the next
        // queue.add() reinstalls a clean repeatable.
        if (match && job.cron !== match.cron) {
          await this.queue.removeRepeatableByKey(job.key);
          dropped++;
          this.logger.log(
            `Dropped stale repeatable "${job.name}" (cron "${job.cron}") — ` +
            `re-installing with current cron "${match.cron}"`,
          );
        }
      }
      if (dropped > 0) this.logger.log(`Cleaned up ${dropped} stale AQB cron(s)`);
    } catch (e) {
      this.logger.warn(`Stale-cron cleanup failed (non-fatal): ${(e as Error).message}`);
    }

    const adds = [
      this.queue.add('aqb-metrics-sweep', {}, {
        repeat: { cron: '20 * * * *' },   // hourly @ :20
        jobId: 'aqb-metrics-cron',
        removeOnComplete: 20, removeOnFail: 10,
      }),
      this.queue.add('aqb-postmortem-sweep', {}, {
        repeat: { cron: '30 4 * * *' },   // daily 04:30 UTC
        jobId: 'aqb-postmortem-cron',
        removeOnComplete: 10, removeOnFail: 5,
      }),
      this.queue.add('aqb-improvement-sweep', {}, {
        repeat: { cron: '0 6 * * *' },    // daily 06:00 UTC (was Mondays)
        jobId: 'aqb-improvement-cron',
        removeOnComplete: 10, removeOnFail: 5,
      }),
    ];
    try {
      await Promise.all(adds);
      this.logger.log(
        'AQB intelligence crons registered (metrics hourly, postmortem daily, improvement daily)',
      );
    } catch (e) {
      this.logger.warn(`Could not register AQB intelligence crons: ${(e as Error).message}`);
    }
  }

  @Process('aqb-metrics-sweep')
  async metricsSweep() {
    if (await this.cronGate.isPaused()) {
      this.logger.log('aqb-metrics-sweep skipped — global cron gate is PAUSED');
      return { skipped: true };
    }
    const r = await this.metrics.fetchAll();
    if (r.saved > 0) {
      await this.notify(`:zap: aqb · metrics-sweep · ${r.saved} snapshot(s) across ${r.scanned} short(s)`);
    }
    return r;
  }

  @Process('aqb-postmortem-sweep')
  async postmortemSweep() {
    if (await this.cronGate.isPaused()) {
      this.logger.log('aqb-postmortem-sweep skipped — global cron gate is PAUSED');
      return { skipped: true };
    }
    const r = await this.postmortem.runDailyBatch();
    if (r.generated > 0) {
      await this.notify(`:zap: aqb · postmortem-sweep · ${r.generated}/${r.scanned} written`);
    }
    return r;
  }

  @Process('aqb-improvement-sweep')
  async improvementSweep() {
    if (await this.cronGate.isPaused()) {
      this.logger.log('aqb-improvement-sweep skipped — global cron gate is PAUSED');
      return { skipped: true };
    }
    const r = await this.improvement.runWeekly();
    if (r.promoted > 0) {
      await this.notify(
        `:zap: aqb · improvement-sweep · promoted ${r.promoted} winning pattern(s) ` +
        `from ${r.winners}/${r.scanned} winning short(s)`,
      );
    }
    return r;
  }

  private async notify(text: string): Promise<void> {
    if (!this.slackUrl) return;
    try { await axios.post(this.slackUrl, { text }, { timeout: 5_000 }); }
    catch (e) { this.logger.warn(`AQB Slack notify failed: ${(e as Error).message}`); }
  }
}
