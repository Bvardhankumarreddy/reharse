import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bull';
import { QuizSubscriberService } from './quiz-subscriber.service';
import { CronGateService } from '../system/services/cron-gate.service';

export const QUIZ_NOTIFIER_QUEUE = 'quiz-notifier';

@Injectable()
@Processor(QUIZ_NOTIFIER_QUEUE)
export class QuizNotifierWorker implements OnModuleInit {
  private readonly logger = new Logger(QuizNotifierWorker.name);

  constructor(
    private readonly subscribers: QuizSubscriberService,
    private readonly cronGate: CronGateService,
    @InjectQueue(QUIZ_NOTIFIER_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    // Tick every 5 minutes. The service's 15-min horizon means a quiz
    // starting at exactly minute T gets notified at one of T-15..T-10..T-5.
    const canonical = [
      { name: 'notify-due',        cron: '*/5 * * * *', jobId: 'quiz-notify-cron' },
      // Weekly Monday 03:00 UTC — keep notifiedWeeks tidy.
      { name: 'prune-notified-log', cron: '0 3 * * 1',  jobId: 'quiz-prune-cron' },
    ];
    try {
      const existing = await this.queue.getRepeatableJobs();
      for (const job of existing) {
        const match = canonical.find((c) => c.name === job.name);
        if (match && job.cron !== match.cron) {
          await this.queue.removeRepeatableByKey(job.key);
          this.logger.log(
            `Dropped stale repeatable "${job.name}" cron "${job.cron}" — reinstalling`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(`Quiz notifier stale-cron cleanup failed: ${(e as Error).message}`);
    }
    try {
      await Promise.all(canonical.map((c) =>
        this.queue.add(c.name, {}, {
          repeat: { cron: c.cron },
          jobId: c.jobId,
          removeOnComplete: 10, removeOnFail: 5,
        }),
      ));
      this.logger.log('Quiz notifier crons registered (notify every 5 min, prune Mondays)');
    } catch (e) {
      this.logger.warn(`Quiz notifier cron registration failed: ${(e as Error).message}`);
    }
  }

  @Process('notify-due')
  async runNotify() {
    if (await this.cronGate.isPaused()) {
      this.logger.log('notify-due skipped — global cron gate is PAUSED');
      return { skipped: true };
    }
    return this.subscribers.runDueNotificationsBatch();
  }

  @Process('prune-notified-log')
  async runPrune() {
    if (await this.cronGate.isPaused()) {
      this.logger.log('prune-notified-log skipped — global cron gate is PAUSED');
      return { skipped: true };
    }
    return this.subscribers.pruneStaleNotificationLogs();
  }
}
