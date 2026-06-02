import {
  Injectable, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { Channel } from '../entities/channel.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson, OutlineSection } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import {
  ContentSeries, LessonFormat, isLessonFormat,
} from '../entities/content-series.entity';
import { CompetitorVideo } from '../entities/competitor-video.entity';
import { CompetitorChannel } from '../entities/competitor-channel.entity';
import { ChannelVideo } from '../entities/channel-video.entity';
import { QuestionPool } from '../entities/question-pool.entity';
import { DeliveredQuiz } from '../entities/delivered-quiz.entity';
import { QuizBundle } from '../entities/quiz-bundle.entity';
import { QuizPromoPackage } from '../entities/quiz-promo-package.entity';
import { AgentRun } from '../entities/agent-run.entity';
import { PipelineRun } from '../entities/pipeline-run.entity';
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

const SEED_LESSON_SYSTEM = `
You design ONE lesson around a SPECIFIC question the curator wants
answered. Treat the question as the LESSON'S CORE — every section of
the outline should drive toward answering it convincingly.

The question is usually an interview-style or learner-confusion
question (e.g. "What's the difference between OAuth client_id and
client_secret?" or "How does CORS actually work?"). Your job:

- TITLE: punchy and clickable. The viewer should see it and think
  "yes, I want this answered". Reference the question's core noun,
  not the literal phrasing. Up to 100 chars; 60-90 is the sweet spot.
- HOOK: first ~8 seconds. Concrete stakes — a real failure mode, a
  number, a "most devs get this wrong". Open IN the moment, never
  "in this video we'll cover…".
- OUTLINE: 4-6 sections, each with 2-4 teaching points. Structure
  the answer:
    1. The question, in plain terms (anchor)
    2. The naive / wrong answer most people give (and why it fails)
    3-4. The correct mental model with a real example
    5. Common gotchas + how to avoid them
    6. (Optional) When the answer changes — edge cases
- lesson_format: 'lecture' | 'live_coding' | 'walkthrough' | 'interview' | 'short'
  Pick the format that best ANSWERS this question. Tool/API setup
  questions → live_coding. Conceptual "why does X work that way" →
  lecture. UI/dashboard tour questions → walkthrough. Use the existing
  format only if the question genuinely fits it.
- target_duration_minutes: integer fit for the format (lecture ~10,
  live_coding ~15, walkthrough ~8, interview ~12, short ~1).

Honour brand voice memories verbatim. Stay concrete — real names,
tools, numbers. No "imagine a system".

Output a SINGLE JSON object only (NOT an array, NO "lessons" wrapper):
{"title":"…","hook":"…","lesson_format":"lecture","target_duration_minutes":10,"outline":[{"heading":"…","points":["…","…"]}]}
`.trim();

