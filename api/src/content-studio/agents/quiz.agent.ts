import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import {
  QuestionPool, QuestionDifficulty,
} from '../entities/question-pool.entity';
import { DeliveredQuiz } from '../entities/delivered-quiz.entity';
import { ModelRouterService } from '../services/model-router.service';
import { BrandMemoryService } from '../services/brand-memory.service';
import { ProviderName } from '../services/provider.types';
import {
  XlsxRendererService, XlsxVariant,
} from '../services/xlsx-renderer.service';

const QUIZ_GEN_SYSTEM = `
You write multiple-choice quiz questions for a YouTube channel's Saturday
quiz. The pool you produce is the source of truth — quality matters.

EACH question MUST have:
- "question": one clear, unambiguous prompt (≤ 220 chars).
- "options": EXACTLY 4 strings — short, distinct, plausible.
- "correctIndex": integer 0-3, the index of the single correct option.
- "difficulty": "easy" | "medium" | "hard".
- "explanation": 1-2 sentences explaining WHY the correct answer is correct.

POOL DISTRIBUTION: roughly 50% easy, 30% medium, 20% hard.

DO:
- Test understanding (apply / distinguish / reason), not trivia.
- Use real names / tools / numbers from the lessons when natural.
- Make distractors plausible but verifiably wrong.

DON'T:
- "All of the above" / "None of the above".
- Trick wording or double negatives.
- Two correct options.
- Acronyms without context.

Obey the brand voice memories verbatim.

OUTPUT STRICT JSON: {"questions":[ N objects in the exact shape above ]}
Generate EXACTLY the requested count.
`.trim();

const QUIZ_VALIDATE_SYSTEM = `
You audit a single multiple-choice question for a quiz pool.

Check, in order:
1. Is the question well-formed and unambiguous?
2. Are there exactly 4 distinct options?
3. Is the marked "correctIndex" actually the single correct answer?
4. Are distractors plausible but verifiably wrong?
5. Is the difficulty label realistic?

If invalid AND fixable with minor edits, propose a "suggested_fix" with the
same shape: {question, options(4), correctIndex, difficulty, explanation}.
Only propose a fix you are confident in. Otherwise return null for it.

OUTPUT STRICT JSON ONLY:
{
  "valid": true|false,
  "confidence": 0-100,
  "issues": ["…"],
  "suggested_fix": null | {"question":"…","options":["…","…","…","…"],"correctIndex":0,"difficulty":"easy|medium|hard","explanation":"…"}
}
`.trim();

interface QuizQ {
  question: string;
  options: string[];
  correctIndex: number;
  difficulty: QuestionDifficulty;
  explanation?: string;
}
interface GenJson { questions?: QuizQ[] }
interface ValidationJson {
  valid?: boolean;
  confidence?: number;
  issues?: string[];
  suggested_fix?: QuizQ | null;
}

const POOL_TARGET = 50;
const DRAW_QUOTA: Record<QuestionDifficulty, number> = {
  easy: 4, medium: 3, hard: 2,
};
const VALIDATION_CONCURRENCY = 5;

@Injectable()
export class QuizAgent {
  private readonly logger = new Logger(QuizAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    @InjectRepository(QuestionPool) private readonly questionRepo: Repository<QuestionPool>,
    @InjectRepository(DeliveredQuiz) private readonly deliveredRepo: Repository<DeliveredQuiz>,
    private readonly router: ModelRouterService,
    private readonly xlsx: XlsxRendererService,
    private readonly memoryService: BrandMemoryService,
  ) {}

  // ── 1) Generate + cross-provider validate the 50-Q pool ──────────────────

  async generatePool(planId: string): Promise<{
    generated: number; valid: number; invalid: number;
    passRate: number; generatorProvider: string; costUsd: number;
  }> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');
    const lessons = await this.lessonRepo.find({
      where: { planId },
      order: { lessonNumber: 'ASC' },
    });
    const memories = await this.memoryService.relevantFor(brand.id, 'quiz');

    // Reset any prior pool for this plan to keep the table tidy.
    await this.questionRepo.delete({ planId });

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

    // ── Generation ──
    const gen = await this.router.run({
      task: 'quiz',
      agentType: 'quiz',
      planId,
      modelOverride: brand.modelOverrides?.quiz,
      jsonOutput: true,
      maxTokens: 8000,
      temperature: 0.7,
      system: QUIZ_GEN_SYSTEM,
      user:
        `BRAND: ${brand.name}\nVoice/style: ${brand.voiceStyle ?? ''}\n\n` +
        `WEEK THEME: ${plan.theme ?? '(none)'}\n` +
        `QUIZ SCOPE: ${plan.quizScope ?? '(none)'}\n\n` +
        `LESSONS:\n${lessonsBlock || '(no lessons)'}\n\n` +
        `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n` +
        `Generate EXACTLY ${POOL_TARGET} questions. Output the JSON object only.`,
    });
    const generatorProvider = gen.provider as ProviderName;
    const parsed = JSON.parse(gen.text || '{}') as GenJson;
    const generated = (parsed.questions ?? [])
      .filter((q) => Array.isArray(q.options) && q.options.length === 4)
      .slice(0, POOL_TARGET);
    if (generated.length === 0) {
      throw new Error('Quiz agent returned no valid questions');
    }

