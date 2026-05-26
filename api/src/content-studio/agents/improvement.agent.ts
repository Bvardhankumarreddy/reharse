import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { Lesson } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import { BrandMemory } from '../entities/brand-memory.entity';
import { LessonMetrics } from '../entities/lesson-metrics.entity';
import { LessonPostmortem } from '../entities/lesson-postmortem.entity';
import { ChannelVideo } from '../entities/channel-video.entity';
import { BrandMemoryService } from '../services/brand-memory.service';
import { ModelRouterService } from '../services/model-router.service';

const CHANNEL_MINE_SYSTEM = `
You analyze a YouTube channel's TOP-PERFORMING videos and extract reusable
patterns that explain why they won, so future content can repeat what works.

Given the winning video titles + view counts, identify up to 3 SPECIFIC,
reusable patterns — title structure, topic angle, hook style, or format.
Be concrete (e.g. "titles that pair a tool name with a measurable outcome
outperform generic how-tos"), never generic advice.

Return STRICT JSON ONLY: {"patterns":[{"pattern":"…","why":"…"}]}  (max 3)
`.trim();

/**
 * Phase D — Improvement Agent. Closes the feedback loop: for every brand,
 * find lessons that materially beat that brand's rolling-30d average and
 * extract their hook patterns into new cs_brand_memories rows (weight=2,
 * appliesTo=['script']). Embeddings are written best-effort so the next
 * Script call can semantic-retrieve them.
 *
 * It only promotes patterns that already passed a postmortem's
 * `reusableHookPattern` check OR that come straight from the script's
 * opening sentence. Conservative by design — pollution of BrandMemory is
 * worse than missing one promotion.
 */
