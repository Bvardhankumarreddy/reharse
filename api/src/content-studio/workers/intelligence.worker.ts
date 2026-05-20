import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bull';
import { CompetitorFetcherService } from '../services/competitor-fetcher.service';
import { MetricsFetcherService } from '../services/metrics-fetcher.service';
import { PostmortemAgent } from '../agents/postmortem.agent';
import { ImprovementAgent } from '../agents/improvement.agent';

export const CS_INTELLIGENCE_QUEUE = 'content-studio-intelligence';

/**
 * Phase D crons (Bull). Four scheduled jobs:
 *   - competitor-sweep:   nightly 03:00 UTC — fetch recent competitor videos.
 *   - metrics-sweep:      :15 every hour — refresh per-lesson YouTube counts.
 *   - postmortem-sweep:   nightly 04:00 UTC — write postmortems for any
 *     lesson published ≥7 days ago that has metrics but no postmortem yet.
 *   - improvement-sweep:  Mondays 05:00 UTC — promote winning hook patterns
 *     into cs_brand_memories (Improvement Agent).
 *
 * YT-dependent jobs no-op cleanly when CS_YT_API_KEY is unset; the
 * postmortem + improvement jobs work as soon as a brand has ≥3 lessons
 * with metrics (so they're effectively dormant until publishing starts).
 */
@Injectable()
@Processor(CS_INTELLIGENCE_QUEUE)
export class IntelligenceWorker implements OnModuleInit {
  private readonly logger = new Logger(IntelligenceWorker.name);

  constructor(
    private readonly competitor: CompetitorFetcherService,
    private readonly metrics: MetricsFetcherService,
    private readonly postmortem: PostmortemAgent,
    private readonly improvement: ImprovementAgent,
    @InjectQueue(CS_INTELLIGENCE_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    const adds = [
      this.queue.add('competitor-sweep', {}, {
        repeat: { cron: '0 3 * * *' },   // 03:00 UTC daily
        jobId: 'cs-competitor-cron',
        removeOnComplete: 10, removeOnFail: 5,
      }),
      this.queue.add('metrics-sweep', {}, {
        repeat: { cron: '15 * * * *' },  // :15 every hour
        jobId: 'cs-metrics-cron',
        removeOnComplete: 20, removeOnFail: 10,
      }),
      this.queue.add('postmortem-sweep', {}, {
        repeat: { cron: '0 4 * * *' },   // 04:00 UTC daily (1h after competitors)
        jobId: 'cs-postmortem-cron',
        removeOnComplete: 10, removeOnFail: 5,
      }),
      this.queue.add('improvement-sweep', {}, {
        repeat: { cron: '0 5 * * 1' },   // Mondays 05:00 UTC
        jobId: 'cs-improvement-cron',
        removeOnComplete: 10, removeOnFail: 5,
      }),
    ];
    try {
      await Promise.all(adds);
      this.logger.log(
        'Phase D crons registered (competitor nightly, metrics hourly, ' +
        'postmortem nightly, improvement weekly)',
      );
    } catch (e) {
      this.logger.warn(`Could not register intelligence crons: ${(e as Error).message}`);
    }
  }

  @Process('competitor-sweep')
  async competitorSweep() {
    return this.competitor.fetchAll();
  }

  @Process('metrics-sweep')
  async metricsSweep() {
    return this.metrics.fetchAll();
  }

  @Process('postmortem-sweep')
  async postmortemSweep() {
    return this.postmortem.runDailyBatch();
  }

  @Process('improvement-sweep')
  async improvementSweep() {
    return this.improvement.runForAllBrands();
  }
}
