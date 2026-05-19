import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bull';
import { CareersIngestionService } from '../services/ingestion.service';

export const CAREERS_INGESTION_QUEUE = 'careers-ingestion';
const TICK = 'tick';

@Injectable()
@Processor(CAREERS_INGESTION_QUEUE)
export class CareersIngestionWorker implements OnModuleInit {
  private readonly logger = new Logger(CareersIngestionWorker.name);

  constructor(
    private readonly ingestion: CareersIngestionService,
    @InjectQueue(CAREERS_INGESTION_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    try {
      await this.queue.add(TICK, {}, {
        repeat: { cron: '0 */6 * * *' }, // every 6 hours
        jobId: 'careers-ingestion-cron',
        removeOnComplete: 20,
        removeOnFail: 10,
      });
      this.logger.log('Careers ingestion cron registered (every 6h)');
    } catch (e) {
      this.logger.warn(`Could not register careers cron: ${(e as Error).message}`);
    }
  }

  @Process(TICK)
  async tick() {
    this.logger.log('Careers ingestion starting…');
    const expired = await this.ingestion.expireStale();
    const result = await this.ingestion.fetchAll();
    this.logger.log(
      `Careers ingestion done: ${result.total} new, ${expired} expired`,
    );
    return result;
  }

  @Process('manual-fetch')
  async manualFetch() {
    await this.ingestion.expireStale();
    return this.ingestion.fetchAll();
  }
}
