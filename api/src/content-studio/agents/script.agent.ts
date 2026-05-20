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
import { LessonFormat } from '../entities/content-series.entity';

/**
 * Format-specific SYSTEM prompts. The `lecture` style is the original
 * 8-12 min audio script. Other formats reshape the output for that
 * delivery medium — same brand voice rules, different structure.
 */
const SYSTEM_BY_FORMAT: Record<LessonFormat, string> = {
  lecture: `
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
`.trim(),

  live_coding: `
You write LIVE-CODING DEMO SCRIPTS for screen-recorded lessons. The host
narrates over a code/IDE/terminal demo — write a structured demo plan with
narration cues.

RULES (non-negotiable):
- TARGET LENGTH: 12–18 minutes recorded.
- HOOK: open with concrete stakes in the first 8 seconds — what we're
  building and why anyone watching will care (a number, a bug, a real
  outage). Then cut to the screen.
- STRUCTURE: [HOOK] → [SETUP — what we have, what we'll build] →
  [STEP 1] → [STEP 2] → [STEP 3] (more if needed) → [GOTCHA / common
  mistake at this point] → [PAYOFF / it works] → [RECAP] → [QUIZ TEASE].
- SECTION MARKERS: each section starts with a header line in CAPS, e.g.:
    HOOK
    SETUP
    STEP 1 — INSTALL THE LIBRARY
    GOTCHA
    PAYOFF
    RECAP
    QUIZ TEASE
- Under each header, write the NARRATION the host speaks — first person,
  conversational ("Okay, watch this — I'll…"). Then on a new line write
  ON-SCREEN: <what the viewer sees>: the exact command, file path, code
  block, or click. Code blocks go in fenced triple-backtick blocks.
- Use real libraries / package names / commands. No placeholder "your-tool".
- QUIZ TEASE: 1–2 sentences referencing the Saturday quiz scope.

OUTPUT: the demo script only — headers + narration + ON-SCREEN cues.
`.trim(),

  walkthrough: `
You write UI WALKTHROUGH SCRIPTS for screen-recorded product/tool tours.
The host narrates while clicking through a real dashboard, console, or
SaaS UI.

RULES:
- TARGET LENGTH: 6–10 minutes.
- HOOK: first 8 seconds — what the viewer will be able to DO after watching.
- STRUCTURE: [HOOK] → [WHAT THIS TOOL IS] → [STEP-BY-STEP through the
  flow] → [GOTCHA] → [RECAP] → [QUIZ TEASE].
- SECTION MARKERS in CAPS exactly like the live_coding format.
- Under each section: narration in first person, then on a new line
  ON-SCREEN: <what to click / where to look>.
- Use real button labels, menu paths, URL patterns. No placeholders.
- QUIZ TEASE: 1–2 sentences referencing the Saturday quiz scope.

OUTPUT: the walkthrough script only.
`.trim(),

  interview: `
You write TWO-VOICE INTERVIEW SCRIPTS — HOST and GUEST in conversation.

RULES:
- TARGET LENGTH: 10–14 minutes.
- HOOK: HOST opens with one concrete stakes line in the first 8 seconds.
- FORMAT: prefix every line with HOST: or GUEST: (no other speakers).
- STRUCTURE: hook → context question → core question → drill-down on a
  real example → disagreement / nuance moment → recap → quiz tease.
- The GUEST voice should sound expert but human — say "I" and "in our
  team", not "one might consider".
- Use [PAUSE] markers between turns for a natural cadence.
- QUIZ TEASE: HOST closes with 1–2 sentences on the Saturday quiz scope.

OUTPUT: the dialogue only — HOST:/GUEST: lines with [PAUSE] markers.
`.trim(),

  short: `
You write 30–60 SECOND SHORTS — vertical-format teaser/recap scripts.

RULES:
- TARGET LENGTH: 90–160 words (≈ 30–60 seconds at fast pace).
- HOOK: first 5 words MUST make someone stop scrolling. A number, a
  contradiction, or a stakes question.
- STRUCTURE: hook → ONE punchy point → one real example → ONE-line CTA
  pointing at the full lesson on the channel.
- NO PAUSE markers — fast pace, no breath room.
- Voice obeys brand memories verbatim.

OUTPUT: the raw spoken text only. No headers, no markdown.
`.trim(),
};

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Words-per-minute estimate by format (used for duration display). */
const WPM_BY_FORMAT: Record<LessonFormat, number> = {
  lecture: 140,
  live_coding: 120, // slower — explaining + typing
  walkthrough: 130,
  interview: 145,
  short: 170,       // fast-paced
};

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

    const fmt: LessonFormat = lesson.lessonFormat ?? 'lecture';
    const SYSTEM = SYSTEM_BY_FORMAT[fmt];

    const memories = await this.memories.semanticRelevantFor(
      brand.id, 'script', `${lesson.title} ${lesson.hook ?? ''}`, 8,
    );
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
      `Format: ${fmt}\n` +
      `Hook seed: ${lesson.hook ?? '(none)'}\n` +
      `Target duration: ${lesson.targetDurationMinutes} minutes.\n` +
      `Outline:\n${outlineBlock || '  (no outline)'}\n\n` +
      `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n` +
      `Write the full ${fmt} script now per the rules above.`;

    const result = await this.loop.run<{ script: string }>({
      agentType: 'script',
      planId: plan.id,
      lessonId: lesson.id,
      memoryCount: memories.length,
      graderModelOverride: brand.modelOverrides?.grader,
      context:
        `Lesson: ${lesson.title} (${lesson.targetDurationMinutes} min, ${fmt}) · ` +
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
          modelOverride: brand.modelOverrides?.script,
          // Shorts are tiny; everything else fits in 6k.
          maxTokens: fmt === 'short' ? 800 : 6000,
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
    const wpm = WPM_BY_FORMAT[fmt];
    const durationSec = Math.round((words / wpm) * 60);

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
          lessonFormat: fmt,
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
      `Script v${asset.version} (${fmt}) for "${lesson.title}" — ${words} words, ` +
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