const REGEN_LESSON_SYSTEM = `
You re-plan ONE lesson slot with a COMPLETELY NEW TOPIC. Pick a genuinely
different subject from the current lesson — NOT a reword, NOT a slight
variation, NOT the same topic from another angle. A viewer should see it as
a brand-new lesson.

Constraints:
- It must fit the brand and may relate to the week's theme, but the TOPIC
  itself must be clearly new vs. the lesson being replaced.
- Do NOT overlap the sibling lesson(s) shown to you.
- If the curator gave a guidance note, obey it.

The lesson needs:
- title    : punchy, clickable
- hook     : first ~8s, concrete stakes (a number, a failure, a "most people
             get this wrong")
- outline  : 4-6 sections, each heading + 2-4 teaching points
- lesson_format: one of "lecture" | "live_coding" | "walkthrough" |
                 "interview" | "short"
- target_duration_minutes: integer

Honour brand voice memories verbatim and any curator guidance provided. Be
specific and practical — real tools/numbers, no vague "imagine a system".

Output a SINGLE JSON object only (NOT an array, NO "lessons" wrapper):
{"title":"...","hook":"...","lesson_format":"lecture","target_duration_minutes":10,"outline":[{"heading":"...","points":["...","..."]}]}
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
  /**
   * Free-text steering note from the curator. Injected into the strategy
   * prompt as 'CURATOR CUSTOM IDEA (obey first)' so the LLM prefers this
   * direction over its own theme pick. Trimmed to 600 chars.
   */
  customIdea?: string | null;
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
    @InjectRepository(ChannelVideo) private readonly channelVidRepo: Repository<ChannelVideo>,
    @InjectRepository(NewsItem) private readonly newsRepo: Repository<NewsItem>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    @InjectRepository(QuestionPool) private readonly questionPoolRepo: Repository<QuestionPool>,
    @InjectRepository(DeliveredQuiz) private readonly deliveredQuizRepo: Repository<DeliveredQuiz>,
    @InjectRepository(QuizBundle) private readonly bundleRepo: Repository<QuizBundle>,
    @InjectRepository(QuizPromoPackage) private readonly promoRepo: Repository<QuizPromoPackage>,
    @InjectRepository(AgentRun) private readonly agentRunRepo: Repository<AgentRun>,
    @InjectRepository(PipelineRun) private readonly pipelineRunRepo: Repository<PipelineRun>,
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

    // ── Enrichment: last 8 themes (anti-repeat), own top videos, competitor
    //    top, AQB news ──
    const [recentThemes, ownChannelTop, competitorTop, newsTop, seriesArcBlock] =
      await Promise.all([
        this.recentThemes(brandId, 8),
        this.ownChannelTopBlock(brandId, 10),
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
      const idea = (opts.customIdea ?? '').trim().slice(0, 600);

      const userPrompt =
        `BRAND: ${brand.name}\n` +
        `Description: ${brand.description ?? ''}\n` +
        `Voice/style: ${brand.voiceStyle ?? ''}\n` +
        `Cadence: ${channel?.cadence ?? '2 lessons + 1 quiz / week'}\n` +
        `Week of: ${week}\n\n` +
        (idea
          ? `CURATOR CUSTOM IDEA (obey first — make the week's theme + ` +
            `lessons concretely fit this direction):\n${idea}\n\n`
          : '') +
        `BRAND MEMORIES (obey these):\n${memoryBlock}\n\n` +
        (seriesArcBlock ? `${seriesArcBlock}\n\n` : '') +
        `RECENT THEMES (last 8 weeks — DO NOT repeat these):\n` +
        `${recentThemes.length ? recentThemes.map((t, i) => `  ${i + 1}. ${t}`).join('\n') : '  (none)'}\n\n` +
        `YOUR CHANNEL'S TOP VIDEOS (what already works for THIS audience — lean into these angles):\n${ownChannelTop}\n\n` +
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

  /**
   * Regenerate an ENTIRE week plan in place — wipes the plan's lessons,
   * assets, quiz pool, quiz bundle (+questions), quiz promo, delivered
   * quiz, and prior agent runs, then re-runs the strategy LLM. The plan
   * row itself stays (same id, same brandId/weekOf/series ties).
   *
   * Opts:
   *   - customIdea:  free-text steering (same shape as generateWeek)
   *   - keepTheme:   preserve the existing plan.theme + plan.quizScope so
   *                  the LLM regenerates lessons ONLY within those rails
   *                  (won't pick a new theme).
   *
   * Active pipeline-runs block regen — same gate as deletePlan.
   */
  async regenerateWeek(planId: string, opts: {
    customIdea?: string | null;
    keepTheme?: boolean;
  } = {}): Promise<WeeklyContentPlan> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const active = await this.pipelineRunRepo.count({
      where: [
        { planId, status: 'queued' },
        { planId, status: 'running' },
      ],
    });
    if (active > 0) {
      throw new BadRequestException(
        `Plan has ${active} active pipeline run(s) — wait or cancel them before regenerating.`,
      );
    }

    // ── Wipe everything below the plan row ──────────────────────────────
    const lessons = await this.lessonRepo.find({ where: { planId } });
    if (lessons.length) {
      // Assets are scoped per-lesson — clear them before dropping lessons.
      await this.assetRepo.delete({ lessonId: In(lessons.map((l) => l.id)) });
    }
    // Order matters: question_pool is FK'd by delivered_quiz.
    await this.deliveredQuizRepo.delete({ planId });
    await this.questionPoolRepo.delete({ planId });
    // Bundle questions cascade with the bundle row.
    const bundles = await this.bundleRepo.find({ where: { planId } });
    if (bundles.length) {
      await this.promoRepo.delete({ planId });
      await this.bundleRepo.delete({ planId });
    }
    await this.agentRunRepo.delete({ planId });
    await this.lessonRepo.delete({ planId });

    // Existing theme/quizScope: keep if requested, otherwise wipe so the
    // regenerator picks a fresh one.
    const keptTheme = opts.keepTheme ? plan.theme : null;
    const keptQuizScope = opts.keepTheme ? plan.quizScope : null;

    await this.planRepo.update(planId, {
      theme: keptTheme,
      quizScope: keptQuizScope,
      notes: null,
      status: 'generating',
      totalCostUsd: 0,
      approvalStatus: 'pending', // re-trigger the curator gate
      approvedBy: null,
      approvedAt: null,
      approvalNote: null,
    });

    try {
      const memories = await this.memories.relevantFor(plan.brandId, 'strategy');
      const channel = await this.channelRepo.findOne({ where: { brandId: plan.brandId } });
      const [recentThemes, ownChannelTop, competitorTop, newsTop, seriesArcBlock] =
        await Promise.all([
          this.recentThemes(plan.brandId, 8),
          this.ownChannelTopBlock(plan.brandId, 10),
          this.competitorTopBlock(plan.brandId, 30, 12),
          this.newsTopBlock(7, 5),
          this.seriesArcBlock(plan.seriesId, plan.seriesWeekNumber),
        ]);

      const memoryBlock = this.memories.format(memories);
      const idea = (opts.customIdea ?? '').trim().slice(0, 600);
      const themeRail = keptTheme
        ? `KEEP THIS THEME (rails — do NOT pick a new theme):\n  theme: ${keptTheme}\n  quizScope: ${keptQuizScope ?? '(none)'}\n\n`
        : '';

      const userPrompt =
        `BRAND: ${brand.name}\n` +
        `Description: ${brand.description ?? ''}\n` +
        `Voice/style: ${brand.voiceStyle ?? ''}\n` +
        `Cadence: ${channel?.cadence ?? '2 lessons + 1 quiz / week'}\n` +
        `Week of: ${plan.weekOf}\n\n` +
        themeRail +
        (idea
          ? `CURATOR CUSTOM IDEA (obey first):\n${idea}\n\n`
          : '') +
        `BRAND MEMORIES (obey these):\n${memoryBlock}\n\n` +
        (seriesArcBlock ? `${seriesArcBlock}\n\n` : '') +
        `RECENT THEMES (last 8 weeks — DO NOT repeat these):\n` +
        `${recentThemes.length ? recentThemes.map((t, i) => `  ${i + 1}. ${t}`).join('\n') : '  (none)'}\n\n` +
        `YOUR CHANNEL'S TOP VIDEOS:\n${ownChannelTop}\n\n` +
        `COMPETITORS:\n${competitorTop}\n\n` +
        `NEWS:\n${newsTop}\n\n` +
        `Re-plan this week. Output the JSON object only.`;

      const result = await this.router.run({
        task: 'strategy',
        agentType: 'strategy',
        planId,
        modelOverride: brand.modelOverrides?.strategy,
        jsonOutput: true,
        maxTokens: 3500,
        temperature: 0.85,
        system: SYSTEM,
        user: userPrompt,
      });

      const parsed = JSON.parse(result.text || '{}') as StrategyJson;
      const newLessons = (parsed.lessons ?? []).slice(0, 2);
      if (newLessons.length === 0) throw new Error('Regenerate returned no lessons');

      const arcFormats = await this.arcFormatsFor(plan.seriesId, plan.seriesWeekNumber);
      await this.lessonRepo.save(
        newLessons.map((l, i) => {
          const requested = (l.lesson_format ?? '').toString();
          const fmt: LessonFormat = isLessonFormat(requested)
            ? requested
            : (arcFormats[i] ?? 'lecture');
          return this.lessonRepo.create({
            planId,
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

      await this.planRepo.update(planId, {
        // If keepTheme=false, the LLM picked a new theme/scope — adopt it.
        // If keepTheme=true, leave whatever the LLM returned; trust the rails.
        theme: keptTheme ?? parsed.theme?.slice(0, 500) ?? null,
        quizScope: keptQuizScope ?? parsed.quiz_scope ?? null,
        notes: parsed.rationale ? parsed.rationale.slice(0, 2000) : null,
        status: 'ready',
        totalCostUsd: result.costUsd,
      });
      this.logger.log(
        `Regenerated plan ${planId} ` +
        `(keepTheme=${!!opts.keepTheme}, customIdea=${!!idea}) — ` +
        `${newLessons.length} lessons ($${result.costUsd.toFixed(4)}, ${result.model})`,
      );
    } catch (e) {
      await this.planRepo.update(planId, { status: 'failed' });
      throw e;
    }

    const saved = await this.planRepo.findOne({
      where: { id: planId },
      relations: ['lessons'],
    });
    if (!saved) throw new Error('Plan vanished after regenerate');
    saved.lessons?.sort((a, b) => a.lessonNumber - b.lessonNumber);
    return saved;
  }

  /**
   * Regenerate a SINGLE lesson in place — keeps the week theme + the other
   * lesson, produces a fresh title/hook/outline/format for just this slot,
   * and wipes the lesson's now-stale assets (script/ppt/seo/thumbnail/promo).
   * An optional `guidance` note steers the rewrite ("more hands-on", etc.).
   */
  async regenerateLesson(
    lessonId: string,
    opts: { guidance?: string } = {},
  ): Promise<Lesson> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const siblings = (
      await this.lessonRepo.find({
        where: { planId: plan.id },
        order: { lessonNumber: 'ASC' },
      })
    ).filter((l) => l.id !== lessonId);
    const siblingBlock = siblings.length
      ? siblings
        .map((s) => `LESSON ${s.lessonNumber}: ${s.title} — ${s.hook ?? ''}`)
        .join('\n')
      : '(none)';

    const memories = await this.memories.relevantFor(brand.id, 'strategy');
    const memoryBlock = this.memories.format(memories);
    const guidance = (opts.guidance ?? '').trim().slice(0, 600);

    const result = await this.router.run({
      task: 'strategy',
      agentType: 'strategy',
      planId: plan.id,
      lessonId: lesson.id,
      modelOverride: brand.modelOverrides?.strategy,
      jsonOutput: true,
      maxTokens: 2000,
      temperature: 0.9, // higher → a genuinely different take, not a paraphrase
      system: REGEN_LESSON_SYSTEM,
      user:
        `BRAND: ${brand.name}\nVoice/style: ${brand.voiceStyle ?? ''}\n\n` +
        `WEEK THEME: ${plan.theme ?? '(none)'}\n` +
        `QUIZ SCOPE: ${plan.quizScope ?? '(none)'}\n\n` +
        `THE OTHER LESSON(S) THIS WEEK (do NOT overlap with these):\n${siblingBlock}\n\n` +
        `LESSON TO REPLACE — number ${lesson.lessonNumber}, currently:\n` +
        `  title: ${lesson.title}\n  hook: ${lesson.hook ?? '(none)'}\n` +
        `  format: ${lesson.lessonFormat}\n\n` +
        (guidance
          ? `CURATOR GUIDANCE (obey this):\n${guidance}\n\n`
          : `(No specific guidance — choose any strong NEW topic for the slot.)\n\n`) +
        `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n` +
        `Pick a COMPLETELY NEW topic — different from the lesson above, not a ` +
        `reword of it. Return the single replacement lesson as JSON only.`,
    });

    let parsed: {
      title?: string; hook?: string; lesson_format?: string;
      target_duration_minutes?: number; outline?: OutlineSection[];
    };
    try {
      parsed = JSON.parse(result.text || '{}');
    } catch {
      throw new Error('Lesson regeneration returned unparseable JSON');
    }
    if (!parsed.title?.trim()) throw new Error('Regeneration produced no title');

    const requested = (parsed.lesson_format ?? '').toString();
    const fmt: LessonFormat = isLessonFormat(requested)
      ? requested
      : lesson.lessonFormat; // keep existing format if model omits/invalid

    await this.lessonRepo.update(lesson.id, {
      title: parsed.title.slice(0, 500),
      hook: parsed.hook ?? null,
      outline: Array.isArray(parsed.outline) ? parsed.outline : [],
      targetDurationMinutes:
        parsed.target_duration_minutes ?? this.defaultDurationFor(fmt),
      lessonFormat: fmt,
      status: 'planned', // back to square one — assets are now stale
    });

    // Wipe the now-stale generated assets for this lesson.
    const wiped = await this.assetRepo.delete({ lessonId: lesson.id });
    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + result.costUsd,
    });
    this.logger.log(
      `Regenerated lesson ${lesson.lessonNumber} "${parsed.title}" (${fmt}) ` +
      `— wiped ${wiped.affected ?? 0} stale asset(s) ($${result.costUsd.toFixed(4)})`,
    );

    const updated = await this.lessonRepo.findOne({ where: { id: lesson.id } });
    if (!updated) throw new Error('Lesson vanished after regenerate');
    return updated;
  }

  /**
   * Seed a lesson slot from a SPECIFIC interview question. Unlike
   * regenerateLesson (which asks the LLM to pick a fresh topic),
   * this uses the question itself as the lesson's core problem and
   * expands it into title + hook + outline + format.
   *
   * After seeding the lesson rows, wipes the lesson's stale assets
   * (script/ppt/seo/thumbnail/promo) — same as regenerateLesson —
   * so the next pipeline run picks up the new lesson.
   */
  async seedLessonFromQuestion(
    lessonId: string,
    opts: { question: string },
  ): Promise<Lesson> {
    const question = (opts.question ?? '').trim();
    if (question.length < 8) {
      throw new BadRequestException('question must be at least 8 characters');
    }
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const siblings = (
      await this.lessonRepo.find({
        where: { planId: plan.id },
        order: { lessonNumber: 'ASC' },
      })
    ).filter((l) => l.id !== lessonId);
    const siblingBlock = siblings.length
      ? siblings
        .map((s) => `LESSON ${s.lessonNumber}: ${s.title} — ${s.hook ?? ''}`)
        .join('\n')
      : '(none)';

    const memories = await this.memories.relevantFor(brand.id, 'strategy');
    const memoryBlock = this.memories.format(memories);

    const result = await this.router.run({
      task: 'strategy',
      agentType: 'strategy',
      planId: plan.id,
      lessonId: lesson.id,
      modelOverride: brand.modelOverrides?.strategy,
      jsonOutput: true,
      maxTokens: 2000,
      temperature: 0.7,
      system: SEED_LESSON_SYSTEM,
      user:
        `BRAND: ${brand.name}\nVoice/style: ${brand.voiceStyle ?? ''}\n\n` +
        `WEEK THEME: ${plan.theme ?? '(none)'}\n` +
        `QUIZ SCOPE: ${plan.quizScope ?? '(none)'}\n\n` +
        `THE OTHER LESSON(S) THIS WEEK (don't overlap):\n${siblingBlock}\n\n` +
        `LESSON SLOT TO FILL — number ${lesson.lessonNumber}.\n\n` +
        `═══ THE QUESTION TO DESIGN AROUND ═══\n${question.slice(0, 1000)}\n═══\n\n` +
        `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n` +
        `Design the lesson that answers this question. Return the single ` +
        `replacement lesson as JSON only.`,
    });

    let parsed: {
      title?: string; hook?: string; lesson_format?: string;
      target_duration_minutes?: number; outline?: OutlineSection[];
    };
    try {
      parsed = JSON.parse(result.text || '{}');
    } catch {
      throw new Error('Lesson seeding returned unparseable JSON');
    }
    if (!parsed.title?.trim()) throw new Error('Seeding produced no title');

    const requested = (parsed.lesson_format ?? '').toString();
    const fmt: LessonFormat = isLessonFormat(requested)
      ? requested
      : lesson.lessonFormat;

    await this.lessonRepo.update(lesson.id, {
      title: parsed.title.slice(0, 500),
      hook: parsed.hook ?? null,
      outline: Array.isArray(parsed.outline) ? parsed.outline : [],
      targetDurationMinutes:
        parsed.target_duration_minutes ?? this.defaultDurationFor(fmt),
      lessonFormat: fmt,
      status: 'planned',
    });

    // Wipe stale assets — script / ppt / seo / thumbnail / promo all need
    // to be regenerated against the new lesson topic.
    const wiped = await this.assetRepo.delete({ lessonId: lesson.id });
    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + result.costUsd,
    });
    this.logger.log(
      `Seeded lesson ${lesson.lessonNumber} from question — "${parsed.title}" (${fmt}) ` +
      `— wiped ${wiped.affected ?? 0} stale asset(s) ($${result.costUsd.toFixed(4)})`,
    );

    const updated = await this.lessonRepo.findOne({ where: { id: lesson.id } });
    if (!updated) throw new Error('Lesson vanished after seed');
    return updated;
  }

  /**
   * Bulk-seed every lesson in a plan from a list of questions. The
   * mapping is positional: questions[0] → lesson 1, questions[1] →
   * lesson 2, etc. Extra questions past the lesson count are ignored;
   * extra lessons past the question count keep their current topic.
   *
   * Calls seedLessonFromQuestion per slot sequentially so the prompt
   * for question N can see the new sibling from question N-1 (avoids
   * topic overlap automatically).
   *
   * Returns the refreshed plan with both lessons.
   */
  async seedAllLessonsFromQuestions(
    planId: string,
    questions: string[],
  ): Promise<WeeklyContentPlan> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const cleanQuestions = (questions ?? [])
      .map((q) => (q ?? '').toString().trim())
      .filter((q) => q.length >= 8);
    if (cleanQuestions.length === 0) {
      throw new BadRequestException('Provide at least one question (min 8 chars each)');
    }

    const lessons = await this.lessonRepo.find({
      where: { planId },
      order: { lessonNumber: 'ASC' },
    });
    if (lessons.length === 0) {
      throw new BadRequestException('Plan has no lessons — generate the week plan first');
    }

    // Pair lessons with questions positionally.
    const pairs = lessons
      .map((l, i) => ({ lesson: l, question: cleanQuestions[i] }))
      .filter((p) => p.question);

    this.logger.log(
      `Bulk-seeding plan ${planId}: ${pairs.length}/${lessons.length} lesson(s) from supplied questions`,
    );

    for (const { lesson, question } of pairs) {
      await this.seedLessonFromQuestion(lesson.id, { question });
    }

    const saved = await this.planRepo.findOne({
      where: { id: planId },
      relations: ['lessons'],
    });
    if (!saved) throw new Error('Plan vanished after bulk seed');
    saved.lessons?.sort((a, b) => a.lessonNumber - b.lessonNumber);
    return saved;
  }

  /**
   * Delete a lesson outright — removes its assets, drops the row, and
   * re-numbers the remaining lessons in the plan to a contiguous 1..N.
   */
  async deleteLesson(lessonId: string): Promise<{ ok: true; remaining: number }> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const planId = lesson.planId;

    await this.assetRepo.delete({ lessonId });
    await this.lessonRepo.delete({ id: lessonId });

    // Re-number survivors so lessonNumber stays 1..N with no gaps.
    const remaining = await this.lessonRepo.find({
      where: { planId },
      order: { lessonNumber: 'ASC' },
    });
    let n = 1;
    for (const l of remaining) {
      if (l.lessonNumber !== n) {
        await this.lessonRepo.update(l.id, { lessonNumber: n });
      }
      n++;
    }
    this.logger.log(
      `Deleted lesson "${lesson.title}" from plan ${planId} — ${remaining.length} left`,
    );
    return { ok: true, remaining: remaining.length };
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

  private async ownChannelTopBlock(brandId: string, limit: number): Promise<string> {
    try {
      const rows = await this.channelVidRepo.find({
        where: { brandId },
        order: { viewCount: 'DESC' },
        take: limit,
      });
      if (!rows.length) return '  (no back-catalog data yet — sync your channel)';
      return rows
        .map((v) => {
          const k = Math.round(Number(v.viewCount ?? 0) / 1000);
          return `  • [${k}k views] ${v.title.slice(0, 140)}`;
        })
        .join('\n');
    } catch (e) {
      this.logger.warn(`ownChannelTopBlock failed: ${(e as Error).message}`);
      return '  (own-channel data unavailable)';
    }
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
