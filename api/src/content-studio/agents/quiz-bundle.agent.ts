import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import { QuizBundle } from '../entities/quiz-bundle.entity';
import {
  QuizBundleQuestion, BundleQuestionType, BundleDifficulty,
} from '../entities/quiz-bundle-question.entity';
import { ModelRouterService } from '../services/model-router.service';
import { BrandMemoryService } from '../services/brand-memory.service';

// Two-call generation:
//   1) METADATA  — title + description + numeric tie-breaker. Small output.
//   2) QUESTIONS — just the N question objects. Big output (up to 100 Qs).
// Splitting prevents JSON truncation when the LLM's max-output budget can't
// fit both the header and a long question list in a single response.

const META_SYSTEM = `
You write the HEADER of a weekly Quiz Module: title + description + tie-breaker.

TITLE: short, brandable, ≤ 80 chars.
DESCRIPTION: 3-5 lines, plain prose. List what the quiz covers (lesson
titles), how many questions / points / minutes, the pass mark, what the
tie-breaker does.
TIE_BREAKER: ONE numeric question whose answer is a SPECIFIC verifiable fact
from the lessons (a number, a year, a count, a dollar amount). Tolerance
should be 0 so closest-guess wins. No "estimate" prompts.

OUTPUT STRICT JSON ONLY:
{
  "title": "…",
  "description": "…",
  "tieBreaker": {
    "question": "…",
    "answer": <number>,
    "tolerance": <number>,
    "unit": "…"
  }
}
Output the JSON object only.
`.trim();

const QUESTIONS_SYSTEM = `
You write quiz questions for an LMS-style Quiz Module. Quality matters —
these are graded and shown to learners.

Per question, choose the BEST type for the concept:
  • "mcq"          → 4 distinct options, one correct (letter A-D).
  • "true_false"   → optionA "True", optionB "False", correctAnswer "A" or "B".
  • "multi_select" → 4 options, 2-3 correct (e.g. correctAnswers "A,C,D").
                     Use SPARINGLY (≤ 15% of questions).
  • "numeric"      → no options; a specific verifiable number + tolerance + unit.
                     Use SPARINGLY (≤ 10% of questions).

Rules for ALL questions:
- Test understanding (apply / distinguish / reason), not trivia.
- Use real names / tools / numbers from the lessons when natural.
- Distractors plausible but verifiably wrong.
- NO "all of the above" / "none of the above".
- NO trick wording or double negatives.
- Keep each question_text under ~220 chars.
- Omit fields that don't apply (e.g. don't include optionA on a numeric).

Points by difficulty: easy=1, medium=2, hard=3.
"category" = the lesson title the question belongs to.

OUTPUT STRICT JSON ONLY:
{
  "questions": [
    {
      "questionType": "mcq" | "true_false" | "multi_select" | "numeric",
      "questionText": "…",
      "optionA": "…", "optionB": "…", "optionC": "…", "optionD": "…",
      "correctAnswer": "A" | "B" | "C" | "D",
      "correctAnswers": "A,B,C",
      "correctNumber": <number>,
      "numericTolerance": <number>,
      "numericUnit": "…",
      "points": <int>,
      "difficulty": "easy" | "medium" | "hard",
      "category": "…",
      "isMandatory": false
    }
  ]
}
Generate EXACTLY the requested count and difficulty split. Output the JSON
object only — no prose, no markdown fences.
`.trim();

const TOUGHNESS_MIN = 1;
const TOUGHNESS_MAX = 5;
const BUNDLE_MIN = 5;
const BUNDLE_MAX = 100;
const BUNDLE_DEFAULT = 40;

/** Same toughness distribution table the existing quiz pool uses. */
const TOUGHNESS_DIST: Record<number, Record<BundleDifficulty, number>> = {
  1: { easy: 0.50, medium: 0.30, hard: 0.20 },
  2: { easy: 0.35, medium: 0.35, hard: 0.30 },
  3: { easy: 0.20, medium: 0.40, hard: 0.40 },
  4: { easy: 0.10, medium: 0.35, hard: 0.55 },
  5: { easy: 0.05, medium: 0.25, hard: 0.70 },
};

const POINTS_BY_DIFFICULTY: Record<BundleDifficulty, number> = {
  easy: 1, medium: 2, hard: 3,
};

