import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import type { Queue, Job } from 'bull';
import { SocialPost } from './social-post.entity';
import { PostEngagement } from './post-engagement.entity';
import { LinkedInService, type EngagementStats } from './linkedin.service';
import { InstagramService } from './instagram.service';
import { CronGateService } from '../system/services/cron-gate.service';

export const ENGAGEMENT_SYNC_QUEUE = 'social-engagement-sync';
export const ENGAGEMENT_SYNC_JOB = 'tick';

@Injectable()
@Processor(ENGAGEMENT_SYNC_QUEUE)
export class EngagementSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(EngagementSyncProcessor.name);

  constructor(
    @InjectRepository(SocialPost) private readonly posts: Repository<SocialPost>,
    @InjectRepository(PostEngagement) private readonly engagement: Repository<PostEngagement>,
    @InjectQueue(ENGAGEMENT_SYNC_QUEUE) private readonly queue: Queue,
    private readonly linkedin: LinkedInService,
    private readonly instagram: InstagramService,
    private readonly cronGate: CronGateService,
  ) {}

  async onModuleInit() {
    try {
      await this.queue.add(
        ENGAGEMENT_SYNC_JOB,
        {},
        {
          repeat: { cron: '15 * * * *' }, // hourly at :15 (offset from publish cron)
          jobId: 'engagement-sync-cron',
          removeOnComplete: 24,
          removeOnFail: 12,
        },
      );
      this.logger.log('Engagement sync cron registered (hourly @ :15)');
    } catch (e) {
      this.logger.warn(`Could not register engagement cron: ${(e as Error).message}`);
    }
  }

  /** Pull stats for posts published in the last 30 days, save daily snapshot */
  @Process(ENGAGEMENT_SYNC_JOB)
  async tick(_job: Job): Promise<{ synced: number; skipped: number }> {
    if (await this.cronGate.isPaused()) {
      this.logger.log('Skipped — global cron gate is PAUSED');
      return { synced: 0, skipped: 0 };
    }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);
    const due = await this.posts.find({
      where: {
        status: In(['published_auto', 'published_manual']),
        publishedAt: MoreThanOrEqual(thirtyDaysAgo),
      },
      take: 50,
      order: { publishedAt: 'DESC' },
    });

    if (due.length === 0) return { synced: 0, skipped: 0 };

    let synced = 0;
    let skipped = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const post of due) {
      // Skip if we already snapshotted today (the unique index would reject anyway)
      const existing = await this.engagement.findOne({
        where: { socialPostId: post.id, syncedDate: today },
      });
      if (existing) { skipped++; continue; }

      let stats: EngagementStats | null = null;
      if (post.platform === 'linkedin_page' || post.platform === 'linkedin_personal') {
        stats = await this.linkedin.fetchStats(post);
      } else if (post.platform === 'instagram_feed') {
        stats = await this.instagram.fetchStats(post);
      }
      // youtube_community: API doesn't expose community-post insights publicly

      if (!stats) { skipped++; continue; }

      const engagementSum = stats.likes + stats.comments + stats.shares;
      const engagementRate = stats.impressions > 0
        ? Math.round((engagementSum / stats.impressions) * 10000) / 100
        : 0;

      try {
        await this.engagement.save(
          this.engagement.create({
            socialPostId: post.id,
            likes: stats.likes,
            comments: stats.comments,
            shares: stats.shares,
            saves: stats.saves,
            impressions: stats.impressions,
            reach: stats.reach,
            clicks: stats.clicks,
            engagementRate,
            syncedDate: today,
            syncSource: `${post.platform}_api`,
            rawData: stats.rawData,
          }),
        );
        synced++;
      } catch (e) {
        this.logger.warn(`Engagement save failed for ${post.id}: ${(e as Error).message}`);
      }
    }

    this.logger.log(`Engagement sync: ${synced} new, ${skipped} skipped`);
    return { synced, skipped };
  }
}
