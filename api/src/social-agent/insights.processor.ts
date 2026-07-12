import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import type { Queue, Job } from 'bull';
import { SocialInsight, type InsightType } from './social-insight.entity';
import { AnalyticsService } from './analytics.service';
import { CronGateService } from '../system/services/cron-gate.service';
import { CRON_KEYS } from '../system/constants/cron-registry';

export const INSIGHTS_QUEUE = 'social-insights';
export const INSIGHTS_JOB = 'tick';

interface ClaudeInsight {
  type: InsightType;
  platform?: string | null;
  finding: string;
  recommendation: string;
  confidence: number;
}

@Injectable()
@Processor(INSIGHTS_QUEUE)
export class InsightsProcessor implements OnModuleInit {
  private readonly logger = new Logger(InsightsProcessor.name);

  constructor(
    @InjectRepository(SocialInsight) private readonly insights: Repository<SocialInsight>,
    @InjectQueue(INSIGHTS_QUEUE) private readonly queue: Queue,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
    private readonly cronGate: CronGateService,
  ) {}

  async onModuleInit() {
    try {
      await this.queue.add(
        INSIGHTS_JOB,
        {},
        {
          repeat: { cron: '30 6 * * *' }, // daily at 06:30 UTC
          jobId: 'social-insights-cron',
          removeOnComplete: 7,
          removeOnFail: 3,
        },
      );
      this.logger.log('Social insights cron registered (daily @ 06:30 UTC)');
    } catch (e) {
      this.logger.warn(`Could not register insights cron: ${(e as Error).message}`);
    }
  }

  /** Pull a 30-day summary, ask Claude (via AI engine) for insights, save them */
  @Process(INSIGHTS_JOB)
  async tick(_job: Job): Promise<{ generated: number }> {
    if (await this.cronGate.isPaused(CRON_KEYS.SOCIAL_INSIGHTS)) {
      this.logger.log(`Skipped — cron '${CRON_KEYS.SOCIAL_INSIGHTS}' is PAUSED`);
      return { generated: 0 };
    }
    const summary = await this.analytics.buildClaudeSummary();
    if (summary.total_posts < 3) {
      this.logger.log('Skipping insights run — too few posts (<3) for meaningful analysis');
      return { generated: 0 };
    }

    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';
    let parsed: { insights: ClaudeInsight[] };
    try {
      const res = await fetch(`${aiUrl}/social-insights/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_days: 30, summary }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        this.logger.warn(`AI engine /social-insights/generate failed: ${res.status}`);
        return { generated: 0 };
      }
      parsed = (await res.json()) as { insights: ClaudeInsight[] };
    } catch (e) {
      this.logger.warn(`Insights generation failed: ${(e as Error).message}`);
      return { generated: 0 };
    }

    // Mark previous insights as no longer "actionable" — replace with fresh batch
    await this.insights.update(
      { isActionable: true },
      { isActionable: false },
    );

    const since = new Date(Date.now() - 30 * 86400 * 1000);
    const until = new Date();
    let saved = 0;
    for (const i of parsed.insights ?? []) {
      try {
        await this.insights.save(
          this.insights.create({
            insightType: i.type,
            platform: i.platform ?? null,
            insightData: { finding: i.finding, recommendation: i.recommendation },
            confidenceScore: Math.max(0, Math.min(1, i.confidence ?? 0)),
            generatedBy: 'claude',
            dataPeriodStart: since,
            dataPeriodEnd: until,
            isActionable: true,
          }),
        );
        saved++;
      } catch (e) {
        this.logger.warn(`Could not save insight: ${(e as Error).message}`);
      }
    }

    this.logger.log(`Saved ${saved} new insights`);
    return { generated: saved };
  }

  /** Triggerable from admin UI for testing */
  async triggerNow(): Promise<{ generated: number }> {
    return this.tick({} as Job);
  }
}