interface LlmTieBreaker {
  question?: unknown;
  answer?: unknown;
  tolerance?: unknown;
  unit?: unknown;
}
interface LlmQuestion {
  questionType?: unknown;
  questionText?: unknown;
  optionA?: unknown; optionB?: unknown; optionC?: unknown; optionD?: unknown;
  correctAnswer?: unknown;
  correctAnswers?: unknown;
  correctNumber?: unknown;
  numericTolerance?: unknown;
  numericUnit?: unknown;
  points?: unknown;
  difficulty?: unknown;
  category?: unknown;
  isMandatory?: unknown;
}
interface LlmMetadata {
  title?: unknown;
  description?: unknown;
  tieBreaker?: LlmTieBreaker;
}
interface LlmQuestions {
  questions?: LlmQuestion[];
}

function splitByToughness(
  count: number, toughness: number,
): Record<BundleDifficulty, number> {
  const dist = TOUGHNESS_DIST[toughness] ?? TOUGHNESS_DIST[1];
  const easy = Math.round(count * dist.easy);
  const medium = Math.round(count * dist.medium);
  const hard = Math.max(0, count - easy - medium);
  return { easy, medium, hard };
}

function asString(v: unknown, max = 1000): string {
  return String(v ?? '').slice(0, max);
}
function asStringOrNull(v: unknown, max = 1000): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).slice(0, max);
}
function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normaliseDifficulty(v: unknown): BundleDifficulty {
  const s = String(v ?? '').toLowerCase();
  if (s === 'easy' || s === 'medium' || s === 'hard') return s;
  if (s === 'med') return 'medium';
  return 'medium';
}
function normaliseType(v: unknown): BundleQuestionType {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'mcq' || s === 'true_false' || s === 'multi_select' || s === 'numeric') {
    return s;
  }
  return 'mcq';
}
function normaliseLetter(v: unknown): string | null {
  const s = String(v ?? '').toUpperCase().trim();
  if (s === 'A' || s === 'B' || s === 'C' || s === 'D') return s;
  return null;
}
function normaliseLetterSet(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const parts = String(v)
    .toUpperCase()
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter((p) => p === 'A' || p === 'B' || p === 'C' || p === 'D');
  if (parts.length === 0) return null;
  return Array.from(new Set(parts)).join(',');
}