    // Persist as draft
    const drafts = await this.questionRepo.save(
      generated.map((q) =>
        this.questionRepo.create({
          planId,
          brandId: brand.id,
          question: q.question.slice(0, 1000),
          options: q.options.map((o) => String(o).slice(0, 300)),
          correctIndex:
            Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4
              ? q.correctIndex
              : 0,
          difficulty: normaliseDifficulty(q.difficulty),
          explanation: q.explanation ?? null,
          status: 'draft',
        }),
      ),
    );

    // ── Cross-provider validation (in small parallel batches) ──
    const validatorOverride = brand.modelOverrides?.quiz_validator;
    let totalValidatorCost = 0;
    for (let i = 0; i < drafts.length; i += VALIDATION_CONCURRENCY) {
      const batch = drafts.slice(i, i + VALIDATION_CONCURRENCY);
      const costs = await Promise.all(
        batch.map((row) =>
          this.validateOne(row, generatorProvider, planId, validatorOverride),
        ),
      );
      totalValidatorCost += costs.reduce((s, c) => s + c, 0);
    }

    const finalRows = await this.questionRepo.find({ where: { planId } });
    const valid = finalRows.filter((r) => r.validationPassed).length;
    const invalid = finalRows.length - valid;
    const passRate = finalRows.length === 0 ? 0 : valid / finalRows.length;

    await this.planRepo.update(plan.id, {
      totalCostUsd:
        Number(plan.totalCostUsd ?? 0) + gen.costUsd + totalValidatorCost,
    });

