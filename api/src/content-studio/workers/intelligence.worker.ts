import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bull';
import { CompetitorFetcherService } from '../services/competitor-fetcher.service';
import { MetricsFetcherService } from '../services/metrics-fetcher.service';

export const CS_INTELLIGENCE_QUEUE = 'content-studio-intelligence';

/**
 * Phase D crons (Bull). Two scheduled jobs:
 *   - competitor-sweep: nightly, fetches recent competitor videos.
 *   - metrics-sweep:    hourly, refreshes per-lesson YouTube counts.
 * Both no-op cleanly when CS_YT_API_KEY is unset.
 */
@Injectable()
@Processor(CS_INTELLIGENCE_QUEUE)
export class IntelligenceWorker implements OnModuleInit {
  private readonly logger = new Logger(IntelligenceWorker.name);

  constructor(
    private readonly competitor: CompetitorFetcherService,
    private readonly metrics: MetricsFetcherService,
    @InjectQueue(CS_INTELLIGENCE_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    const adds = [
      this.queue.add('competitor-sweep', {}, {
        repeat: { cron: '0 3 * * *' }, // 03:00 UTC daily
        jobId: 'cs-competitor-cron',
        removeOnComplete: 10, removeOnFail: 5,
      }),
      this.queue.add('metrics-sweep', {}, {
        repeat: { cron: '15 * * * *' }, // top of each hour + 15
        jobId: 'cs-metrics-cron',
        removeOnComplete: 20, removeOnFail: 10,
      }),
    ];
    try {
      await Promise.all(adds);
      this.logger.log('Phase D crons registered (competitor nightly, metrics hourly)');
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
}
