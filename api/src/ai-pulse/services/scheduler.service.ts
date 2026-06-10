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
      { name: 'ingest',   cron: '0 */4 * * *', jobId: 'ai-pulse-ingest-cron' },
      { name: 'generate', cron: '30 0 * * *',  jobId: 'ai-pulse-generate-cron' },
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

  @Process('generate')
  async cronGenerate() {
    const dow = new Date().getUTCDay();
    const vertical = DAY_VERTICAL_MAP[dow];
    if (!vertical) {
      this.logger.log(`[cron] generate: Sunday — skipping (AI Quick Bytes runs)`);
      return { skipped: 'sunday' };
    }
    const cfg = await this.verticalConfig.findOne({ where: { vertical } });
    const enabledInDB = cfg?.enabled ?? VERTICALS[vertical]?.enabled ?? false;
    if (!enabledInDB) {
      this.logger.log(`[cron] generate: vertical ${vertical} disabled — skipping`);
      return { skipped: 'disabled', vertical };
    }
    return this.runGeneration(vertical);
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
