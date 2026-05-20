import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import { LessonMetrics } from '../entities/lesson-metrics.entity';
import {
  LessonPostmortem, PostmortemContent,
} from '../entities/lesson-postmortem.entity';
import { ModelRouterService } from '../services/model-router.service';

const SYSTEM = `
You are a YouTube performance critic. Given one lesson's content, the
brand's voice, and the latest YouTube metrics for that lesson, write a
clear, blame-free postmortem aimed at making the NEXT lesson better.

Output STRICT JSON ONLY:
{
  "worked": ["concrete things that worked, ideally tied to a metric or moment in the script"],
  "didntWork": ["concrete failure modes — be specific, no vague 'engagement was low'"],
  "next": ["1-3 specific changes to try next time (hook tweaks, structural moves, topic angles)"],
  "reusableHookPattern": "<one sentence describing the hook style if this performed above average; null otherwise>"
}

Rules:
- 2–5 items per array, each ≤ 220 chars.
- Anchor every claim to a fact (a metric, a brand memory, a line of the script).
- "reusableHookPattern" only if confidence is high — otherwise leave null.
`.trim();

@Injectable()
export class PostmortemAgent {
  private readonly logger = new Logger(PostmortemAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    @InjectRepository(LessonMetrics) private readonly metricsRepo: Repository<LessonMetrics>,
    @InjectRepository(LessonPostmortem) private readonly postmortemRepo: Repository<LessonPostmortem>,
    private readonly router: ModelRouterService,
  ) {}

  async generateFor(lessonId: string): Promise<LessonPostmortem> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const script = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
    const metrics = await this.metricsRepo.findOne({
      where: { lessonId },
      order: { fetchedAt: 'DESC' },
    });

    const scriptText =
      (script?.content as { fullScript?: string } | null | undefined)
        ?.fullScript ?? '';
    const metricsBlock = metrics
      ? `Views: ${metrics.views ?? 'n/a'}\n` +
        `Likes: ${metrics.likes ?? 'n/a'}\n` +
        `Comments: ${metrics.comments ?? 'n/a'}\n` +
        (metrics.ctr != null ? `CTR: ${(Number(metrics.ctr) * 100).toFixed(2)}%\n` : '') +
        (metrics.avgViewDurationSec != null ? `Avg view: ${metrics.avgViewDurationSec}s\n` : '') +
        (metrics.retentionPct != null ? `Retention: ${metrics.retentionPct}%\n` : '') +
        (metrics.subscribersGained != null ? `Subscribers gained: ${metrics.subscribersGained}\n` : '')
      : '(no metrics fetched yet — base the postmortem on the script + brand voice)';

    const result = await this.router.run({
      task: 'grader',           // reuse grader timeout/budget; gpt-4o-mini by default
      agentType: 'strategy',    // any agentType; used only for cost ledger
      planId: plan.id,
      lessonId: lesson.id,
      jsonOutput: true,
      maxTokens: 1500,
      temperature: 0.3,
      system: SYSTEM,
      user:
        `BRAND: ${brand.name}\nBrand voice: ${brand.voiceStyle ?? ''}\n\n` +
        `LESSON ${lesson.lessonNumber}: ${lesson.title}\n` +
        `Hook: ${lesson.hook ?? '(none)'}\n\n` +
        `METRICS:\n${metricsBlock}\n\n` +
        (scriptText ? `SCRIPT (excerpts allowed):\n${scriptText.slice(0, 8000)}\n\n` : '') +
        `Write the postmortem JSON only.`,
    });

    let parsed: PostmortemContent;
    try {
      const p = JSON.parse(result.text || '{}') as Partial<PostmortemContent>;
      parsed = {
        worked: (p.worked ?? []).slice(0, 5).map((s) => String(s).slice(0, 240)),
        didntWork: (p.didntWork ?? []).slice(0, 5).map((s) => String(s).slice(0, 240)),
        next: (p.next ?? []).slice(0, 5).map((s) => String(s).slice(0, 240)),
        reusableHookPattern: p.reusableHookPattern
          ? String(p.reusableHookPattern).slice(0, 280)
          : undefined,
      };
    } catch (e) {
      this.logger.warn(`Postmortem JSON parse failed: ${(e as Error).message}`);
      parsed = { worked: [], didntWork: [], next: [] };
    }

    const saved = await this.postmortemRepo.save(
      this.postmortemRepo.create({
        lessonId,
        content: parsed,
        modelUsed: result.model,
        costUsd: result.costUsd,
      }),
    );
    this.logger.log(
      `Postmortem for lesson "${lesson.title}" — ` +
      `${parsed.worked.length}/${parsed.didntWork.length}/${parsed.next.length} ` +
      `(worked/didnt/next) · $${result.costUsd.toFixed(4)}`,
    );
    return saved;
  }

  latestFor(lessonId: string): Promise<LessonPostmortem | null> {
    return this.postmortemRepo.findOne({
      where: { lessonId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Daily cron entry point. Finds published lessons that:
   *   • have been live for ≥ 7 days, AND
   *   • have ≥1 metric row (so the postmortem has data to anchor on), AND
   *   • have no postmortem yet (idempotent — never re-writes a postmortem).
   * Generates a postmortem for each. Sequential to be polite on LLM quotas.
   */
  async runDailyBatch(): Promise<{ scanned: number; generated: number }> {
    const rows: Array<{ lessonId: string }> = await this.lessonRepo.query(`
      SELECT l.id AS "lessonId"
        FROM cs_published_videos pv
        JOIN cs_lessons l ON l.id = pv."lessonId"
       WHERE pv."publishedAt" IS NOT NULL
         AND pv."publishedAt" < NOW() - INTERVAL '7 days'
         AND EXISTS (
           SELECT 1 FROM cs_lesson_metrics lm WHERE lm."lessonId" = l.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM cs_lesson_postmortems pm WHERE pm."lessonId" = l.id
         )
       ORDER BY pv."publishedAt" ASC
       LIMIT 50
    `);
    if (rows.length === 0) {
      this.logger.log('Postmortem batch — nothing eligible');
      return { scanned: 0, generated: 0 };
    }
    let generated = 0;
    for (const r of rows) {
      try {
        await this.generateFor(r.lessonId);
        generated++;
      } catch (e) {
        this.logger.warn(
          `Postmortem batch — lesson ${r.lessonId} failed: ${(e as Error).message}`,
        );
      }
    }
    this.logger.log(
      `Postmortem batch — ${generated}/${rows.length} written`,
    );
    return { scanned: rows.length, generated };
  }
}
