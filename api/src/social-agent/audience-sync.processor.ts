import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import type { Queue, Job } from 'bull';
import { SocialPlatformConnection } from './social-platform-connection.entity';
import { AudienceSnapshot } from './audience-snapshot.entity';
import { SocialAgentEncryptionService } from './encryption.service';
import { CronGateService } from '../system/services/cron-gate.service';

export const AUDIENCE_SYNC_QUEUE = 'social-audience-sync';
export const AUDIENCE_SYNC_JOB = 'tick';

const FB_GRAPH = 'https://graph.facebook.com/v19.0';

@Injectable()
@Processor(AUDIENCE_SYNC_QUEUE)
export class AudienceSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(AudienceSyncProcessor.name);

  constructor(
    @InjectRepository(SocialPlatformConnection)
    private readonly connections: Repository<SocialPlatformConnection>,
    @InjectRepository(AudienceSnapshot)
    private readonly snapshots: Repository<AudienceSnapshot>,
    @InjectQueue(AUDIENCE_SYNC_QUEUE) private readonly queue: Queue,
    private readonly enc: SocialAgentEncryptionService,
    private readonly config: ConfigService,
    private readonly cronGate: CronGateService,
  ) {
    void this.config; // (kept for future YouTube extension)
  }

  async onModuleInit() {
    try {
      await this.queue.add(
        AUDIENCE_SYNC_JOB,
        {},
        {
          repeat: { cron: '0 7 * * 1' }, // Mondays 07:00 UTC
          jobId: 'audience-sync-cron',
          removeOnComplete: 4,
          removeOnFail: 4,
        },
      );
      this.logger.log('Audience sync cron registered (weekly Mondays @ 07:00 UTC)');
    } catch (e) {
      this.logger.warn(`Could not register audience cron: ${(e as Error).message}`);
    }
  }

  @Process(AUDIENCE_SYNC_JOB)
  async tick(_job: Job): Promise<{ snapshots: number }> {
    if (await this.cronGate.isPaused()) {
      this.logger.log('Skipped — global cron gate is PAUSED');
      return { snapshots: 0 };
    }
    let saved = 0;
    saved += (await this.syncInstagram()) ? 1 : 0;
    // LinkedIn requires Marketing Developer Platform tier (paid) — skip for now
    // YouTube channel demographics require YouTube Analytics API (separate from Data API) — skip
    return { snapshots: saved };
  }

  private async syncInstagram(): Promise<boolean> {
    const conn = await this.connections.findOne({ where: { platform: 'instagram_feed', isActive: true } });
    if (!conn) return false;
    if (conn.tokenExpiresAt.getTime() <= Date.now()) return false;

    try {
      const accessToken = this.enc.decrypt(conn.encryptedAccessToken);
      const igId = conn.accountId;

      // Get total followers + audience demographics
      const profileRes = await fetch(
        `${FB_GRAPH}/${igId}?fields=followers_count&access_token=${accessToken}`,
      );
      const profile = (await profileRes.json()) as { followers_count?: number };

      // Insights endpoint for follower demographics
      const metrics = ['follower_demographics'];
      const insightsRes = await fetch(
        `${FB_GRAPH}/${igId}/insights?metric=${metrics.join(',')}&period=lifetime&metric_type=total_value&breakdown=age,gender,country,city&access_token=${accessToken}`,
      );

      let ageBuckets: Record<string, number> = {};
      let gender: Record<string, number> = {};
      let topCountries: Record<string, number> = {};
      let topCities: Record<string, number> = {};
      let raw: unknown = null;

      if (insightsRes.ok) {
        raw = await insightsRes.json();
        const data = (raw as {
          data?: Array<{
            name: string;
            total_value?: { breakdowns?: Array<{ dimension_keys: string[]; results: Array<{ dimension_values: string[]; value: number }> }> };
          }>;
        }).data;

        const breakdowns = data?.[0]?.total_value?.breakdowns ?? [];
        for (const b of breakdowns) {
          const key = b.dimension_keys?.[0];
          const total = b.results.reduce((s, r) => s + r.value, 0) || 1;
          const obj = Object.fromEntries(
            b.results.map((r) => [r.dimension_values[0], Math.round((r.value / total) * 1000) / 10]),
          );
          if (key === 'age') ageBuckets = obj;
          else if (key === 'gender') gender = obj;
          else if (key === 'country') topCountries = obj;
          else if (key === 'city') topCities = obj;
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      // Skip if today's snapshot already exists (unique constraint would reject anyway)
      const existing = await this.snapshots.findOne({
        where: { platform: 'instagram_feed', snapshotDate: today },
      });
      if (existing) return false;

      await this.snapshots.save(
        this.snapshots.create({
          platform: 'instagram_feed',
          snapshotDate: today,
          totalAudience: profile.followers_count ?? 0,
          ageBuckets,
          gender,
          topCountries: Object.fromEntries(Object.entries(topCountries).slice(0, 10)),
          topCities: Object.fromEntries(Object.entries(topCities).slice(0, 10)),
          rawData: raw as Record<string, unknown>,
        }),
      );
      this.logger.log('Instagram audience snapshot saved');
      return true;
    } catch (e) {
      this.logger.warn(`Instagram audience sync failed: ${(e as Error).message}`);
      return false;
    }
  }

  /** For UI: latest snapshot per platform */
  async getLatest(): Promise<AudienceSnapshot[]> {
    const all = await this.snapshots
      .createQueryBuilder('a')
      .orderBy('a.snapshotDate', 'DESC')
      .getMany();
    const seen = new Set<string>();
    const latest: AudienceSnapshot[] = [];
    for (const s of all) {
      if (!seen.has(s.platform)) {
        seen.add(s.platform);
        latest.push(s);
      }
    }
    return latest;
  }
}
