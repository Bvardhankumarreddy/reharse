import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import { ModelRouterService } from '../services/model-router.service';
import { ImprovementLoopService } from '../services/improvement-loop.service';
import { BrandMemoryService } from '../services/brand-memory.service';
import { ProviderName } from '../services/provider.types';

const SYSTEM = `
You write AUDIO SCRIPTS for educational YouTube lessons. The script is READ
ALOUD by a host — write for the ear, not the page.

RULES (non-negotiable):
- TARGET LENGTH: 8–12 minutes spoken (≈ 1100–1700 words at ~140 wpm).
- HOOK: the very first sentence IS the hook — concrete stakes (a number, a
  failure, a "most people get this wrong") in the first 8 seconds. Open IN
  the moment. Never "In this video we'll cover…".
- PAUSE MARKERS: use [PAUSE] for a natural breath, [PAUSE 1.5s] before a
  reveal, [PAUSE 2s] for a dramatic beat. Inline at end of a sentence or on
  their own line.
- VOICE: obey the brand voice/style/do/don't memories provided — verbatim.
- STRUCTURE: hook → why it matters → core concept with one real, named
  example → common mistake → recap → quiz tease.
- QUIZ TEASE: end with 1–2 sentences referencing the brand's Saturday quiz
  on this week's theme (use the quiz scope provided).
- NO filler intros, NO unexplained acronyms, NO "imagine a system" — use
  real companies / tools / numbers.

OUTPUT: the raw script only. No headers, no scene labels, no markdown — just
spoken text with pause markers.
`.trim();

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

@Injectable()
export class ScriptAgent {
  private readonly logger = new Logger(ScriptAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    private readonly router: ModelRouterService,
    private readonly loop: ImprovementLoopService,
    private readonly memories: BrandMemoryService,
  ) {}

  async generateScript(lessonId: string): Promise<ContentAsset> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const memories = await this.memories.relevantFor(brand.id, 'script');
    const memoryBlock = this.memories.format(memories);
    const outlineBlock = (lesson.outline ?? [])
      .map(
        (s, i) =>
          `  ${i + 1}. ${s.heading}\n` +
          (s.points ?? []).map((p) => `     - ${p}`).join('\n'),
      )
      .join('\n');
    const userBase =
      `BRAND: ${brand.name}\n` +
      `Voice/style: ${brand.voiceStyle ?? ''}\n\n` +
      `WEEK THEME: ${plan.theme ?? '(none)'}\n` +
      `QUIZ SCOPE (use for the tease at the end): ${plan.quizScope ?? '(none)'}\n\n` +
      `LESSON ${lesson.lessonNumber}: ${lesson.title}\n` +
      `Hook seed: ${lesson.hook ?? '(none)'}\n` +
      `Target duration: ${lesson.targetDurationMinutes} minutes spoken.\n` +
      `Outline:\n${outlineBlock || '  (no outline)'}\n\n` +
      `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n` +
      `Write the full audio script now. Plain text with [PAUSE] markers, no markdown.`;

    const result = await this.loop.run<{ script: string }>({
      agentType: 'script',
      planId: plan.id,
      lessonId: lesson.id,
      memoryCount: memories.length,
      context:
        `Lesson: ${lesson.title} (${lesson.targetDurationMinutes} min) · ` +
        `Brand: ${brand.name} · Voice: ${(brand.voiceStyle ?? '').slice(0, 200)}`,
      draftFn: async (critique) => {
        const user = critique
          ? `${userBase}\n\nREVISION REQUESTED — your previous draft scored below the quality bar. Fix these:\n${critique}\nRewrite the FULL script now.`
          : userBase;
        const r = await this.router.run({
          task: 'script',
          agentType: 'script',
          planId: plan.id,
          lessonId: lesson.id,
          maxTokens: 6000,
          temperature: 0.75,
          system: SYSTEM,
          user,
        });
        const text = (r.text ?? '').trim();
        return {
          parsed: { script: text },
          rawForGrader: text,
          model: r.model,
          provider: r.provider as ProviderName,
          costUsd: r.costUsd,
        };
      },
    });

    const script = result.parsed.script;
    const words = wordCount(script);
    const durationSec = Math.round((words / 140) * 60);

    const latest = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
    const asset = await this.assetRepo.save(
      this.assetRepo.create({
        planId: plan.id,
        lessonId: lesson.id,
        assetType: 'script',
        version: (latest?.version ?? 0) + 1,
        content: {
          fullScript: script,
          wordCount: words,
          durationEstimateSeconds: durationSec,
          model: result.model,
          provider: result.provider,
          costUsd: result.totalCostUsd,
        },
        qualityScore: result.qualityScore,
        revisions: result.revisions,
        critique: result.critique,
        confidence: result.confidence,
        status: 'draft',
      }),
    );

    await this.lessonRepo.update(lesson.id, { status: 'scripted' });
    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + result.totalCostUsd,
    });
    this.logger.log(
      `Script v${asset.version} for "${lesson.title}" — ${words} words, ` +
      `${result.revisions} revision(s), score ${result.qualityScore ?? 'n/a'} ` +
      `($${result.totalCostUsd.toFixed(4)})`,
    );
    return asset;
  }

  async latestScript(lessonId: string): Promise<ContentAsset | null> {
    return this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
  }
}
