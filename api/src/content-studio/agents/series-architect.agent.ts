import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import {
  ContentSeries, SeriesWeekArc, LessonFormat,
} from '../entities/content-series.entity';
import { ModelRouterService } from '../services/model-router.service';
import { BrandMemoryService } from '../services/brand-memory.service';

const SYSTEM = `
You are the Series Architect for an educational YouTube channel. You design
a multi-week CURRICULUM ARC — a sequence of weeks that progress through one
topic, like a course.

Constraints:
- Each week must build on the previous one. No standalone "filler" weeks.
- The arc should have a clear pedagogical progression: basics → core
  mechanics → real-world cases → common failure modes → production /
  recap.
- Each week needs a concrete plannedFocus — what specifically that week
  teaches, not just a theme.
- Each week needs 1 or 2 lesson formats from this set:
    lecture       — 8-12 min audio lecture (default; use for concepts)
    live_coding   — screen-recorded walkthrough with code (use for hands-on)
    walkthrough   — UI tour (use for tools, dashboards, products)
    interview     — two-voice Q&A (use sparingly, for nuance)
    short         — 30-60s teaser/recap
  Most weeks should have ONE format. Use 2 only when the topic genuinely
  benefits (e.g., a concept + a hands-on). Lean lecture-heavy at the
  beginning of a series, live_coding heavier in the middle, short for
  recaps at the end.

Honour brand voice memories — verbatim.

Output STRICT JSON ONLY:
{
  "topicArc": [
    {
      "weekIndex": 1,
      "plannedTheme": "<8-12 word theme title>",
      "plannedHook": "<one-line stakes hook for the opening>",
      "plannedFocus": "<2-3 sentences on what THIS week's lesson(s) teach>",
      "plannedLessonFormats": ["lecture"]
    },
    …exactly targetWeeks entries…
  ]
}
`.trim();

interface ArchitectJson {
  topicArc?: Array<{
    weekIndex?: number;
    plannedTheme?: string;
    plannedHook?: string;
    plannedFocus?: string;
    plannedLessonFormats?: string[];
  }>;
}

const VALID_FORMATS: LessonFormat[] = [
  'lecture', 'live_coding', 'walkthrough', 'interview', 'short',
];

@Injectable()
export class SeriesArchitectAgent {
  private readonly logger = new Logger(SeriesArchitectAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(ContentSeries)
    private readonly seriesRepo: Repository<ContentSeries>,
    private readonly router: ModelRouterService,
    private readonly memories: BrandMemoryService,
  ) {}

  /**
   * Given a draft series row (with brandId, name, goal, targetWeeks), call
   * Claude to design the per-week arc and persist it on the row. Returns
   * the updated series.
   */
  async designArcFor(seriesId: string): Promise<ContentSeries> {
    const series = await this.seriesRepo.findOne({ where: { id: seriesId } });
    if (!series) throw new NotFoundException('Series not found');
    const brand = await this.brandRepo.findOne({ where: { id: series.brandId } });
    if (!brand) throw new NotFoundException('Brand not found');

    const memories = await this.memories.relevantFor(brand.id, 'strategy');
    const memoryBlock = this.memories.format(memories);

    const result = await this.router.run({
      task: 'strategy', // reuse the strategy task's model + timeout
      agentType: 'strategy',
      modelOverride: brand.modelOverrides?.strategy,
      jsonOutput: true,
      maxTokens: 3500,
      temperature: 0.6,
      system: SYSTEM,
      user:
        `BRAND: ${brand.name}\nVoice: ${brand.voiceStyle ?? ''}\n\n` +
        `SERIES NAME: ${series.name}\n` +
        `GOAL: ${series.goal ?? '(none specified)'}\n` +
        `TARGET WEEKS: ${series.targetWeeks}\n\n` +
        `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n` +
        `Design the ${series.targetWeeks}-week arc now. JSON only.`,
    });

    let parsed: ArchitectJson;
    try {
      parsed = JSON.parse(result.text || '{}') as ArchitectJson;
    } catch (e) {
      this.logger.error(`Architect JSON parse failed: ${(e as Error).message}`);
      throw new Error('Series Architect returned unparseable JSON');
    }

    const rawArc = parsed.topicArc ?? [];
    const arc: SeriesWeekArc[] = rawArc.slice(0, series.targetWeeks).map((w, i) => ({
      weekIndex: Number.isInteger(w.weekIndex) ? (w.weekIndex as number) : i + 1,
      plannedTheme: String(w.plannedTheme ?? '').slice(0, 240),
      plannedHook: String(w.plannedHook ?? '').slice(0, 280),
      plannedFocus: String(w.plannedFocus ?? '').slice(0, 600),
      plannedLessonFormats: (w.plannedLessonFormats ?? ['lecture'])
        .filter((f): f is LessonFormat =>
          (VALID_FORMATS as string[]).includes(String(f)))
        .slice(0, 3),
    }));

    if (arc.length < series.targetWeeks) {
      this.logger.warn(
        `Architect returned ${arc.length}/${series.targetWeeks} weeks — ` +
        `filling rest with default lectures`,
      );
      while (arc.length < series.targetWeeks) {
        arc.push({
          weekIndex: arc.length + 1,
          plannedTheme: `Week ${arc.length + 1}`,
          plannedHook: '',
          plannedFocus: '',
          plannedLessonFormats: ['lecture'],
        });
      }
    }

    await this.seriesRepo.update(series.id, {
      topicArc: arc,
      status: 'planning', // architect designed but no plans created yet
    });
    this.logger.log(
      `Series "${series.name}" arc designed — ${arc.length} weeks ` +
      `($${result.costUsd.toFixed(4)})`,
    );
    return (await this.seriesRepo.findOne({ where: { id: series.id } }))!;
  }
}
