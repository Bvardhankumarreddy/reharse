import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bull';
import axios from 'axios';
import { AqbMetricsFetcherService } from '../services/aqb-metrics-fetcher.service';
import { AqbPostmortemAgent } from '../agents/aqb-postmortem.agent';
import { AqbImprovementAgent } from '../agents/aqb-improvement.agent';

export const AQB_INTELLIGENCE_QUEUE = 'aqb-intelligence';

/**
 * Runs the AQB learning loop:
 *  - aqb-metrics-sweep    : hourly @ :20 — pull YouTube stats for published shorts.
 *  - aqb-postmortem-sweep : daily 04:30 UTC — generate postmortems for shorts ≥3d old.
 *  - aqb-improvement-sweep: weekly Mon 06:00 UTC — promote winners to AqbMemory.
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
    @InjectQueue(AQB_INTELLIGENCE_QUEUE) private readonly queue: Queue,
  ) {
    this.slackUrl = this.config.get<string>('CS_SLACK_WEBHOOK_URL');
  }

  async onModuleInit() {
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
        repeat: { cron: '0 6 * * 1' },    // Mondays 06:00 UTC
        jobId: 'aqb-improvement-cron',
        removeOnComplete: 10, removeOnFail: 5,
      }),
    ];
    try {
      await Promise.all(adds);
      this.logger.log('AQB intelligence crons registered (metrics hourly, postmortem daily, improvement weekly)');
    } catch (e) {
      this.logger.warn(`Could not register AQB intelligence crons: ${(e as Error).message}`);
    }
  }

  @Process('aqb-metrics-sweep')
  async metricsSweep() {
    const r = await this.metrics.fetchAll();
    if (r.saved > 0) {
      await this.notify(`:zap: aqb · metrics-sweep · ${r.saved} snapshot(s) across ${r.scanned} short(s)`);
    }
    return r;
  }

  @Process('aqb-postmortem-sweep')
  async postmortemSweep() {
    const r = await this.postmortem.runDailyBatch();
    if (r.generated > 0) {
      await this.notify(`:zap: aqb · postmortem-sweep · ${r.generated}/${r.scanned} written`);
    }
    return r;
  }

  @Process('aqb-improvement-sweep')
  async improvementSweep() {
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