@Injectable()
export class QuizBundleAgent {
  private readonly logger = new Logger(QuizBundleAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan)
    private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(QuizBundle)
    private readonly bundleRepo: Repository<QuizBundle>,
    @InjectRepository(QuizBundleQuestion)
    private readonly questionRepo: Repository<QuizBundleQuestion>,
    private readonly router: ModelRouterService,
    private readonly memoryService: BrandMemoryService,
  ) {}

  /** Generate (or regenerate) the bundle for a plan. Overwrites any existing. */
  async generate(planId: string, opts: {
    count?: number; toughness?: number; quizWeek?: number;
  } = {}): Promise<QuizBundle> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');
    const lessons = await this.lessonRepo.find({
      where: { planId },
      order: { lessonNumber: 'ASC' },
    });
    if (lessons.length === 0) {
      throw new BadRequestException('Plan has no lessons — nothing to quiz on');
    }
    const memories = await this.memoryService.relevantFor(brand.id, 'quiz');

    const count = Math.max(
      BUNDLE_MIN, Math.min(BUNDLE_MAX, Math.round(opts.count ?? BUNDLE_DEFAULT)),
    );
    const toughness = Math.max(
      TOUGHNESS_MIN,
      Math.min(
        TOUGHNESS_MAX,
        opts.toughness != null
          ? Math.round(opts.toughness)
          : (plan.quizToughness ?? 0) + 1,
      ),
    );
    const dist = splitByToughness(count, toughness);

    // Quiz-week is what appears in every CSV row's `quiz_week` column.
    // Explicit opt wins; otherwise fall back to the plan's series week, then 1.
    const quizWeek = Math.max(
      1, Math.min(999,
        opts.quizWeek != null
          ? Math.round(opts.quizWeek)
          : (plan.seriesWeekNumber ?? 1),
      ),
    );

    const memoryBlock = this.memoryService.format(memories);
    const lessonsBlock = lessons
      .map(
        (l) =>
          `LESSON ${l.lessonNumber}: ${l.title}\n` +
          `  hook: ${l.hook ?? '(none)'}\n` +
          (l.outline ?? [])
            .map((s) => `  - ${s.heading}: ${(s.points ?? []).join('; ')}`)
            .join('\n'),
      )
      .join('\n\n');

    const sharedContext =
      `BRAND: ${brand.name}\nVoice/style: ${brand.voiceStyle ?? ''}\n\n` +
      `WEEK THEME: ${plan.theme ?? '(none)'}\n` +
      `QUIZ SCOPE: ${plan.quizScope ?? '(none)'}\n` +
      `WEEK NUMBER: ${quizWeek}\n\n` +
      `LESSONS:\n${lessonsBlock}\n\n` +
      `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n`;

    // ── Call 1 — METADATA (title + description + tie-breaker) ────────────
    const meta = await this.router.run({
      task: 'quiz',
      agentType: 'quiz',
      planId,
      modelOverride: brand.modelOverrides?.quiz,
      jsonOutput: true,
      maxTokens: 2000,
      temperature: 0.7,
      system: META_SYSTEM,
      user:
        sharedContext +
        `The full quiz will have ${count} questions worth ` +
        `${dist.easy + dist.medium * 2 + dist.hard * 3} points total ` +
        `(difficulty split: ${dist.easy} easy / ${dist.medium} medium / ` +
        `${dist.hard} hard). Pass mark 60%. ` +
        `Output the JSON object only.`,
    });

    const parsedMeta = JSON.parse(meta.text || '{}') as LlmMetadata;
    const title = asString(parsedMeta.title, 200).trim();
    const description = asString(parsedMeta.description, 2000).trim();
    if (!title || !description) {
      throw new Error('LLM returned no title or description');
    }

    const tb = parsedMeta.tieBreaker ?? {};
    const tbQuestion = asString(tb.question, 1000).trim();
    const tbAnswer = asNumber(tb.answer);
    if (!tbQuestion || tbAnswer === null) {
      throw new Error('LLM tie-breaker missing question or numeric answer');
    }
    const tbTolerance = asNumber(tb.tolerance) ?? 0;
    const tbUnit = asStringOrNull(tb.unit, 60);

    // ── Call 2 — QUESTIONS (just the list) ───────────────────────────────
    // ~350 tokens/Q covers any shape including the optional fields. Cap at
    // 32k since Claude/Gemini support larger outputs than gpt-4o (16k).
    const questionsMaxTokens = Math.min(32000, Math.max(4000, count * 350 + 1500));

    const qs = await this.router.run({
      task: 'quiz',
      agentType: 'quiz',
      planId,
      modelOverride: brand.modelOverrides?.quiz,
      jsonOutput: true,
      maxTokens: questionsMaxTokens,
      temperature: 0.7,
      system: QUESTIONS_SYSTEM,
      user:
        sharedContext +
        `TOUGHNESS LEVEL: ${toughness}/5 — ` +
        `${toughness >= 4 ? 'expert-grade, multi-step reasoning and edge cases' : toughness >= 2 ? 'apply-and-distinguish, beyond recall' : 'foundational understanding'}.\n` +
        `TOTAL QUESTIONS: EXACTLY ${count}. ` +
        `Difficulty split: ${dist.easy} easy / ${dist.medium} medium / ${dist.hard} hard. ` +
        `Use multi_select for at most ${Math.max(1, Math.floor(count * 0.15))} questions; ` +
        `numeric for at most ${Math.max(1, Math.floor(count * 0.10))} questions. ` +
        `Output the JSON object only.`,
    });

    let parsedQs: LlmQuestions;
    try {
      parsedQs = JSON.parse(qs.text || '{}') as LlmQuestions;
    } catch (e) {
      this.logger.error(
        `Bundle question JSON parse failed (model=${qs.model}, ` +
        `len=${qs.text?.length ?? 0}): ${(e as Error).message}`,
      );
      throw new Error(
        `LLM returned unparseable JSON for ${count} questions ` +
        `(likely token-budget truncation; try a smaller count).`,
      );
    }
    const rawQs = Array.isArray(parsedQs.questions) ? parsedQs.questions : [];
    if (rawQs.length === 0) {
      throw new Error('LLM returned no bundle questions');
    }

    // Combine costs for the plan ledger + logger.
    const gen = {
      model: `${meta.model}+${qs.model}`,
      costUsd: meta.costUsd + qs.costUsd,
    };

    // Replace any prior bundle for this plan.
    await this.bundleRepo.delete({ planId });

    const bundle = await this.bundleRepo.save(
      this.bundleRepo.create({
        planId,
        brandId: brand.id,
        weekOf: plan.weekOf,
        title,
        description,
        tieBreakerQuestion: tbQuestion,
        tieBreakerAnswer: String(tbAnswer),
        tieBreakerTolerance: String(tbTolerance),
        tieBreakerUnit: tbUnit,
        questionCount: rawQs.length,
        toughness,
        quizWeek,
        generatorModel: gen.model,
        costUsd: String(gen.costUsd),
      }),
    );

    const rows = rawQs.slice(0, count).map((q, i) => {
      const qType = normaliseType(q.questionType);
      const diff = normaliseDifficulty(q.difficulty);
      const defaultPoints = POINTS_BY_DIFFICULTY[diff];
      const points =
        Number.isInteger(q.points) && Number(q.points) > 0
          ? Math.min(10, Number(q.points))
          : defaultPoints;

      const row: Partial<QuizBundleQuestion> = {
        bundleId: bundle.id,
        position: i + 1,
        questionType: qType,
        questionText: asString(q.questionText, 1000),
        optionA: null, optionB: null, optionC: null, optionD: null,
        correctAnswer: null,
        correctAnswers: null,
        correctNumber: null,
        numericTolerance: null,
        numericUnit: null,
        points,
        difficulty: diff,
        category: asStringOrNull(q.category, 300),
        isMandatory: q.isMandatory === true,
      };

      if (qType === 'mcq') {
        row.optionA = asStringOrNull(q.optionA, 300);
        row.optionB = asStringOrNull(q.optionB, 300);
        row.optionC = asStringOrNull(q.optionC, 300);
        row.optionD = asStringOrNull(q.optionD, 300);
        row.correctAnswer = normaliseLetter(q.correctAnswer) ?? 'A';
      } else if (qType === 'true_false') {
        row.optionA = 'True';
        row.optionB = 'False';
        row.correctAnswer = normaliseLetter(q.correctAnswer) ?? 'A';
      } else if (qType === 'multi_select') {
        row.optionA = asStringOrNull(q.optionA, 300);
        row.optionB = asStringOrNull(q.optionB, 300);
        row.optionC = asStringOrNull(q.optionC, 300);
        row.optionD = asStringOrNull(q.optionD, 300);
        row.correctAnswers = normaliseLetterSet(q.correctAnswers) ?? 'A';
      } else {
        // numeric
        const cn = asNumber(q.correctNumber);
        row.correctNumber = cn !== null ? String(cn) : '0';
        const nt = asNumber(q.numericTolerance) ?? 0;
        row.numericTolerance = String(nt);
        row.numericUnit = asStringOrNull(q.numericUnit, 60);
      }

      return this.questionRepo.create(row);
    });

    await this.questionRepo.save(rows);

    // Mirror the toughness on the plan (so next regen escalates).
    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + gen.costUsd,
      quizToughness: toughness,
    });

    this.logger.log(
      `Quiz bundle plan=${planId}: ${rows.length} Qs ` +
      `(asked ${count}, toughness=${toughness} ` +
      `[${dist.easy}/${dist.medium}/${dist.hard}]), ` +
      `model=${gen.model}, cost $${gen.costUsd.toFixed(4)}`,
    );

    return this.latest(planId) as Promise<QuizBundle>;
  }

  async latest(planId: string): Promise<QuizBundle | null> {
    return this.bundleRepo.findOne({
      where: { planId },
      order: { createdAt: 'DESC' },
      relations: ['questions'],
    });
  }

  /** Patch bundle metadata in place (no LLM call). */
  async patchMetadata(planId: string, patch: { quizWeek?: number }): Promise<QuizBundle> {
    const bundle = await this.latest(planId);
    if (!bundle) throw new NotFoundException('No bundle to patch');
    if (patch.quizWeek != null) {
      bundle.quizWeek = Math.max(1, Math.min(999, Math.round(patch.quizWeek)));
    }
    return this.bundleRepo.save(bundle);
  }

  async latestWithOrderedQuestions(planId: string): Promise<{
    bundle: QuizBundle | null;
    questions: QuizBundleQuestion[];
  }> {
    const bundle = await this.latest(planId);
    if (!bundle) return { bundle: null, questions: [] };
    const sorted = [...(bundle.questions ?? [])].sort(
      (a, b) => a.position - b.position,
    );
    return { bundle, questions: sorted };
  }
}
