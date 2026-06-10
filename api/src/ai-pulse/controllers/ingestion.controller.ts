import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
  BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../../auth/admin.guard';
import { AiPulseNewsItem, AiPulseVertical } from '../entities/news-item.entity';
import { AiPulseVerticalConfig } from '../entities/vertical-config.entity';
import { AiPulseIngestionService } from '../services/source-ingestion.service';
import { AiPulseScoringService } from '../services/scoring.service';
import { AiPulseSchedulerService } from '../services/scheduler.service';
import { AiPulseMemory } from '../entities/memory.entity';
import { AiPulsePostmortem } from '../entities/postmortem.entity';
import { VERTICAL_KEYS, VERTICALS } from '../config/verticals.config';

@Controller('admin/ai-pulse')
@UseGuards(AdminGuard)
export class AiPulseIngestionController {
  constructor(
    @InjectRepository(AiPulseNewsItem)
    private readonly news: Repository<AiPulseNewsItem>,
    @InjectRepository(AiPulseVerticalConfig)
    private readonly verticalConfig: Repository<AiPulseVerticalConfig>,
    @InjectRepository(AiPulseMemory)
    private readonly memories: Repository<AiPulseMemory>,
    @InjectRepository(AiPulsePostmortem)
    private readonly postmortems: Repository<AiPulsePostmortem>,
    private readonly ingestion: AiPulseIngestionService,
    private readonly scoring: AiPulseScoringService,
    private readonly scheduler: AiPulseSchedulerService,
  ) {}

  /** Vertical config + enable flags + day-of-week mapping. */
  @Get('verticals')
  async listVerticals() {
    const rows = await this.verticalConfig.find();
    const byKey = new Map(rows.map((r) => [r.vertical, r]));
    return VERTICAL_KEYS.map((key) => {
      const row = byKey.get(key);
      const spec = VERTICALS[key];
      return {
        vertical: key,
        display_name: spec.display_name,
        description: spec.description,
        day_of_week: spec.day_of_week,
        publish_time: spec.publish_time,
        india_mix_percent: spec.india_mix_percent,
        top_n_per_run: spec.top_n_per_run,
        enabled: row?.enabled ?? spec.enabled,
      };
    });
  }

  /** Toggle a vertical's enabled flag (DB-backed). */
  @Post('verticals/:vertical/enable')
  async setEnabled(
    @Param('vertical') vertical: string,
    @Body() body: { enabled: boolean },
  ) {
    if (!VERTICAL_KEYS.includes(vertical as AiPulseVertical)) {
      throw new BadRequestException(`Unknown vertical "${vertical}"`);
    }
    const row = await this.verticalConfig.findOne({
      where: { vertical: vertical as AiPulseVertical },
    });
    if (!row) throw new NotFoundException('vertical config row missing');
    row.enabled = !!body.enabled;
    await this.verticalConfig.save(row);
    return { vertical, enabled: row.enabled };
  }

  /** Trigger an ingest of every enabled source RIGHT NOW. */
  @Post('ingest')
  async manualIngest() {
    return this.ingestion.ingestAll();
  }

  /** List news items, newest first, optional filter by vertical/status. */
  @Get('news')
  async listNews(
    @Query('vertical') vertical?: string,
    @Query('status')   status?: string,
    @Query('limit')    limitQ?: string,
  ) {
    const limit = Math.max(1, Math.min(100, Number(limitQ) || 30));
    const qb = this.news
      .createQueryBuilder('n')
      .orderBy('n.published_at', 'DESC', 'NULLS LAST')
      .addOrderBy('n.created_at', 'DESC')
      .limit(limit);
    if (vertical) qb.andWhere('n.vertical = :v', { v: vertical });
    if (status)   qb.andWhere('n.status = :s',   { s: status });
    return qb.getMany();
  }

  /** Score the candidate set for a vertical RIGHT NOW + return the top N. */
  @Post('verticals/:vertical/score')
  async manualScore(
    @Param('vertical') vertical: string,
    @Query('limit') limitQ?: string,
  ) {
    if (!VERTICAL_KEYS.includes(vertical as AiPulseVertical)) {
      throw new BadRequestException(`Unknown vertical "${vertical}"`);
    }
    const limit = limitQ ? Number(limitQ) : undefined;
    const top = await this.scoring.scoreVerticalForToday(vertical as AiPulseVertical, limit);
    return { vertical, top };
  }

  /**
   * Trigger end-to-end generation for a vertical RIGHT NOW (same path
   * the cron uses). Picks the top N candidates (default per vertical's
   * top_n_per_run, override via ?limit). Returns one entry per generated
   * script. Approval gate still applies — admin approves before HeyGen.
   */
  @Post('verticals/:vertical/generate')
  async manualGenerate(
    @Param('vertical') vertical: string,
    @Query('limit') limitQ?: string,
  ) {
    if (!VERTICAL_KEYS.includes(vertical as AiPulseVertical)) {
      throw new BadRequestException(`Unknown vertical "${vertical}"`);
    }
    const limit = limitQ ? Number(limitQ) : undefined;
    return this.scheduler.runGeneration(vertical as AiPulseVertical, limit);
  }

  /** Active memories — what the learning loop has promoted so far. */
  @Get('memories')
  async listMemories(@Query('vertical') vertical?: string) {
    const qb = this.memories
      .createQueryBuilder('m')
      .where('m.is_active = true')
      .orderBy('m.created_at', 'DESC')
      .limit(200);
    if (vertical) qb.andWhere('m.vertical = :v', { v: vertical });
    return qb.getMany();
  }

  /** Postmortems written by the daily cron — drill-down on per-script learnings. */
  @Get('postmortems')
  async listPostmortems(@Query('vertical') vertical?: string) {
    const qb = this.postmortems
      .createQueryBuilder('p')
      .orderBy('p.created_at', 'DESC')
      .limit(100);
    if (vertical) qb.andWhere('p.vertical = :v', { v: vertical });
    return qb.getMany();
  }

  /** Manual trigger for the learning loop (one-shot for testing). */
  @Post('intelligence/metrics-sweep')
  async runMetrics() { return this.scheduler.cronMetrics(); }

  @Post('intelligence/postmortem-sweep')
  async runPostmortem() { return this.scheduler.cronPostmortem(); }

  @Post('intelligence/improvement-sweep')
  async runImprovement() { return this.scheduler.cronImprovement(); }
}
