import {
  Injectable, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import {
  ContentSeries, SeriesStatus, SeriesWeekArc, LessonFormat, LESSON_FORMATS,
} from '../entities/content-series.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { StrategyAgent } from '../agents/strategy.agent';
import { SeriesArchitectAgent } from '../agents/series-architect.agent';

@Injectable()
export class SeriesService {
  private readonly logger = new Logger(SeriesService.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(ContentSeries) private readonly seriesRepo: Repository<ContentSeries>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    private readonly architect: SeriesArchitectAgent,
    private readonly strategy: StrategyAgent,
  ) {}

  /**
   * Two-step create: persist the series row first (so it has an id),
   * then ask the Architect to design the topic arc and update the row.
   * That keeps the cost-tracking + audit reference id stable.
   */
  async create(opts: {
    brandId: string;
    name: string;
    goal?: string;
    description?: string;
    targetWeeks?: number;
    startWeekOf?: string;
  }): Promise<ContentSeries> {
    if (!opts.name?.trim()) throw new BadRequestException('name required');
    const brand = await this.brandRepo.findOne({ where: { id: opts.brandId } });
    if (!brand) throw new NotFoundException('Brand not found');
    const targetWeeks = Math.max(2, Math.min(16, opts.targetWeeks ?? 4));

    const draft = await this.seriesRepo.save(
      this.seriesRepo.create({
        brandId: opts.brandId,
        name: opts.name.trim().slice(0, 255),
        description: opts.description?.slice(0, 2000) ?? null,
        goal: opts.goal?.slice(0, 2000) ?? null,
        targetWeeks,
        topicArc: [],
        currentWeek: 0,
        status: 'planning',
        startWeekOf: opts.startWeekOf ?? null,
      }),
    );

    try {
      return await this.architect.designArcFor(draft.id);
    } catch (e) {
      this.logger.error(
        `Architect failed for series ${draft.id}: ${(e as Error).message}`,
      );
      await this.seriesRepo.update(draft.id, { status: 'paused' });
      throw e;
    }
  }

  list(brandId?: string): Promise<ContentSeries[]> {
    return this.seriesRepo.find({
      where: brandId ? { brandId } : {},
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async get(id: string): Promise<ContentSeries> {
    const s = await this.seriesRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Series not found');
    return s;
  }

  /**
   * Replace the whole topic arc — the UI handles insert/reorder/remove/edit
   * client-side and sends the resulting array. Server validates, clamps, and
   * re-indexes weekIndex to a contiguous 1..N. targetWeeks tracks arc length.
   *
   * NOTE: already-materialised plans keep their seriesWeekNumber — reordering
   * or removing weeks after planning can desync them; the caller is warned.
   */
  async updateArc(
    seriesId: string,
    rawArc: Array<Partial<SeriesWeekArc>>,
  ): Promise<ContentSeries> {
    const series = await this.get(seriesId);
    if (!Array.isArray(rawArc) || rawArc.length === 0) {
      throw new BadRequestException('topicArc must be a non-empty array');
    }
    if (rawArc.length > 16) {
      throw new BadRequestException('A series can have at most 16 weeks');
    }
    const arc: SeriesWeekArc[] = rawArc.slice(0, 16).map((w, i) => ({
      weekIndex: i + 1,
      plannedTheme: String(w.plannedTheme ?? '').slice(0, 240),
      plannedHook: String(w.plannedHook ?? '').slice(0, 280),
      plannedFocus: String(w.plannedFocus ?? '').slice(0, 600),
      plannedLessonFormats: (w.plannedLessonFormats ?? ['lecture'])
        .filter((f): f is LessonFormat =>
          (LESSON_FORMATS as string[]).includes(String(f)))
        .slice(0, 3),
    }));
    await this.seriesRepo.update(series.id, {
      topicArc: arc,
      targetWeeks: arc.length,
    });
    this.logger.log(`Series ${series.id} arc updated — ${arc.length} weeks`);
    return this.get(series.id);
  }

  /**
   * Materialise every week of the series into a weekly plan. Calls the
   * Strategy Agent for each week (with the arc + week-index context the
   * agent now reads from the plan it's working on). Idempotent — if a
   * plan for that {seriesId, weekIndex} already exists, it's skipped.
   */
  async planAll(seriesId: string): Promise<{
    seriesId: string;
    plansCreated: Array<{ planId: string; weekOf: string; theme: string | null; weekIndex: number }>;
  }> {
    const series = await this.get(seriesId);
    if (!series.topicArc.length) {
      throw new BadRequestException('Series has no topic arc — re-run designArc');
    }
    const startWeek = series.startWeekOf ?? thisMonday();

    const plansCreated: Array<{ planId: string; weekOf: string; theme: string | null; weekIndex: number }> = [];
    for (const week of series.topicArc) {
      const weekOf = mondayFor(startWeek, week.weekIndex - 1);
      // Skip if we already have a plan for this {series, week}.
      const existing = await this.planRepo.findOne({
        where: { seriesId: series.id, seriesWeekNumber: week.weekIndex },
      });
      if (existing) {
        plansCreated.push({
          planId: existing.id, weekOf,
          theme: existing.theme, weekIndex: week.weekIndex,
        });
        continue;
      }
      const plan = await this.strategy.generateWeek(series.brandId, weekOf, {
        seriesId: series.id,
        seriesWeekNumber: week.weekIndex,
      });
      plansCreated.push({
        planId: plan.id, weekOf,
        theme: plan.theme, weekIndex: week.weekIndex,
      });
    }
    await this.seriesRepo.update(series.id, {
      status: 'active' as SeriesStatus,
      startWeekOf: startWeek,
      currentWeek: 0,
    });
    return { seriesId: series.id, plansCreated };
  }
}

/** Monday of THIS week (UTC) as YYYY-MM-DD. */
function thisMonday(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Add `weeks` weeks to a YYYY-MM-DD Monday, return YYYY-MM-DD. */
function mondayFor(start: string, weeksAhead: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeksAhead * 7);
  return d.toISOString().slice(0, 10);
}
