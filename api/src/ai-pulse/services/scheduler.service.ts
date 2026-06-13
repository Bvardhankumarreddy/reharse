import { InjectQueue, Processor, Process } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Queue } from 'bull';

import { AiPulseVerticalConfig } from '../entities/vertical-config.entity';
import { AiPulseIngestionService } from './source-ingestion.service';
import { AiPulseScoringService } from './scoring.service';
import { AiPulseScriptGeneratorService } from './script-generator.service';
import { AiPulseThumbnailService } from './thumbnail.service';
import { AiPulseDistributionService } from './distribution.service';
import { AiPulseMetricsFetcherService } from './metrics-fetcher.service';
import { AiPulsePostmortemService } from './postmortem.service';
import { AiPulseImprovementService } from './improvement.service';
import { DAY_VERTICAL_MAP, VERTICALS } from '../config/verticals.config';
import { AiPulseVertical } from '../entities/news-item.entity';

export const AI_PULSE_QUEUE = 'ai-pulse';

@Injectable()
@Processor(AI_PULSE_QUEUE)
export class AiPulseSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AiPulseSchedulerService.name);

  constructor(
    @InjectRepository(AiPulseVerticalConfig)
    private readonly verticalConfig: Repository<AiPulseVerticalConfig>,
    private readonly ingestion: AiPulseIngestionService,
    private readonly scoring: AiPulseScoringService,
    private readonly scriptGen: AiPulseScriptGeneratorService,
    private readonly thumbnails: AiPulseThumbnailService,
    private readonly distribution: AiPulseDistributionService,
    private readonly metricsFetcher: AiPulseMetricsFetcherService,
    private readonly postmortem: AiPulsePostmortemService,
    private readonly improvement: AiPulseImprovementService,
    @InjectQueue(AI_PULSE_QUEUE) private readonly queue: Queue,
  ) {}

  // Cron mapping (LOCKED spec):
  //   ingest    every 4 hours        cron: 0 ★/4 ★ ★ ★    (escaped ★ = asterisk)
  //   generate  daily 06:00 IST      cron: 30 0 ★ ★ ★     (UTC; IST = UTC+5:30)
  //
  // Day-of-week → vertical (UTC day):
  //   Mon → ai_business   Tue → tech_industry   Wed → ai_science
  //   Thu → tech_industry Fri → ai_education    Sat → ai_society
  //   Sun → SKIP (AI Quick Bytes runs)
  async onModuleInit() {
    const canonical = [
      // Existing production crons.
      { name: 'ingest',      cron: '0 */4 * * *', jobId: 'ai-pulse-ingest-cron' },
      { name: 'generate',    cron: '30 0 * * *',  jobId: 'ai-pulse-generate-cron' },
      // Learning loop (parallel to AQB):
      //   metrics-sweep    : hourly @ :20 — YouTube stats + live snippet
      //   postmortem-sweep : daily 04:30 UTC — JSON postmortem for ≥3d-old shorts
      //   improvement-sweep: daily 06:00 UTC — mine winners → promote memories
      { name: 'metrics-sweep',    cron: '20 * * * *', jobId: 'ai-pulse-metrics-cron' },
      { name: 'postmortem-sweep', cron: '30 4 * * *', jobId: 'ai-pulse-postmortem-cron' },
      { name: 'improvement-sweep', cron: '0 6 * * *', jobId: 'ai-pulse-improvement-cron' },
    ];
    // Clean up stale repeatable jobs whose cron drifted (so we don't
    // end up with both old + new schedules armed after a redeploy).
    try {
      const existing = await this.queue.getRepeatableJobs();
      for (const job of existing) {
        const match = canonical.find((c) => c.name === job.name);
        if (match && job.cron !== match.cron) {
          await this.queue.removeRepeatableByKey(job.key);
          this.logger.log(
            `Dropped stale repeatable "${job.name}" cron "${job.cron}" — ` +
            `reinstalling with "${match.cron}"`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(`Stale-cron cleanup failed (non-fatal): ${(e as Error).message}`);
    }

    try {
      await Promise.all(canonical.map((c) =>
        this.queue.add(c.name, {}, {
          repeat: { cron: c.cron },
          jobId: c.jobId,
          removeOnComplete: 10,
          removeOnFail: 5,
        }),
      ));
      this.logger.log(
        `AI Pulse crons registered: ingest=${canonical[0].cron}, ` +
        `generate=${canonical[1].cron} (06:00 IST daily, Sun → AQB)`,
      );
    } catch (e) {
      this.logger.warn(`Could not register AI Pulse crons: ${(e as Error).message}`);
    }
  }

  @Process('ingest')
  async cronIngest() {
    try {
      const r = await this.ingestion.ingestAll();
      this.logger.log(`[cron] ingest: ${r.new} new / ${r.duplicates} dup / ${r.total} total`);
      return r;
    } catch (e) {
      this.logger.warn(`[cron] ingest failed: ${(e as Error).message}`);
      throw e;
    }
  }

  @Process('metrics-sweep')
  async cronMetrics() {
    try {
      const r = await this.metricsFetcher.fetchAll();
      this.logger.log(`[cron] metrics: ${r.saved} snapshots / ${r.scanned} shorts`);
      return r;
    } catch (e) {
      this.logger.warn(`[cron] metrics failed: ${(e as Error).message}`);
      throw e;
    }
  }

  @Process('postmortem-sweep')
  async cronPostmortem() {
    try {
      const r = await this.postmortem.runDailyBatch();
      this.logger.log(`[cron] postmortem: ${r.generated}/${r.scanned} written`);
      return r;
    } catch (e) {
      this.logger.warn(`[cron] postmortem failed: ${(e as Error).message}`);
      throw e;
    }
  }

  @Process('improvement-sweep')
  async cronImprovement() {
    try {
      const r = await this.improvement.runDaily();
      this.logger.log(
        `[cron] improvement: ${r.winners} winner(s) across ${r.scanned} shorts; promoted ${r.promoted} memory(ies)`,
      );
      return r;
    } catch (e) {
      this.logger.warn(`[cron] improvement failed: ${(e as Error).message}`);
      throw e;
    }
  }

  @Process('generate')
  async cronGenerate() {
    // EVERY DAY across EVERY ENABLED vertical (not just the day-of-week
    // mapped one). The day_of_week column in VERTICALS / DB stays as
    // documentation; the cron now ignores it. Per-vertical errors are
    // non-fatal — one failure doesn't block the others.
    const allConfigs = await this.verticalConfig.find();
    const enabledByVertical = new Map(allConfigs.map((c) => [c.vertical, c.enabled]));
    const enabledVerticals = (Object.keys(VERTICALS) as AiPulseVertical[]).filter(
      (v) => enabledByVertical.get(v) ?? VERTICALS[v]?.enabled ?? false,
    );

    if (enabledVerticals.length === 0) {
      this.logger.log('[cron] generate: 0 verticals enabled — nothing to do');
      return { totalGenerated: 0, verticals: {} };
    }

    const verticalResults: Record<string, { generated: number; requested: number }> = {};
    let totalGenerated = 0;
    for (const vertical of enabledVerticals) {
      try {
        const r = await this.runGeneration(vertical);
        verticalResults[vertical] = { generated: r.generated, requested: r.requested };
        totalGenerated += r.generated;
      } catch (e) {
        this.logger.warn(`[cron] generate(${vertical}) failed: ${(e as Error).message}`);
        verticalResults[vertical] = { generated: 0, requested: 0 };
      }
    }
    this.logger.log(
      `[cron] generate: ${totalGenerated} scripts across ${enabledVerticals.length} vertical(s)`,
    );
    return { totalGenerated, verticals: verticalResults };
  }

  /**
   * End-to-end generation for one vertical (used by both the cron and
   * the admin "Generate now" button). Mirrors AQB's top-N pattern:
   * scores all pending candidates, picks the top N (per vertical's
   * top_n_per_run config; override via limit), and generates a full
   * script + thumbnails + distribution package for each.
   *
   * Per-story errors are non-fatal: one bad story doesn't block the
   * others. Returns a summary of what was generated.
   */
  async runGeneration(
    vertical: AiPulseVertical, limit?: number,
  ): Promise<{
    generated: number;
    requested: number;
    scripts: Array<{ newsItemId: string; scriptId: string; headline: string }>;
  }> {
    this.logger.log(`[generate] vertical=${vertical} limit=${limit ?? 'spec'}`);

    const top = await this.scoring.scoreVerticalForToday(vertical, limit);
    if (top.length === 0) {
      this.logger.warn(`[generate] no eligible news for ${vertical}`);
      return { generated: 0, requested: limit ?? 0, scripts: [] };
    }

    const out: Array<{ newsItemId: string; scriptId: string; headline: string }> = [];
    for (const item of top) {
      try {
        const script = await this.scriptGen.generateScript(item.id);
        await this.thumbnails.generatePrompts(script.id);
        await this.distribution.generatePackage(script.id);
        out.push({ newsItemId: item.id, scriptId: script.id, headline: item.headline });
        this.logger.log(`[generate] +1 script ${script.id} for "${item.headline.slice(0, 60)}…"`);
      } catch (e) {
        this.logger.warn(
          `[generate] script for "${item.headline.slice(0, 60)}…" failed: ${(e as Error).message}`,
        );
      }
    }

    this.logger.log(`[generate] done — ${out.length}/${top.length} script(s) pending review`);
    return { generated: out.length, requested: top.length, scripts: out };
  }
}
