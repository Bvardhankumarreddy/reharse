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

const BUNDLE_SYSTEM = `
You generate a complete weekly quiz BUNDLE for upload into an LMS-style Quiz
Module. Quality matters — these questions are graded and shown to learners.

The bundle has FOUR sections:

1) TITLE — short, brandable headline for the quiz. ≤ 80 chars.
2) DESCRIPTION — 3-5 lines, plain prose: what the quiz covers (lesson titles),
   how many questions / points / minutes, the pass mark, what the tie-breaker
   does. No emoji except where natural.
3) TIE_BREAKER — ONE numeric question. The answer must be a SPECIFIC verifiable
   fact pulled from the lessons (a number, a year, a count, a dollar amount).
   Avoid "estimate"-style questions; tolerance should be 0 so closest-guess
   wins. Mark it as the bundle's mandatory tie-breaker.
4) QUESTIONS — EXACTLY the requested count, with the requested difficulty split.

For each question in (4), choose the BEST type for the concept:
  • "mcq"          → 4 distinct options, one correct (letter A-D).
  • "true_false"   → option_a "True", option_b "False", correctAnswer "A" or "B".
  • "multi_select" → 4 options, 2-3 correct (e.g. correctAnswers "A,C,D").
                     Use SPARINGLY (≤ 15% of questions).
  • "numeric"      → no options; a specific verifiable number + sensible
                     tolerance + unit. Use SPARINGLY (≤ 10% of questions).

Rules for ALL questions:
- Test understanding (apply / distinguish / reason), not trivia.
- Use real names / tools / numbers from the lessons when natural.
- Distractors must be plausible but verifiably wrong.
- NO "all of the above" / "none of the above".
- NO trick wording or double negatives.
- Acronyms must be expanded on first use.

Points per question (the Quiz Module scores by summing these):
  easy: 1, medium: 2, hard: 3.

Each question carries a "category" — use the lesson title it belongs to.

OUTPUT STRICT JSON ONLY:
{
  "title": "…",
  "description": "…",
  "tieBreaker": {
    "question": "…",
    "answer": <number>,
    "tolerance": <number>,
    "unit": "…"
  },
  "questions": [
    {
      "questionType": "mcq" | "true_false" | "multi_select" | "numeric",
      "questionText": "…",
      "optionA": "…" | null,
      "optionB": "…" | null,
      "optionC": "…" | null,
      "optionD": "…" | null,
      "correctAnswer": "A" | "B" | "C" | "D" | null,
      "correctAnswers": "A,B,C" | null,
      "correctNumber": <number> | null,
      "numericTolerance": <number> | null,
      "numericUnit": "…" | null,
      "points": <int>,
      "difficulty": "easy" | "medium" | "hard",
      "category": "…",
      "isMandatory": false
    }
    // … exactly N objects in this shape
  ]
}
Honour the requested difficulty split EXACTLY. Output the JSON object only.
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
interface LlmBundle {
  title?: unknown;
  description?: unknown;
  tieBreaker?: LlmTieBreaker;
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
    count?: number; toughness?: number;
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

    // ~210 output tokens/Q is roomy enough for any of the four shapes + the
    // header block (title + description + tie-breaker). Single call.
    const maxTokens = Math.min(16000, Math.max(3000, count * 210 + 800));

    const gen = await this.router.run({
      task: 'quiz',
      agentType: 'quiz',
      planId,
      modelOverride: brand.modelOverrides?.quiz,
      jsonOutput: true,
      maxTokens,
      temperature: 0.7,
      system: BUNDLE_SYSTEM,
      user:
        `BRAND: ${brand.name}\nVoice/style: ${brand.voiceStyle ?? ''}\n\n` +
        `WEEK THEME: ${plan.theme ?? '(none)'}\n` +
        `QUIZ SCOPE: ${plan.quizScope ?? '(none)'}\n` +
        `WEEK NUMBER (for title): ${plan.seriesWeekNumber ?? '(standalone)'}\n\n` +
        `LESSONS:\n${lessonsBlock}\n\n` +
        `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n` +
        `TOUGHNESS LEVEL: ${toughness}/5 — ` +
        `${toughness >= 4 ? 'expert-grade, multi-step reasoning and edge cases' : toughness >= 2 ? 'apply-and-distinguish, beyond recall' : 'foundational understanding'}.\n` +
        `TOTAL QUESTIONS: ${count}. ` +
        `Difficulty split: ${dist.easy} easy / ${dist.medium} medium / ${dist.hard} hard. ` +
        `Points by difficulty: easy=1, medium=2, hard=3. ` +
        `Use multi_select for at most ${Math.max(1, Math.floor(count * 0.15))} questions; ` +
        `numeric for at most ${Math.max(1, Math.floor(count * 0.10))} questions. ` +
        `The tie-breaker is separate from those ${count} questions — do not count it. ` +
        `Output the JSON object only.`,
    });

    const parsed = JSON.parse(gen.text || '{}') as LlmBundle;
    const title = asString(parsed.title, 200).trim();
    const description = asString(parsed.description, 2000).trim();
    if (!title || !description) {
      throw new Error('LLM returned no title or description');
    }

    const tb = parsed.tieBreaker ?? {};
    const tbQuestion = asString(tb.question, 1000).trim();
    const tbAnswer = asNumber(tb.answer);
    if (!tbQuestion || tbAnswer === null) {
      throw new Error('LLM tie-breaker missing question or numeric answer');
    }
    const tbTolerance = asNumber(tb.tolerance) ?? 0;
    const tbUnit = asStringOrNull(tb.unit, 60);

    const rawQs = Array.isArray(parsed.questions) ? parsed.questions : [];
    if (rawQs.length === 0) {
      throw new Error('LLM returned no bundle questions');
    }

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