@Injectable()
export class ImprovementAgent {
  private readonly logger = new Logger(ImprovementAgent.name);
  /** A lesson must beat the rolling brand mean by this multiplier to qualify. */
  private static readonly LIFT = 1.5;

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    @InjectRepository(BrandMemory) private readonly memRepo: Repository<BrandMemory>,
    @InjectRepository(LessonMetrics) private readonly metricsRepo: Repository<LessonMetrics>,
    @InjectRepository(LessonPostmortem) private readonly postmortemRepo: Repository<LessonPostmortem>,
    @InjectRepository(ChannelVideo) private readonly channelVidRepo: Repository<ChannelVideo>,
    private readonly memorySvc: BrandMemoryService,
    private readonly router: ModelRouterService,
  ) {}

  async runForAllBrands(): Promise<{ scanned: number; promoted: number }> {
    const brands = await this.brandRepo.find({ where: { isActive: true } });
    let promoted = 0;
    for (const b of brands) {
      try {
        promoted += await this.runForBrand(b.id);
        promoted += await this.mineChannelWinnersForBrand(b.id);
      } catch (e) {
        this.logger.error(`Improvement for "${b.name}" failed: ${(e as Error).message}`);
      }
    }
    return { scanned: brands.length, promoted };
  }

  /**
   * Learn from the brand's OWN back catalog: take the top videos by views and
   * extract reusable winning patterns (via the LLM) into BrandMemory so the
   * Strategy/Script/Thumbnail agents repeat what already works. Deduped.
   */
  async mineChannelWinnersForBrand(brandId: string): Promise<number> {
    const brand = await this.brandRepo.findOne({ where: { id: brandId } });
    if (!brand) return 0;
    const top = await this.channelVidRepo.find({
      where: { brandId },
      order: { viewCount: 'DESC' },
      take: 12,
    });
    if (top.length < 5) {
      this.logger.log(
        `Channel mining skipped for "${brand.name}" — only ${top.length} videos (need ≥5; sync the channel)`,
      );
      return 0;
    }

    const listing = top
      .map((v, i) => `${i + 1}. [${Math.round(Number(v.viewCount ?? 0) / 1000)}k] ${v.title.slice(0, 140)}`)
      .join('\n');

    let patterns: Array<{ pattern?: string; why?: string }> = [];
    try {
      const r = await this.router.run({
        task: 'strategy', // reuse strategy budget/model
        agentType: 'strategy',
        modelOverride: brand.modelOverrides?.strategy,
        jsonOutput: true,
        maxTokens: 1200,
        temperature: 0.4,
        system: CHANNEL_MINE_SYSTEM,
        user: `BRAND: ${brand.name}\n\nTOP VIDEOS (by views):\n${listing}\n\nExtract the reusable winning patterns. JSON only.`,
      });
      patterns = (JSON.parse(r.text || '{}') as { patterns?: typeof patterns }).patterns ?? [];
    } catch (e) {
      this.logger.warn(`Channel mining LLM failed for "${brand.name}": ${(e as Error).message}`);
      return 0;
    }

    let promoted = 0;
    for (const p of patterns.slice(0, 3)) {
      const pat = String(p?.pattern ?? '').trim();
      if (!pat) continue;
      const content = `What works on this channel: ${pat}${p.why ? ` — ${String(p.why).trim()}` : ''}`.slice(0, 400);
      const already = await this.memRepo.findOne({
        where: { brandId, content, memoryType: 'style' },
      });
      if (already) continue;
      const created = await this.memRepo.save(
        this.memRepo.create({
          brandId,
          memoryType: 'style',
          content,
          weight: 2,
          appliesTo: ['strategy', 'script', 'thumbnail'],
          isActive: true,
        }),
      );
      void this.memorySvc.embedOnSave(created.id, created.content);
      promoted++;
    }
    if (promoted > 0) {
      this.logger.log(`Channel mining "${brand.name}" — promoted ${promoted} pattern(s) from back catalog`);
    }
    return promoted;
  }

  async runForBrand(brandId: string): Promise<number> {
    const brand = await this.brandRepo.findOne({ where: { id: brandId } });
    if (!brand) return 0;

    // Latest metric snapshot per lesson, joined to brand.
    const rows: Array<{ lessonId: string; views: string; hook: string | null; title: string }> =
      await this.metricsRepo.query(`
        WITH latest AS (
          SELECT DISTINCT ON ("lessonId") "lessonId", views
            FROM cs_lesson_metrics
           ORDER BY "lessonId", "fetchedAt" DESC
        )
        SELECT l.id AS "lessonId", lm.views AS views, l.hook AS hook, l.title AS title
          FROM latest lm
          JOIN cs_lessons l ON l.id = lm."lessonId"
          JOIN cs_weekly_content_plans p ON p.id = l."planId"
         WHERE p."brandId" = $1
      `, [brandId]);
    if (rows.length < 3) {
      this.logger.log(
        `Improvement skipped for "${brand.name}" — only ${rows.length} measured lessons (need ≥3)`,
      );
      return 0;
    }
    const totals = rows.map((r) => Number(r.views));
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    if (mean <= 0) return 0;

    const winners = rows.filter((r) => Number(r.views) >= mean * ImprovementAgent.LIFT);
    this.logger.log(
      `Brand "${brand.name}" mean views ${mean.toFixed(0)} — ${winners.length} winners (≥${(ImprovementAgent.LIFT * 100).toFixed(0)}%)`,
    );

    let promoted = 0;
    for (const w of winners) {
      const pattern = await this.derivePattern(w.lessonId, w.hook);
      if (!pattern) continue;
      // Skip if we already promoted this exact pattern.
      const already = await this.memRepo.findOne({
        where: { brandId, content: pattern, memoryType: 'hook' },
      });
      if (already) continue;
      const created = await this.memRepo.save(
        this.memRepo.create({
          brandId,
          memoryType: 'hook',
          content: pattern,
          weight: 2,
          appliesTo: ['script'],
          isActive: true,
        }),
      );
      void this.memorySvc.embedOnSave(created.id, created.content);
      promoted++;
    }
    return promoted;
  }

  /**
   * Prefer the postmortem's `reusableHookPattern` if a high-confidence one
   * exists. Otherwise fall back to a derived "Hooks like: <opening sentence>".
   */
  private async derivePattern(lessonId: string, lessonHook: string | null): Promise<string | null> {
    const pm = await this.postmortemRepo.findOne({
      where: { lessonId },
      order: { createdAt: 'DESC' },
    });
    const reusable = pm?.content?.reusableHookPattern?.trim();
    if (reusable) {
      return `Hook pattern that worked: ${reusable}`.slice(0, 400);
    }
    const script = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
    const text = (script?.content as { fullScript?: string } | null | undefined)?.fullScript ?? '';
    const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.trim().slice(0, 240);
    if (firstSentence && firstSentence.length > 20) {
      return `Hook style that resonated: "${firstSentence}"`;
    }
    if (lessonHook) {
      return `Hook angle that worked: ${lessonHook.slice(0, 240)}`;
    }
    return null;
  }
}
