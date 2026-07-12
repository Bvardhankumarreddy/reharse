import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue, Job } from 'bull';
import { ScriptGeneratorService } from '../services/script-generator.service';
import { CronGateService } from '../../system/services/cron-gate.service';
import { CRON_KEYS } from '../../system/constants/cron-registry';

export const AQB_SCRIPT_GEN_QUEUE = 'aqb-script-gen';
const TICK = 'tick';

@Injectable()
@Processor(AQB_SCRIPT_GEN_QUEUE)
export class ScriptGenWorker implements OnModuleInit {
  private readonly logger = new Logger(ScriptGenWorker.name);

  constructor(
    private readonly scriptGen: ScriptGeneratorService,
    private readonly cronGate: CronGateService,
    @InjectQueue(AQB_SCRIPT_GEN_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    try {
      await this.queue.add(TICK, {}, {
        // Once daily 05:30 UTC (11:00 IST) — generate scripts for the day's top stories.
        repeat: { cron: '30 5 * * *' },
        jobId: 'aqb-script-gen-cron',
        removeOnComplete: 30,
        removeOnFail: 20,
      });
      this.logger.log('AQB script-gen cron registered (daily 05:30 UTC)');
    } catch (e) {
      this.logger.warn(`Could not register script-gen cron: ${(e as Error).message}`);
    }
  }

  @Process(TICK)
  async tick() {
    if (await this.cronGate.isPaused(CRON_KEYS.AQB_SCRIPT_GEN)) {
      this.logger.log(`Skipped — cron '${CRON_KEYS.AQB_SCRIPT_GEN}' is PAUSED`);
      return { skipped: true };
    }
    const generated = await this.scriptGen.generateForTopStories();
    if (generated > 0) this.logger.log(`Generated ${generated} script(s)`);
    return { generated };
  }

  @Process('manual-generate')
  async manualGenerate(job: Job<{ limit?: number }>) {
    return {
      generated: await this.scriptGen.generateForTopStories(job.data.limit ?? 3),
    };
  }

  @Process('generate-one')
  async generateOne(job: Job<{ newsItemId: string; existingScriptId?: string }>) {
    const script = await this.scriptGen.generateScript(job.data.newsItemId, {
      existingScriptId: job.data.existingScriptId,
    });
    return { scriptId: script.id };
  }
}
