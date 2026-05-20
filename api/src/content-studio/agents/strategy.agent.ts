import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { Channel } from '../entities/channel.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson, OutlineSection } from '../entities/lesson.entity';
import {
  ContentSeries, LessonFormat, isLessonFormat,
} from '../entities/content-series.entity';
import { CompetitorVideo } from '../entities/competitor-video.entity';
import { CompetitorChannel } from '../entities/competitor-channel.entity';
import { NewsItem } from '../../ai-quick-bytes/entities/news-item.entity';
import { NewsScore } from '../../ai-quick-bytes/entities/news-score.entity';
import { ModelRouterService } from '../services/model-router.service';
import { BrandMemoryService } from '../services/brand-memory.service';

const SYSTEM = `
You are the Strategy Agent for an educational YouTube channel. You plan ONE
week of content: a unifying theme, exactly TWO lesson topics, and the scope
for a Saturday quiz that tests those two lessons.

Each lesson needs:
- title    : punchy, clickable
- hook     : first ~8s, concrete stakes (a number, a failure, a "most people
             get this wrong")
- outline  : 4-6 sections, each with heading + 2-4 teaching points
- lesson_format: one of "lecture" | "live_coding" | "walkthrough" |
                 "interview" | "short"
- target_duration_minutes: integer (lecture ~10, live_coding ~15,
                           walkthrough ~8, interview ~12, short ~1)

Format guidance:
- lecture     — concept-heavy explanation (default for "what is X / why does
                Y matter")
- live_coding — screen-recorded walkthrough that demonstrates code or a
                running system end-to-end (use when the lesson is "build X"
                or "fix Y")
- walkthrough — UI/dashboard/product tour (no code) — for tools, services
- interview   — two-voice nuance Q&A — use sparingly, for opinion topics
- short       — 30-60s teaser/recap — use only for series recaps

Honour brand voice/style/do/don't memories — verbatim. Avoid repeating any
of the recent themes shown to you. Where the brief includes a SERIES ARC,
make the lesson concretely build on the week's plannedFocus and use the
planned formats. Be specific, practical, real tools/numbers — no vague
"imagine a system".

Respond with a SINGLE JSON object only:
{
  "theme": "<week theme>",
  "quiz_scope": "<what the Saturday quiz should cover>",
  "rationale": "<1-2 sentences on why THIS theme this week>",
  "lessons": [
    {
      "title": "...",
      "hook": "...",
      "lesson_format": "lecture",
      "target_duration_minutes": 10,
      "outline": [{"heading": "...", "points": ["...","..."]}]
    }
  ]
}
Exactly 2 lessons.
`.trim();

interface StrategyJson {
  theme?: string;
  quiz_scope?: string;
  rationale?: string;
  lessons?: Array<{
    title?: string;
    hook?: string;
    lesson_format?: string;
    target_duration_minutes?: number;
    outline?: OutlineSection[];
  }>;
}

interface WeekOpts {
  seriesId?: string | null;
  seriesWeekNumber?: number | null;
}

