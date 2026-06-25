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

const SEO_MINE_SYSTEM = `
You analyze the TITLE + TAGS that shipped on a channel's BEST-PERFORMING
lessons (≥1.5x mean views) and extract reusable SEO patterns the next
SEO agent run should repeat.

Two output sections:
- title_patterns: up to 3 specific reusable title-structure rules.
  Be concrete (e.g. "titles that name a tool + a measurable outcome").
- tag_patterns: up to 3 specific reusable tagging rules.
  Be concrete (e.g. "always include the brand-name tag + 2-3 long-tail
  problem-phrasing tags"). Never generic advice.

Return STRICT JSON ONLY:
{
  "title_patterns": [{"pattern":"…","why":"…"}],
  "tag_patterns":   [{"pattern":"…","why":"…"}]
}
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
        promoted += await this.mineSeoPatternsForBrand(b.id);
        promoted += await this.mineScenePatternsForBrand(b.id);
        promoted += await this.mineEditPatternsForBrand(b.id);
      } catch (e) {
        this.logger.error(`Improvement for "${b.name}" failed: ${(e as Error).message}`);
      }
    }
    return { scanned: brands.length, promoted };
  }

  /**
   * Mine title + description edit patterns from this brand's winning
   * lessons. For each winner with a non-trivial diff between the
   * LLM-drafted SEO title/description and the live YouTube snippet,
   * ask the LLM to extract 1-3 reusable editorial rules. Per brand.
   *
   * Memory flows back into next script + seo agents via
   * brand-memory.relevantFor(brandId, 'script' | 'seo').
   *
   * Signal floor: needs ≥3 scored lessons (same as runForBrand). Skips
   * winners where curator made no edits (no signal). Soft-fails per
   * winner so a bad LLM call doesn't blow the sweep. ~$0.005/winner.
   */
  async mineEditPatternsForBrand(brandId: string): Promise<number> {
    const brand = await this.brandRepo.findOne({ where: { id: brandId } });
    if (!brand) return 0;

    // Winners = lessons with views ≥ 1.5× brand mean, that ALSO have
    // both a live snippet AND an SEO asset to diff against.
    const rows: Array<{
      lessonId: string;
      liveTitle: string | null;
      liveDesc:  string | null;
    }> = await this.lessonRepo.query(`
      WITH latest_metric AS (
        SELECT DISTINCT ON ("lessonId") "lessonId", views
          FROM cs_lesson_metrics
         ORDER BY "lessonId", "fetchedAt" DESC
      ),
      brand_lessons AS (
        SELECT l.id AS "lessonId", lm.views,
               l."liveYoutubeTitle"       AS "liveTitle",
               l."liveYoutubeDescription" AS "liveDesc"
          FROM latest_metric lm
          JOIN cs_lessons l ON l.id = lm."lessonId"
          JOIN cs_weekly_content_plans p ON p.id = l."planId"
         WHERE p."brandId" = $1
           AND l."liveYoutubeTitle" IS NOT NULL
      ),
      stats AS (
        SELECT AVG(views) AS mean FROM brand_lessons
      )
      SELECT "lessonId", "liveTitle", "liveDesc"
        FROM brand_lessons, stats
       WHERE views >= 1.5 * stats.mean
    `, [brandId]);

    if (rows.length === 0) {
      this.logger.log(
        `Edit-pattern mining skipped for "${brand.name}" — 0 scored ` +
        `winners with live snippet`,
      );
      return 0;
    }

    let promoted = 0;
    const seen = new Set<string>();

    for (const r of rows) {
      // Fetch the LATEST SEO asset for this lesson — that's the LLM
      // draft we diff against. SEO asset content shape:
      // { titles: string[], chosenTitle: string, description: string, ... }
      const seo = await this.assetRepo.findOne({
        where: { lessonId: r.lessonId, assetType: 'seo' },
        order: { version: 'DESC' },
      });
      const seoContent = (seo?.content ?? {}) as {
        chosenTitle?: string;
        title?: string;
        description?: string;
      };
      const llmTitle = (seoContent.chosenTitle ?? seoContent.title ?? '').trim();
      const llmDesc  = (seoContent.description ?? '').trim();
      const liveTitle = (r.liveTitle ?? '').trim();
      const liveDesc  = (r.liveDesc  ?? '').trim();

      const titleHasDiff = llmTitle && liveTitle && llmTitle !== liveTitle;
      const descHasDiff  = llmDesc  && liveDesc  && llmDesc  !== liveDesc;
      if (!titleHasDiff && !descHasDiff) continue;

      const titleNoise = titleHasDiff && normForCompareCs(llmTitle) === normForCompareCs(liveTitle);
      const descNoise  = descHasDiff  && normForCompareCs(llmDesc)  === normForCompareCs(liveDesc);
      if ((!titleHasDiff || titleNoise) && (!descHasDiff || descNoise)) continue;

      try {
        const rules = await this.summariseEditDiff({
          llmTitle, liveTitle, llmDesc, liveDesc,
        });
        for (const text of rules) {
          const key = normForCompareCs(text);
          if (seen.has(key)) continue;
          seen.add(key);
          // Dedup against existing memories.
          const exists = await this.memRepo.findOne({
            where: { brandId, memoryType: 'edit_pattern', content: text },
          });
          if (exists) continue;
          const created = await this.memRepo.save(
            this.memRepo.create({
              brandId,
              memoryType: 'edit_pattern',
              content: text,
              weight: 2,
              appliesTo: ['script', 'seo'],
              isActive: true,
            }),
          );
          void this.memorySvc.embedOnSave(created.id, created.content);
          promoted++;
        }
      } catch (e) {
        this.logger.warn(
          `Edit-pattern mining for lesson ${r.lessonId} (${brand.name}) failed: ${(e as Error).message}`,
        );
      }
    }
    if (promoted > 0) {
      this.logger.log(
        `Edit-pattern mining for "${brand.name}" — promoted ${promoted} rule(s) ` +
        `from ${rows.length} winner(s)`,
      );
    }
    return promoted;
  }

  /** One LLM call per winner — model-router-routed, brand override-aware. */
  private async summariseEditDiff(opts: {
    llmTitle: string; liveTitle: string;
    llmDesc:  string; liveDesc:  string;
  }): Promise<string[]> {
    const system =
      `You analyse the diff between LLM-drafted copy and the human-edited ` +
      `version a curator actually published on YouTube. Your job: extract ` +
      `1-3 REUSABLE editorial rules describing WHAT THE HUMAN consistently ` +
      `changes. Specific (next LLM draft can apply it), not vague. ` +
      `\n\nReply with strict JSON only:\n` +
      `{"rules":[{"text":"<one-sentence reusable rule>","confidence":"high|medium|low"}]}\n\n` +
      `Skip "low" confidence rules. If edits look like random/noise, return {"rules":[]}.`;
    const user =
      `TITLE\n` +
      `LLM draft:    ${opts.llmTitle || '(none)'}\n` +
      `Human edited: ${opts.liveTitle || '(unchanged)'}\n\n` +
      `DESCRIPTION (first 500 chars)\n` +
      `LLM draft:    ${(opts.llmDesc ?? '').slice(0, 500) || '(none)'}\n` +
      `Human edited: ${(opts.liveDesc ?? '').slice(0, 500) || '(unchanged)'}\n\n` +
      `Extract editorial rules. JSON only.`;

    const r = await this.router.run({
      task: 'grader',         // cheap path — same as postmortem uses
      agentType: 'seo',       // for cost ledger; no functional effect
      jsonOutput: true,
      maxTokens: 400,
      temperature: 0.3,
      system,
      user,
    });
    const parsed = JSON.parse(r.text || '{"rules":[]}') as {
      rules?: Array<{ text?: string; confidence?: string }>;
    };
    return (parsed.rules ?? [])
      .filter((x) => x.text && x.confidence !== 'low')
      .map((x) => String(x.text).trim())
      .filter((t) => t.length > 12 && t.length < 280);
  }

  /**
   * Mine cinematic scene patterns from this brand's winning lessons.
   * Reads postmortems that have scene-aware fields (only present when the
   * lesson had scenes generated), aggregates them across winners, and
   * promotes them as 'scene_pattern' memories on this brand.
   *
   * Signal floor: needs ≥3 scene-enabled winners — below that, patterns
   * are too noisy. Each pattern only promotes when seen in ≥2 winners.
   * Idempotent (BrandMemory(brandId,memoryType,content) is the natural
   * dedup key — we skip if a matching memory already exists).
   */
  async mineScenePatternsForBrand(brandId: string): Promise<number> {
    const brand = await this.brandRepo.findOne({ where: { id: brandId } });
    if (!brand) return 0;

    // Pull postmortems for this brand's winning scene-enabled lessons.
    // Winner = views ≥ 1.5× rolling mean (same lift used elsewhere).
    const rows: Array<{ postmortemId: string }> = await this.postmortemRepo.query(`
      WITH latest_metric AS (
        SELECT DISTINCT ON ("lessonId") "lessonId", views
          FROM cs_lesson_metrics
         ORDER BY "lessonId", "fetchedAt" DESC
      ),
      brand_lessons AS (
        SELECT l.id AS "lessonId", lm.views, l.scenes
          FROM latest_metric lm
          JOIN cs_lessons l ON l.id = lm."lessonId"
          JOIN cs_weekly_content_plans p ON p.id = l."planId"
         WHERE p."brandId" = $1
           AND l.scenes IS NOT NULL
      ),
      stats AS (
        SELECT AVG(views) AS mean FROM brand_lessons
      )
      SELECT pm.id AS "postmortemId"
        FROM cs_lesson_postmortems pm
        JOIN brand_lessons bl ON bl."lessonId" = pm."lessonId"
       WHERE bl.views >= 1.5 * (SELECT mean FROM stats)
    `, [brandId]);
    if (rows.length < 3) {
      this.logger.log(
        `Scene-pattern mining skipped for "${brand.name}" — ` +
        `${rows.length} scene-enabled winner postmortem(s) (need ≥3)`,
      );
      return 0;
    }
    const postmortems = await this.postmortemRepo.findByIds(rows.map((r) => r.postmortemId));
    const contents = postmortems.map((p) => p.content ?? {}) as Array<
      Partial<{
        sceneCount: number;
        openingShotType: string;
        moodArc: string;
        characterCount: number;
        scenePattern: string;
        bestPerformingChapter: string;
      }>
    >;

    let promoted = 0;
    const promote = async (content: string): Promise<void> => {
      const exists = await this.memRepo.findOne({
        where: { brandId, memoryType: 'scene_pattern', content },
      });
      if (exists) return;
      const created = await this.memRepo.save(
        this.memRepo.create({
          brandId,
          memoryType: 'scene_pattern',
          content,
          weight: 2,
          appliesTo: ['scene'],
          isActive: true,
        }),
      );
      void this.memorySvc.embedOnSave(created.id, created.content);
      promoted++;
    };

    // a) Scene count band
    const buckets = tallyStrings(
      contents.map((c) => sceneBucket(Number(c.sceneCount ?? 0))).filter((b): b is string => !!b),
    );
    const topBucket = sortedTopKey(buckets);
    if (topBucket && buckets[topBucket] >= 2) {
      await promote(
        `Scene count that wins on this brand: ${topBucket} scenes ` +
        `(${buckets[topBucket]} of ${postmortems.length} winners).`,
      );
    }

    // b) Opening shot type
    const openings = tallyStrings(
      contents.map((c) => (c.openingShotType ?? '').trim().toLowerCase()).filter((s): s is string => !!s && s.length > 2),
    );
    const topOpening = sortedTopKey(openings);
    if (topOpening && openings[topOpening] >= 2) {
      await promote(
        `Opening shot that wins: "${topOpening}" ` +
        `(${openings[topOpening]} of ${postmortems.length} winners). ` +
        `Lead the cold open with this shot type.`,
      );
    }

    // c) Mood arc tokens
    const allMoods = contents
      .flatMap((c) => (c.moodArc ?? '').split(',').map((m) => m.trim().toLowerCase()))
      .filter((m) => m && m.length > 2);
    const moodCounts = tallyStrings(allMoods);
    const topMoods = Object.entries(moodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .filter(([, n]) => n >= 2)
      .map(([t, n]) => `${t} (${n}×)`);
    if (topMoods.length > 0) {
      await promote(`Mood tokens correlated with wins: ${topMoods.join(', ')}.`);
    }

    // d) Character count bucket
    const charBuckets = tallyStrings(
      contents.map((c) => characterBucket(Number(c.characterCount ?? 0))).filter((b): b is string => !!b),
    );
    const topChar = sortedTopKey(charBuckets);
    if (topChar && charBuckets[topChar] >= 2) {
      await promote(
        `Character count that wins: ${topChar} characters ` +
        `(${charBuckets[topChar]} of ${postmortems.length} winners).`,
      );
    }

    // e) Distinct 1-line scenePattern observations
    const notes = Array.from(new Set(
      contents.map((c) => (c.scenePattern ?? '').trim()).filter((s): s is string => !!s && s.length > 12),
    )).slice(0, 5);
    for (const n of notes) {
      await promote(`Scene observation from a winner: ${n}`);
    }

    this.logger.log(
      `Scene-pattern mining for "${brand.name}" — promoted ${promoted} from ` +
      `${postmortems.length} winner(s)`,
    );
    return promoted;
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
   * Mine title + tag patterns from the brand's OWN winning lessons.
   * Pulls the SEO asset that actually shipped on each winner, extracts
   * reusable rules via the LLM, and inserts memories scoped to 'seo' so
   * the next SeoAgent call retrieves them via semanticRelevantFor.
   *
   * Winners = lessons with views ≥ 1.5x rolling mean (same lift used for
   * hook mining). Needs ≥3 measured lessons before it activates.
   */
  async mineSeoPatternsForBrand(brandId: string): Promise<number> {
    const brand = await this.brandRepo.findOne({ where: { id: brandId } });
    if (!brand) return 0;

    // Same winner detection as runForBrand — but we also need the SEO asset.
    const rows: Array<{ lessonId: string; views: string; title: string }> =
      await this.metricsRepo.query(`
        WITH latest AS (
          SELECT DISTINCT ON ("lessonId") "lessonId", views
            FROM cs_lesson_metrics
           ORDER BY "lessonId", "fetchedAt" DESC
        )
        SELECT l.id AS "lessonId", lm.views AS views, l.title AS title
          FROM latest lm
          JOIN cs_lessons l ON l.id = lm."lessonId"
          JOIN cs_weekly_content_plans p ON p.id = l."planId"
         WHERE p."brandId" = $1
      `, [brandId]);
    if (rows.length < 3) {
      this.logger.log(
        `SEO mining skipped for "${brand.name}" — only ${rows.length} measured lessons (need ≥3)`,
      );
      return 0;
    }
    const totals = rows.map((r) => Number(r.views));
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    if (mean <= 0) return 0;
    const winners = rows.filter((r) => Number(r.views) >= mean * ImprovementAgent.LIFT);
    if (winners.length === 0) return 0;

    // Pull the actual title/tags that shipped on each winner.
    const seoBlocks: string[] = [];
    for (const w of winners.slice(0, 10)) {
      const seo = await this.assetRepo.findOne({
        where: { lessonId: w.lessonId, assetType: 'seo' },
        order: { version: 'DESC' },
      });
      const c = (seo?.content ?? {}) as { chosenTitle?: string; tags?: string[] };
      const t = c.chosenTitle ?? w.title;
      const tg = Array.isArray(c.tags) ? c.tags.slice(0, 12).join(', ') : '(none)';
      const k = Math.round(Number(w.views) / 1000);
      seoBlocks.push(`[${k}k views] TITLE: ${t}\n  TAGS: ${tg}`);
    }

    let parsed: {
      title_patterns?: Array<{ pattern?: string; why?: string }>;
      tag_patterns?:   Array<{ pattern?: string; why?: string }>;
    } = {};
    try {
      const r = await this.router.run({
        task: 'seo',
        agentType: 'seo',
        modelOverride: brand.modelOverrides?.seo,
        jsonOutput: true,
        maxTokens: 1200,
        temperature: 0.4,
        system: SEO_MINE_SYSTEM,
        user: `BRAND: ${brand.name}\n\nWINNING LESSONS (≥1.5x mean views):\n${seoBlocks.join('\n\n')}\n\nExtract the reusable title + tag patterns. JSON only.`,
      });
      parsed = JSON.parse(r.text || '{}');
    } catch (e) {
      this.logger.warn(`SEO mining LLM failed for "${brand.name}": ${(e as Error).message}`);
      return 0;
    }

    let promoted = 0;
    const insert = async (
      pattern: string, why: string | undefined, kind: 'title' | 'tag',
    ): Promise<void> => {
      const content = `Winning ${kind} pattern: ${pattern}${why ? ` — ${why}` : ''}`.slice(0, 400);
      const memoryType = kind === 'title' ? 'title_pattern' : 'tag_pattern';
      const already = await this.memRepo.findOne({
        where: { brandId, content, memoryType },
      });
      if (already) return;
      const created = await this.memRepo.save(
        this.memRepo.create({
          brandId,
          memoryType,
          content,
          weight: 2,
          appliesTo: ['seo'],
          isActive: true,
        }),
      );
      void this.memorySvc.embedOnSave(created.id, created.content);
      promoted++;
    };

    for (const p of (parsed.title_patterns ?? []).slice(0, 3)) {
      const pat = String(p?.pattern ?? '').trim();
      if (pat) await insert(pat, p?.why?.trim(), 'title');
    }
    for (const p of (parsed.tag_patterns ?? []).slice(0, 3)) {
      const pat = String(p?.pattern ?? '').trim();
      if (pat) await insert(pat, p?.why?.trim(), 'tag');
    }

    if (promoted > 0) {
      this.logger.log(
        `SEO mining "${brand.name}" — promoted ${promoted} title+tag pattern(s) from ${winners.length} winners`,
      );
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

// ── Scene-pattern mining helpers ──────────────────────────────────────

/** Normalise a string for cheap dedup / noise-edit detection. */
function normForCompareCs(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tallyStrings(arr: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of arr) {
    const k = x.toLowerCase().trim();
    if (!k) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function sortedTopKey(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/** Bands for scene_count — keeps "12 wins" vs "13 wins" from polluting
 *  memory with near-noise. */
function sceneBucket(n: number): string | null {
  if (n <= 0) return null;
  if (n <= 18) return '12-18 (tight)';
  if (n <= 26) return '19-26 (standard lesson length)';
  return '27+ (very long, may be over-stuffed)';
}

function characterBucket(n: number): string | null {
  if (n <= 0) return null;
  if (n === 1) return '1';
  if (n <= 3)  return '2-3';
  return '4+';
}
