import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { Channel } from '../entities/channel.entity';
import { BrandMemory } from '../entities/brand-memory.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson, OutlineSection } from '../entities/lesson.entity';
import { ModelRouterService } from '../services/model-router.service';

const SYSTEM = `
You are the Strategy Agent for an educational YouTube channel. You plan ONE
week of content: a unifying theme, exactly TWO lesson topics, and the scope
for a Saturday quiz that tests those two lessons.

Each lesson needs: a punchy clickable title, a hook (the first ~8 seconds,
concrete stakes — a number, a failure, or a "most people get this wrong"),
and an outline of 4-6 sections (heading + 2-4 teaching points each).

Honour the brand voice/style/do/don't memories provided. Be specific and
practical — real tools, real numbers, no vague "imagine a system".

Respond with a SINGLE JSON object only:
{"theme":"<week theme>","quiz_scope":"<what the Saturday quiz should cover>","lessons":[{"title":"...","hook":"...","target_duration_minutes":10,"outline":[{"heading":"...","points":["...","..."]}]}]}
Exactly 2 lessons.
`.trim();

interface StrategyJson {
  theme?: string;
  quiz_scope?: string;
  lessons?: Array<{
    title?: string;
    hook?: string;
    target_duration_minutes?: number;
    outline?: OutlineSection[];
  }>;
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
    @InjectRepository(BrandMemory) private readonly memoryRepo: Repository<BrandMemory>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    private readonly router: ModelRouterService,
  ) {}

  async generateWeek(
    brandId: string,
    weekOf?: string,
  ): Promise<WeeklyContentPlan> {
    const brand = await this.brandRepo.findOne({ where: { id: brandId } });
    if (!brand) throw new BadRequestException('Brand not found');

    const channel = await this.channelRepo.findOne({ where: { brandId } });
    const memories = await this.memoryRepo.find({
      where: { brandId, isActive: true },
      order: { weight: 'DESC' },
    });

    const week = weekOf ?? thisMonday();
    const plan = await this.planRepo.save(
      this.planRepo.create({
        brandId,
        channelId: channel?.id ?? null,
        weekOf: week,
        status: 'generating',
      }),
    );

    try {
      const memoryBlock = memories.length
        ? memories.map((m) => `- [${m.memoryType}] ${m.content}`).join('\n')
        : '(no brand memories yet)';

      const result = await this.router.run({
        task: 'strategy',
        agentType: 'strategy',
        planId: plan.id,
        jsonOutput: true,
        maxTokens: 3000,
        temperature: 0.8,
        system: SYSTEM,
        user:
          `BRAND: ${brand.name}\n` +
          `Description: ${brand.description ?? ''}\n` +
          `Voice/style: ${brand.voiceStyle ?? ''}\n` +
          `Cadence: ${channel?.cadence ?? '2 lessons + 1 quiz / week'}\n` +
          `Week of: ${week}\n\n` +
          `BRAND MEMORIES (obey these):\n${memoryBlock}\n\n` +
          `Plan this week now. Output the JSON object only.`,
      });

      const parsed = JSON.parse(result.text || '{}') as StrategyJson;
      const lessons = (parsed.lessons ?? []).slice(0, 2);
      if (lessons.length === 0) throw new Error('Strategy returned no lessons');

      await this.lessonRepo.save(
        lessons.map((l, i) =>
          this.lessonRepo.create({
            planId: plan.id,
            lessonNumber: i + 1,
            title: (l.title ?? `Lesson ${i + 1}`).slice(0, 500),
            hook: l.hook ?? null,
            outline: Array.isArray(l.outline) ? l.outline : [],
            targetDurationMinutes: l.target_duration_minutes ?? 10,
            status: 'planned',
          }),
        ),
      );

      await this.planRepo.update(plan.id, {
        theme: parsed.theme?.slice(0, 500) ?? null,
        quizScope: parsed.quiz_scope ?? null,
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
}