/** Monday of the current week (UTC) as YYYY-MM-DD. */
function thisMonday(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class StrategyAgent {
  private readonly logger = new Logger(StrategyAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(Channel) private readonly channelRepo: Repository<Channel>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentSeries) private readonly seriesRepo: Repository<ContentSeries>,
    @InjectRepository(CompetitorVideo) private readonly competitorVidRepo: Repository<CompetitorVideo>,
    @InjectRepository(NewsItem) private readonly newsRepo: Repository<NewsItem>,
    private readonly router: ModelRouterService,
    private readonly memories: BrandMemoryService,
  ) {}

  async generateWeek(
    brandId: string,
    weekOf?: string,
    opts: WeekOpts = {},
  ): Promise<WeeklyContentPlan> {
    const brand = await this.brandRepo.findOne({ where: { id: brandId } });
    if (!brand) throw new BadRequestException('Brand not found');

    const channel = await this.channelRepo.findOne({ where: { brandId } });
    const memories = await this.memories.relevantFor(brandId, 'strategy');

    // ── Enrichment: last 8 themes (anti-repeat), competitor top, AQB news ──
    const [recentThemes, competitorTop, newsTop, seriesArcBlock] =
      await Promise.all([
        this.recentThemes(brandId, 8),
        this.competitorTopBlock(brandId, 30, 12),
        this.newsTopBlock(7, 5),
        this.seriesArcBlock(opts.seriesId ?? null, opts.seriesWeekNumber ?? null),
      ]);

    const week = weekOf ?? thisMonday();
    const plan = await this.planRepo.save(
      this.planRepo.create({
        brandId,
        channelId: channel?.id ?? null,
        weekOf: week,
        status: 'generating',
        seriesId: opts.seriesId ?? null,
        seriesWeekNumber: opts.seriesWeekNumber ?? null,
      }),
    );

    try {
      const memoryBlock = this.memories.format(memories);

      const userPrompt =
        `BRAND: ${brand.name}\n` +
        `Description: ${brand.description ?? ''}\n` +
        `Voice/style: ${brand.voiceStyle ?? ''}\n` +
        `Cadence: ${channel?.cadence ?? '2 lessons + 1 quiz / week'}\n` +
        `Week of: ${week}\n\n` +
        `BRAND MEMORIES (obey these):\n${memoryBlock}\n\n` +
        (seriesArcBlock ? `${seriesArcBlock}\n\n` : '') +
        `RECENT THEMES (last 8 weeks — DO NOT repeat these):\n` +
        `${recentThemes.length ? recentThemes.map((t, i) => `  ${i + 1}. ${t}`).join('\n') : '  (none)'}\n\n` +
        `WHAT COMPETITORS PUBLISHED (last 30 days, top by views):\n${competitorTop}\n\n` +
        `WHAT'S HAPPENING IN THE FIELD (last 7 days news, top-scored):\n${newsTop}\n\n` +
        `Plan this week now. Output the JSON object only.`;

      const result = await this.router.run({
        task: 'strategy',
        agentType: 'strategy',
        planId: plan.id,
        modelOverride: brand.modelOverrides?.strategy,
        jsonOutput: true,
        maxTokens: 3500,
        temperature: 0.8,
        system: SYSTEM,
        user: userPrompt,
      });

      const parsed = JSON.parse(result.text || '{}') as StrategyJson;
      const lessons = (parsed.lessons ?? []).slice(0, 2);
      if (lessons.length === 0) throw new Error('Strategy returned no lessons');

      // If a series arc is present and provides plannedLessonFormats, use them
      // as the fallback when the model omits or returns invalid formats.
      const arcFormats = await this.arcFormatsFor(
        opts.seriesId ?? null,
        opts.seriesWeekNumber ?? null,
      );

      await this.lessonRepo.save(
        lessons.map((l, i) => {
          const requested = (l.lesson_format ?? '').toString();
          const fmt: LessonFormat = isLessonFormat(requested)
            ? requested
            : (arcFormats[i] ?? 'lecture');
          return this.lessonRepo.create({
            planId: plan.id,
            lessonNumber: i + 1,
            title: (l.title ?? `Lesson ${i + 1}`).slice(0, 500),
            hook: l.hook ?? null,
            outline: Array.isArray(l.outline) ? l.outline : [],
            targetDurationMinutes: l.target_duration_minutes ?? this.defaultDurationFor(fmt),
            lessonFormat: fmt,
            status: 'planned',
          });
        }),
      );

      await this.planRepo.update(plan.id, {
        theme: parsed.theme?.slice(0, 500) ?? null,
        quizScope: parsed.quiz_scope ?? null,
        // Stash the rationale in notes so curators can see WHY this theme.
        notes: parsed.rationale ? parsed.rationale.slice(0, 2000) : null,
        status: 'ready',
        totalCostUsd: result.costUsd,
      });
      this.logger.log(
        `Plan ${plan.id} "${parsed.theme}" — ${lessons.length} lessons ` +
        `($${result.costUsd.toFixed(4)}, ${result.model})`,
      );
    } catch (e) {
      await this.planRepo.update(plan.id, { status: 'failed' });
      throw e;
    }

    const saved = await this.planRepo.findOne({
      where: { id: plan.id },
      relations: ['lessons'],
    });
    if (!saved) throw new Error('Plan vanished after save');
    saved.lessons?.sort((a, b) => a.lessonNumber - b.lessonNumber);
    return saved;
  }

  // ── Enrichment helpers ──────────────────────────────────────────────────

  private async recentThemes(brandId: string, n: number): Promise<string[]> {
    const rows = await this.planRepo.find({
      where: { brandId },
      order: { weekOf: 'DESC' },
      take: n,
      select: ['theme'],
    });
    return rows
      .map((r) => r.theme)
      .filter((t): t is string => !!t && t.trim().length > 0);
  }

  private async competitorTopBlock(
    brandId: string, days: number, limit: number,
  ): Promise<string> {
    try {
      const rows = await this.competitorVidRepo
        .createQueryBuilder('v')
        .innerJoin(CompetitorChannel, 'c', 'c.id = v."competitorChannelId"')
        .where('c."brandId" = :brandId', { brandId })
        .andWhere(`v."publishedAt" > NOW() - INTERVAL '${Math.floor(days)} days'`)
        .orderBy('v."viewCount"', 'DESC')
        .limit(limit)
        .getMany();
      if (!rows.length) return '  (no competitor data yet)';
      return rows
        .map((v) => {
          const k = Math.round((v.viewCount ?? 0) / 1000);
          return `  • [${k}k views] ${v.title.slice(0, 140)}`;
        })
        .join('\n');
    } catch (e) {
      this.logger.warn(`competitorTopBlock failed: ${(e as Error).message}`);
      return '  (competitor data unavailable)';
    }
  }

  private async newsTopBlock(days: number, limit: number): Promise<string> {
    try {
      const rows = await this.newsRepo
        .createQueryBuilder('n')
        .innerJoin(NewsScore, 's', 's."newsItemId" = n.id')
        .where(`n."publishedAt" > NOW() - INTERVAL '${Math.floor(days)} days'`)
        .orderBy('s."compositeScore"', 'DESC')
        .limit(limit)
        .getMany();
      if (!rows.length) return '  (no recent news)';
      return rows
        .map((n) => `  • ${n.title.slice(0, 160)}`)
        .join('\n');
    } catch (e) {
      this.logger.warn(`newsTopBlock failed: ${(e as Error).message}`);
      return '  (news unavailable)';
    }
  }

  private async seriesArcBlock(
    seriesId: string | null,
    weekNumber: number | null,
  ): Promise<string | null> {
    if (!seriesId || !weekNumber) return null;
    const series = await this.seriesRepo.findOne({ where: { id: seriesId } });
    if (!series) return null;
    const idx = weekNumber - 1;
    const arc = series.topicArc ?? [];
    const here = arc[idx];
    if (!here) return null;

    const before = arc.slice(0, idx).slice(-3); // last up-to-3 prior weeks
    const after = arc.slice(idx + 1, idx + 3);  // next up-to-2 weeks

    const lines: string[] = [];
    lines.push(
      `SERIES ARC — "${series.name}" (week ${weekNumber} of ${series.targetWeeks}):`,
    );
    if (before.length) {
      lines.push(`  Previous weeks:`);
      before.forEach((w) => {
        lines.push(`    w${w.weekIndex}: ${w.plannedTheme}`);
      });
    }
    lines.push(
      `  THIS WEEK (w${here.weekIndex}):\n` +
      `    theme : ${here.plannedTheme}\n` +
      `    hook  : ${here.plannedHook}\n` +
      `    focus : ${here.plannedFocus}\n` +
      `    formats: ${(here.plannedLessonFormats ?? ['lecture']).join(', ')}`,
    );
    if (after.length) {
      lines.push(`  Coming next:`);
      after.forEach((w) => {
        lines.push(`    w${w.weekIndex}: ${w.plannedTheme}`);
      });
    }
    return lines.join('\n');
  }

  private async arcFormatsFor(
    seriesId: string | null,
    weekNumber: number | null,
  ): Promise<LessonFormat[]> {
    if (!seriesId || !weekNumber) return [];
    const series = await this.seriesRepo.findOne({ where: { id: seriesId } });
    if (!series) return [];
    const here = (series.topicArc ?? [])[weekNumber - 1];
    return here?.plannedLessonFormats ?? [];
  }

  private defaultDurationFor(fmt: LessonFormat): number {
    switch (fmt) {
      case 'short': return 1;
      case 'walkthrough': return 8;
      case 'interview': return 12;
      case 'live_coding': return 15;
      case 'lecture':
      default: return 10;
    }
  }
}
