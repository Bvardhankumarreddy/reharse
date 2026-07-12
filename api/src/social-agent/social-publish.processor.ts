import { Process, Processor, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import type { Queue, Job } from 'bull';
import { SocialPost } from './social-post.entity';
import { LinkedInService } from './linkedin.service';
import { InstagramService, AUTO_PUBLISH_PLATFORMS } from './instagram.service';
import { CronGateService } from '../system/services/cron-gate.service';
import { CRON_KEYS } from '../system/constants/cron-registry';

export const SOCIAL_PUBLISH_QUEUE = 'social-publish';
export const SOCIAL_PUBLISH_JOB = 'tick';

const MAX_ATTEMPTS = 3;

@Injectable()
@Processor(SOCIAL_PUBLISH_QUEUE)
export class SocialPublishProcessor implements OnModuleInit {
  private readonly logger = new Logger(SocialPublishProcessor.name);

  constructor(
    @InjectRepository(SocialPost) private readonly posts: Repository<SocialPost>,
    @InjectQueue(SOCIAL_PUBLISH_QUEUE) private readonly queue: Queue,
    private readonly linkedin: LinkedInService,
    private readonly instagram: InstagramService,
    private readonly cronGate: CronGateService,
  ) {}

  async onModuleInit() {
    // Register the cron repeat (stable jobId prevents duplicates on restart)
    try {
      await this.queue.add(
        SOCIAL_PUBLISH_JOB,
        {},
        {
          repeat: { cron: '* * * * *' }, // every minute
          jobId: 'social-publish-cron',
          removeOnComplete: 50,
          removeOnFail: 20,
        },
      );
      this.logger.log('Social publish cron registered (every minute)');
    } catch (e) {
      this.logger.warn(`Could not register cron: ${(e as Error).message}`);
    }
  }

  /** Runs every minute — find approved posts whose scheduledAt has passed and publish them */
  @Process(SOCIAL_PUBLISH_JOB)
  async tick(_job: Job): Promise<{ processed: number; results: Array<{ id: string; ok: boolean; error?: string }> }> {
    if (await this.cronGate.isPaused(CRON_KEYS.SOCIAL_PUBLISH)) {
      this.logger.log(`Skipped — cron '${CRON_KEYS.SOCIAL_PUBLISH}' is PAUSED`);
      return { processed: 0, results: [] };
    }
    const due = await this.posts.find({
      where: {
        status: 'approved',
        scheduledAt: LessThanOrEqual(new Date()),
        platform: In(AUTO_PUBLISH_PLATFORMS),
      },
      take: 10,
      order: { scheduledAt: 'ASC' },
    });

    if (due.length === 0) return { processed: 0, results: [] };
    this.logger.log(`Found ${due.length} due post(s) — publishing`);

    const results = [];
    for (const post of due) {
      const r = await this.publishOne(post);
      results.push({ id: post.id, ok: r.success, error: r.error });
    }
    return { processed: due.length, results };
  }

  /** Publish a single post — used by both the cron and the manual "Publish Now" endpoint */
  async publishOne(post: SocialPost): Promise<{ success: boolean; error?: string }> {
    // Lock the row so a concurrent run doesn't double-publish
    await this.posts.update(post.id, { status: 'publishing' });

    if (!AUTO_PUBLISH_PLATFORMS.includes(post.platform)) {
      // Not yet auto-publishable (e.g. instagram_story, whatsapp_status, youtube_community)
      await this.posts.update(post.id, { status: 'approved' });
      return { success: false, error: `Auto-publish not supported for ${post.platform}` };
    }

    const result = post.platform === 'instagram_feed'
      ? await this.instagram.publish(post)
      : await this.linkedin.publish(post);

    if (result.success) {
      await this.posts.update(post.id, {
        status: 'published_auto',
        publishedAt: new Date(),
        externalPostId: result.externalId ?? null,
        externalUrl: result.externalUrl ?? null,
        failureReason: null,
      });
      this.logger.log(`✅ Published ${post.id} → ${result.externalUrl}`);
      return { success: true };
    }

    // Failed — record + decide retry vs giveup
    const attempts = (post.publishAttempts ?? 0) + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;
    await this.posts.update(post.id, {
      status: giveUp ? 'failed' : 'approved',
      publishAttempts: attempts,
      lastPublishAttemptAt: new Date(),
      failureReason: result.error ?? 'Unknown error',
    });
    this.logger.warn(`❌ Publish failed (attempt ${attempts}/${MAX_ATTEMPTS}) for ${post.id}: ${result.error}`);
    return { success: false, error: result.error };
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: { processed: number }): void {
    if (result?.processed > 0) {
      this.logger.log(`Tick ${job.id} — processed ${result.processed} post(s)`);
    }
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error): void {
    this.logger.error(`Tick ${job.id} failed: ${err.message}`);
  }
}
