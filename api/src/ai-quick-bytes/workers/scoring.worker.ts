import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue, Job } from 'bull';
import { ScoringService } from '../services/scoring.service';
import { CronGateService } from '../../system/services/cron-gate.service';
import { CRON_KEYS } from '../../system/constants/cron-registry';

export const AQB_SCORING_QUEUE = 'aqb-scoring';
const TICK = 'tick';

@Injectable()
@Processor(AQB_SCORING_QUEUE)
export class ScoringWorker implements OnModuleInit {
  private readonly logger = new Logger(ScoringWorker.name);

  constructor(
    private readonly scoring: ScoringService,
    private readonly cronGate: CronGateService,
    @InjectQueue(AQB_SCORING_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    try {
      await this.queue.add(TICK, {}, {
        // 15 min after the hour/half-hour so ingestion has populated raw items.
        repeat: { cron: '15,45 * * * *' },
        jobId: 'aqb-scoring-cron',
        removeOnComplete: 50,
        removeOnFail: 20,
      });
      this.logger.log('AQB scoring cron registered (:15 and :45)');
    } catch (e) {
      this.logger.warn(`Could not register scoring cron: ${(e as Error).message}`);
    }
  }

  @Process(TICK)
  async tick() {
    if (await this.cronGate.isPaused(CRON_KEYS.AQB_SCORING)) {
      this.logger.log(`Skipped — cron '${CRON_KEYS.AQB_SCORING}' is PAUSED`);
      return { skipped: true };
    }
    const scored = await this.scoring.scoreUnscoredItems();
    if (scored > 0) this.logger.log(`Scored ${scored} item(s)`);
    return { scored };
  }

  @Process('manual-score')
  async manualScore(job: Job<{ limit?: number }>) {
    return { scored: await this.scoring.scoreUnscoredItems(job.data.limit ?? 50) };
  }
}
