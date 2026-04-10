import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, JobCounts } from 'bull';
import {
  QUEUES,
  FEEDBACK_JOBS,
  DIGEST_JOBS,
  EVALUATE_JOB_OPTIONS,
  DIGEST_FANOUT_OPTIONS,
} from './queue.constants';
import type { FeedbackJobData } from './feedback.processor';
import type { DigestFanoutData } from './digest.processor';

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue(QUEUES.FEEDBACK) private readonly feedbackQueue: Queue,
    @InjectQueue(QUEUES.DIGEST)   private readonly digestQueue:   Queue,
  ) {}

  // ── Feedback ──────────────────────────────────────────────────────────────

  /** Enqueue an AI evaluation job for a completed session.
   *  Called by SessionsController (or the WebSocket gateway) after session ends. */
  async enqueueEvaluation(data: FeedbackJobData) {
    const job = await this.feedbackQueue.add(
      FEEDBACK_JOBS.EVALUATE,
      data,
      EVALUATE_JOB_OPTIONS,
    );
    this.logger.log(`Enqueued evaluation job ${job.id} for session ${data.sessionId}`);
    return { jobId: job.id as string };
  }

  // ── Digest ────────────────────────────────────────────────────────────────

  /** Manually trigger the weekly digest fan-out (also runs on cron schedule).
   *  Useful for testing or admin-triggered sends. */
  async triggerWeeklyDigest() {
    const job = await this.digestQueue.add(
      DIGEST_JOBS.WEEKLY_FANOUT,
      {} as DigestFanoutData,
      DIGEST_FANOUT_OPTIONS,
    );
    this.logger.log(`Triggered weekly digest fan-out job ${job.id}`);
    return { jobId: job.id as string };
  }

  // ── Queue health / introspection ──────────────────────────────────────────

  async getQueueStats(): Promise<{
    feedback: JobCounts;
    digest:   JobCounts;
  }> {
    const [feedback, digest] = await Promise.all([
      this.feedbackQueue.getJobCounts(),
      this.digestQueue.getJobCounts(),
    ]);
    return { feedback, digest };
  }

  async getFailedFeedbackJobs(limit = 20) {
    return this.feedbackQueue.getFailed(0, limit - 1);
  }

  /** Register the weekly digest cron on startup.
   *  Bull deduplicates repeatable jobs by key — safe to call on every boot. */
  async onModuleInit() {
    try {
      await this.digestQueue.add(
        DIGEST_JOBS.WEEKLY_FANOUT,
        {},
        {
          ...DIGEST_FANOUT_OPTIONS,
          repeat: { cron: '0 8 * * 1' }, // every Monday 08:00 UTC
          jobId:  'weekly-digest-cron',  // stable ID prevents duplicates
        },
      );
    } catch {
      // Silently skip if Redis is unavailable (e.g. during unit tests)
    }
  }

  async retryAllFailedFeedback() {
    const failed = await this.feedbackQueue.getFailed();
    await Promise.all(failed.map(j => j.retry()));
    this.logger.log(`Retried ${failed.length} failed feedback jobs`);
    return { retried: failed.length };
  }
}
