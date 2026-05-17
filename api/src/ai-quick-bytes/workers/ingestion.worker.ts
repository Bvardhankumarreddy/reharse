import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue, Job } from 'bull';
import { IngestionService } from '../services/ingestion.service';

export const AQB_INGESTION_QUEUE = 'aqb-ingestion';
const TICK = 'tick';

@Injectable()
@Processor(AQB_INGESTION_QUEUE)
export class IngestionWorker implements OnModuleInit {
  private readonly logger = new Logger(IngestionWorker.name);

  constructor(
    private readonly ingestion: IngestionService,
    @InjectQueue(AQB_INGESTION_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    try {
      await this.queue.add(TICK, {}, {
        repeat: { cron: '*/30 * * * *' }, // every 30 minutes
        jobId: 'aqb-ingestion-cron',
        removeOnComplete: 50,
        removeOnFail: 20,
      });
      this.logger.log('AQB ingestion cron registered (every 30 min)');
    } catch (e) {
      this.logger.warn(`Could not register ingestion cron: ${(e as Error).message}`);
    }
  }

  @Process(TICK)
  async tick() {
    this.logger.log('Scheduled news fetch starting…');
    const result = await this.ingestion.fetchAllSources();
    this.logger.log(`Fetch complete: ${result.total} new items`);
    return result;
  }

  @Process('manual-fetch')
  async manualFetch(job: Job<{ sourceId?: string }>) {
    return job.data.sourceId
      ? this.ingestion.fetchFromSource(job.data.sourceId)
      : this.ingestion.fetchAllSources();
  }
}
