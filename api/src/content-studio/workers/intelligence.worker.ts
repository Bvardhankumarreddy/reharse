import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bull';
import { CompetitorFetcherService } from '../services/competitor-fetcher.service';
import { ChannelVideoFetcherService } from '../services/channel-video-fetcher.service';
import { MetricsFetcherService } from '../services/metrics-fetcher.service';
import { PostmortemAgent } from '../agents/postmortem.agent';
import { ImprovementAgent } from '../agents/improvement.agent';
import { NotificationService } from '../services/notification.service';
import { QuizRetentionService } from '../services/quiz-retention.service';
import { CronGateService } from '../../system/services/cron-gate.service';
import { CRON_KEYS } from '../../system/constants/cron-registry';

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
    private readonly channelVideos: ChannelVideoFetcherService,
    private readonly notify: NotificationService,
    private readonly retention: QuizRetentionService,
    private readonly cronGate: CronGateService,
    @InjectQueue(CS_INTELLIGENCE_QUEUE) private readonly queue: Queue,
  ) {}

  private async isPausedLog(name: string, cronKey: string): Promise<boolean> {
    if (await this.cronGate.isPaused(cronKey)) {
      this.logger.log(`${name} skipped — cron '${cronKey}' is PAUSED`);
      return true;
    }
    return false;
  }

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
      this.queue.add('channel-sweep', {}, {
        repeat: { cron: '30 2 * * *' },  // 02:30 UTC daily — own back catalog
        jobId: 'cs-channel-cron',
        removeOnComplete: 10, removeOnFail: 5,
      }),
      this.queue.add('retention-purge', {}, {
        repeat: { cron: '30 3 * * 1' },  // Mondays 03:30 UTC — keep last 3 weeks
        jobId: 'cs-retention-cron',
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
    if (await this.isPausedLog('competitor-sweep', CRON_KEYS.CS_COMPETITOR)) return { skipped: true };
    const r = await this.competitor.fetchAll();
    if (r.saved > 0) {
      await this.notify.notify(
        `:robot_face: cs · competitor-sweep · ${r.saved} new videos across ${r.scanned} channel(s)`,
      );
    }
    return r;
  }

  @Process('channel-sweep')
  async channelSweep() {
    if (await this.isPausedLog('channel-sweep', CRON_KEYS.CS_CHANNEL)) return { skipped: true };
    const r = await this.channelVideos.fetchAll();
    if (r.saved > 0) {
      await this.notify.notify(
        `:robot_face: cs · channel-sweep · ${r.saved} own video(s) ingested/updated across ${r.scanned} channel(s)`,
      );
    }
    return r;
  }

  @Process('metrics-sweep')
  async metricsSweep() {
    if (await this.isPausedLog('metrics-sweep', CRON_KEYS.CS_METRICS)) return { skipped: true };
    const r = await this.metrics.fetchAll();
    if (r.saved > 0) {
      await this.notify.notify(
        `:robot_face: cs · metrics-sweep · refreshed ${r.saved}/${r.scanned} lessons`,
      );
    }
    return r;
  }

  @Process('postmortem-sweep')
  async postmortemSweep() {
    if (await this.isPausedLog('postmortem-sweep', CRON_KEYS.CS_POSTMORTEM)) return { skipped: true };
    const r = await this.postmortem.runDailyBatch();
    if (r.generated > 0) {
      await this.notify.notify(
        `:robot_face: cs · postmortem-sweep · ${r.generated}/${r.scanned} postmortems written`,
      );
    }
    return r;
  }

  @Process('retention-purge')
  async retentionPurge() {
    if (await this.isPausedLog('retention-purge', CRON_KEYS.CS_RETENTION)) return { skipped: true };
    // Cron always archives — never silently delete production data.
    // If the storage Lambda isn't configured, the call throws and the
    // sweep no-ops for the week (caught by the job-failure handler).
    let r;
    try {
      r = await this.retention.purgeOlderThan(3, undefined, { archive: true });
    } catch (e) {
      this.logger.warn(
        `retention-purge skipped: ${(e as Error).message} — ` +
        `configure STORAGE_LAMBDA_URL or run /retention/purge manually with archive=false`,
      );
      await this.notify.notify(
        `:warning: cs · retention-purge SKIPPED — ${(e as Error).message}`,
      );
      return { skipped: true, reason: (e as Error).message };
    }
    const total =
      r.deleted.submissions + r.deleted.sessions +
      r.deleted.bundles + r.deleted.winners;
    if (total > 0) {
      const stamp = r.archive.archivedAt
        ? ` · archived ${r.archive.archivedAt.slice(0, 19)}Z`
        : '';
      await this.notify.notify(
        `:wastebasket: cs · retention-purge · kept weeks ${r.threshold + 1}..${r.currentWeek}, ` +
        `archived+deleted ≤ week ${r.threshold} (${r.deleted.submissions} submissions, ` +
        `${r.deleted.sessions} sessions, ${r.deleted.bundles} bundles, ` +
        `${r.deleted.winners} winner announcements)${stamp}`,
      );
    }
    return r;
  }

  @Process('improvement-sweep')
  async improvementSweep() {
    if (await this.isPausedLog('improvement-sweep', CRON_KEYS.CS_IMPROVEMENT)) return { skipped: true };
    const r = await this.improvement.runForAllBrands();
    // Only notify when something actually got promoted — a "0 promoted" run is
    // the normal state until published lessons accrue YouTube metrics, so it's
    // just noise.
    if (r.promoted > 0) {
      await this.notify.notify(
        `:robot_face: cs · improvement-sweep · promoted ${r.promoted} winning hook pattern(s) ` +
        `into BrandMemory across ${r.scanned} brand(s)`,
      );
    }
    return r;
  }
}