    this.logger.log(
      `Quiz pool plan=${planId}: ${finalRows.length} generated, ` +
      `${valid} valid (${(passRate * 100).toFixed(0)}%), generator=${generatorProvider}, ` +
      `validator cost $${totalValidatorCost.toFixed(4)}, gen cost $${gen.costUsd.toFixed(4)}`,
    );
    if (passRate < 0.8) {
      this.logger.warn(
        `Pool pass rate ${(passRate * 100).toFixed(0)}% below 80% target`,
      );
    }
    return {
      generated: finalRows.length,
      valid,
      invalid,
      passRate,
      generatorProvider,
      costUsd: gen.costUsd + totalValidatorCost,
    };
  }

  private async validateOne(
    row: QuestionPool,
    generatorProvider: ProviderName,
    planId: string,
    validatorOverride?: string,
  ): Promise<number> {
    let validation: ValidationJson | null = null;
    let validatorModel = '';
    let cost = 0;
    try {
      const res = await this.router.run({
        task: 'quiz_validator',
        agentType: 'quiz',
        planId,
        excludeProvider: generatorProvider, // architectural guarantee
        modelOverride: validatorOverride,
        jsonOutput: true,
        maxTokens: 800,
        temperature: 0.1,
        system: QUIZ_VALIDATE_SYSTEM,
        user:
          `QUESTION: ${row.question}\n` +
          `OPTIONS:\n` +
          (row.options ?? []).map((o, i) => `  ${i}: ${o}`).join('\n') +
          `\nCORRECT_INDEX: ${row.correctIndex}\n` +
          `DIFFICULTY: ${row.difficulty}\n` +
          `EXPLANATION: ${row.explanation ?? '(none)'}\n\n` +
          `Audit it. JSON only.`,
      });
      validation = JSON.parse(res.text || '{}') as ValidationJson;
      validatorModel = res.model;
      cost = res.costUsd;
    } catch (e) {
      this.logger.warn(`Validator failed for Q ${row.id}: ${(e as Error).message}`);
      await this.questionRepo.update(row.id, {
        validationPassed: false,
        validatedBy: validatorModel || null,
        status: 'invalid',
      });
      return cost;
    }

    if (validation.valid) {
      await this.questionRepo.update(row.id, {
        validationPassed: true,
        validatedBy: validatorModel,
        status: 'valid',
      });
      return cost;
    }

    // Validator said invalid — apply its suggested fix if one was offered.
    // That counts as iteration #2 (initial gen + this fix). No further passes.
    const fix = validation.suggested_fix;
    if (
      fix &&
      Array.isArray(fix.options) &&
      fix.options.length === 4 &&
      Number.isInteger(fix.correctIndex) &&
      fix.correctIndex >= 0 && fix.correctIndex < 4
    ) {
      await this.questionRepo.update(row.id, {
        question: String(fix.question ?? row.question).slice(0, 1000),
        options: fix.options.map((o) => String(o).slice(0, 300)),
        correctIndex: fix.correctIndex,
        difficulty: normaliseDifficulty(fix.difficulty) ?? row.difficulty,
        explanation: fix.explanation ?? row.explanation,
        validationPassed: true,
        validatedBy: validatorModel,
        status: 'valid',
      });
    } else {
      await this.questionRepo.update(row.id, {
        validationPassed: false,
        validatedBy: validatorModel,
        status: 'invalid',
      });
    }
    return cost;
  }

  async listPool(planId: string): Promise<QuestionPool[]> {
    return this.questionRepo.find({
      where: { planId },
      order: { difficulty: 'ASC', createdAt: 'ASC' },
    });
  }

  // ── 2) Draw the 9 (4/3/2) ──────────────────────────────────────────────

  async drawSaturdayQuiz(planId: string): Promise<DeliveredQuiz> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const pool = await this.questionRepo.find({
      where: { planId, validationPassed: true },
    });
    if (pool.length < 9) {
      throw new BadRequestException(
        `Only ${pool.length} validated questions in pool — need at least 9 to draw a quiz`,
      );
    }

    const byDiff: Record<QuestionDifficulty, QuestionPool[]> = {
      easy: shuffle(pool.filter((q) => q.difficulty === 'easy')),
      medium: shuffle(pool.filter((q) => q.difficulty === 'medium')),
      hard: shuffle(pool.filter((q) => q.difficulty === 'hard')),
    };

    const picked: QuestionPool[] = [];
    const overflow: QuestionPool[] = [];
    (Object.keys(DRAW_QUOTA) as QuestionDifficulty[]).forEach((diff) => {
      const want = DRAW_QUOTA[diff];
      const got = byDiff[diff].splice(0, want);
      picked.push(...got);
      overflow.push(...byDiff[diff]);
    });
    // Top up from overflow if a tier was short
    while (picked.length < 9 && overflow.length > 0) {
      picked.push(overflow.shift() as QuestionPool);
    }
    if (picked.length < 9) {
      throw new BadRequestException(
        `Could not assemble 9 questions (got ${picked.length}). Regenerate the pool.`,
      );
    }

    // Mark drawn
    await this.questionRepo.update(
      { id: In(picked.map((q) => q.id)) },
      { status: 'drawn' },
    );

    const delivered = await this.deliveredRepo.save(
      this.deliveredRepo.create({
        planId,
        brandId: plan.brandId,
        weekOf: plan.weekOf,
        questionIds: picked.map((q) => q.id),
      }),
    );
    this.logger.log(
      `Drew Saturday quiz for plan ${planId}: ${picked.length} questions`,
    );
    return delivered;
  }

  async latestDelivered(planId: string): Promise<{
    delivered: DeliveredQuiz | null; questions: QuestionPool[];
  }> {
    const delivered = await this.deliveredRepo.findOne({
      where: { planId },
      order: { createdAt: 'DESC' },
    });
    if (!delivered) return { delivered: null, questions: [] };
    const rows = await this.questionRepo.find({
      where: { id: In(delivered.questionIds) },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = delivered.questionIds
      .map((id) => byId.get(id))
      .filter((q): q is QuestionPool => !!q);
    return { delivered, questions: ordered };
  }

  // ── 3) Render the XLSX for the latest delivered quiz ───────────────────

  async renderLatestXlsx(
    planId: string,
    variant: XlsxVariant,
  ): Promise<{ buf: Buffer; filename: string }> {
    const { delivered, questions } = await this.latestDelivered(planId);
    if (!delivered || questions.length === 0) {
      throw new NotFoundException('No Saturday quiz drawn yet for this plan');
    }
    const brand = await this.brandRepo.findOne({ where: { id: delivered.brandId } });
    if (!brand) throw new BadRequestException('Brand vanished');

    const buf = await this.xlsx.render(questions, {
      variant,
      brandName: brand.name,
      primary: brand.colorPrimary,
      weekOf: String(delivered.weekOf),
    });
    const filename = `quiz-${variant}-${delivered.weekOf}.xlsx`;
    return { buf, filename };
  }
}

function normaliseDifficulty(d: unknown): QuestionDifficulty | null {
  const v = String(d ?? '').toLowerCase();
  if (v === 'easy' || v === 'medium' || v === 'hard') return v;
  if (v === 'med') return 'medium';
  return null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
