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
You write YouTube SEO packs for a single educational lesson. The viewer
should be ABLE to find this video AND want to click it. Be honest — no
clickbait, no all-caps screaming, no fake stakes.

Produce:
- title_variants: 8 distinct titles, ≤ 70 chars each. Mix angles: stakes,
  outcome, question, contrarian, "how to", "why most …", "the X that …",
  "before you …". No emoji.
- chosen_title_index: pick the strongest one.
- description: 600–1200 chars. First 2 sentences MUST stand alone (above
  the fold). Include 1–2 timestamps (00:00 / mm:ss). Then one CTA line + a
  reference to the Saturday quiz. FINALLY, end with a line of 3–5 relevant
  HASHTAGS (with #), most important first — YouTube surfaces the first 3
  above the title, so make them count (broad + topic-specific). These
  hashtags are REQUIRED.
- tags: 12–20 lowercase tags, no #, no duplicates, ≤ 30 chars each. (This is
  the separate YouTube "tags" field — keep it distinct from the description
  hashtags above.)
- end_screen_cards: 3 entries — "subscribe", "watch next: <lesson 2 title>",
  "Saturday quiz".

Obey the brand voice/style/do/don't memories verbatim.

Return STRICT JSON ONLY:
{"title_variants":["…"],"chosen_title_index":0,"description":"…","tags":["…"],"end_screen_cards":[{"label":"…","why":"…"}]}
`.trim();

interface SeoJson {
  title_variants?: string[];
  chosen_title_index?: number;
  description?: string;
  tags?: string[];
  end_screen_cards?: Array<{ label?: string; why?: string }>;
}

interface SeoParsed {
  titleVariants: string[];
  chosenTitleIndex: number;
  description: string;
  tags: string[];
  endScreenCards: Array<{ label?: string; why?: string }>;
}

/**
 * Ensure the YouTube description ends with hashtags (YouTube renders the first
 * 3 above the video title). If the model already included a "#tag" line, keep
 * it; otherwise append the top 3-5 tags as CamelCase hashtags.
 */
function ensureDescriptionHashtags(description: string, tags: string[]): string {
  if (/#[A-Za-z0-9]/.test(description)) return description; // already has hashtags
  const hashtags = tags
    .slice(0, 5)
    .map((t) =>
      t
        .split(/[\s-_]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(''),
    )
    .filter(Boolean)
    .map((t) => `#${t}`);
  if (hashtags.length === 0) return description;
  return `${description.trimEnd()}\n\n${hashtags.join(' ')}`;
}

@Injectable()
export class SeoAgent {
  private readonly logger = new Logger(SeoAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    private readonly router: ModelRouterService,
    private readonly loop: ImprovementLoopService,
    private readonly memories: BrandMemoryService,
  ) {}

  async generateSeo(lessonId: string): Promise<ContentAsset> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const memories = await this.memories.semanticRelevantFor(
      brand.id, 'seo', `${lesson.title} ${lesson.hook ?? ''}`, 6,
    );
    const memoryBlock = this.memories.format(memories);
    const script = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
    const scriptText =
      (script?.content as { fullScript?: string } | null | undefined)
        ?.fullScript ?? '';

    const userBase =
      `BRAND: ${brand.name}\nVoice/style: ${brand.voiceStyle ?? ''}\n\n` +
      `WEEK THEME: ${plan.theme ?? '(none)'}\n` +
      `QUIZ SCOPE: ${plan.quizScope ?? '(none)'}\n\n` +
      `LESSON ${lesson.lessonNumber}: ${lesson.title}\nHook: ${lesson.hook ?? '(none)'}\n` +
      `Target duration: ${lesson.targetDurationMinutes} min.\n\n` +
      (scriptText
        ? `LESSON AUDIO SCRIPT (mine the strongest beats):\n${scriptText.slice(0, 6000)}\n\n`
        : `(No script yet — work from the lesson hook + outline.)\n\n`) +
      `BRAND MEMORIES:\n${memoryBlock}\n\n` +
      `Output the JSON object only.`;

    const result = await this.loop.run<SeoParsed>({
      agentType: 'seo',
      planId: plan.id,
      lessonId: lesson.id,
      memoryCount: memories.length,
      graderModelOverride: brand.modelOverrides?.grader,
      context: `Lesson: ${lesson.title} · Brand: ${brand.name}`,
      draftFn: async (critique) => {
        const user = critique
          ? `${userBase}\n\nREVISION REQUESTED — fix these:\n${critique}\nReturn the full JSON object only.`
          : userBase;
        const r = await this.router.run({
          task: 'seo',
          agentType: 'seo',
          planId: plan.id,
          lessonId: lesson.id,
          modelOverride: brand.modelOverrides?.seo,
          jsonOutput: true,
          maxTokens: 1800,
          temperature: 0.6,
          system: SYSTEM,
          user,
        });
        const parsed = JSON.parse(r.text || '{}') as SeoJson;
        const titleVariants = (parsed.title_variants ?? [])
          .map((t) => String(t).slice(0, 100))
          .slice(0, 8);
        const chosen =
          Number.isInteger(parsed.chosen_title_index) &&
          (parsed.chosen_title_index as number) >= 0 &&
          (parsed.chosen_title_index as number) < titleVariants.length
            ? (parsed.chosen_title_index as number)
            : 0;
        const tags = (parsed.tags ?? [])
          .map((t) => String(t).toLowerCase().slice(0, 30))
          .slice(0, 20);
        // Guarantee the description ends with hashtags (YouTube shows the
        // first 3 above the title). If the model didn't add any, append the
        // top tags as hashtags.
        const description = ensureDescriptionHashtags(
          String(parsed.description ?? '').slice(0, 4000),
          tags,
        );
        const out: SeoParsed = {
          titleVariants,
          chosenTitleIndex: chosen,
          description,
          tags,
          endScreenCards: (parsed.end_screen_cards ?? []).slice(0, 4),
        };
        return {
          parsed: out,
          rawForGrader: JSON.stringify(out),
          model: r.model,
          provider: r.provider as ProviderName,
          costUsd: r.costUsd,
        };
      },
    });

    const seo = result.parsed;
    const latest = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'seo' },
      order: { version: 'DESC' },
    });
    const asset = await this.assetRepo.save(
      this.assetRepo.create({
        planId: plan.id,
        lessonId: lesson.id,
        assetType: 'seo',
        version: (latest?.version ?? 0) + 1,
        content: {
          ...seo,
          chosenTitle: seo.titleVariants[seo.chosenTitleIndex] ?? '',
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
    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + result.totalCostUsd,
    });
    this.logger.log(
      `SEO v${asset.version} for "${lesson.title}" — ` +
      `${result.revisions} revision(s), score ${result.qualityScore ?? 'n/a'} ` +
      `($${result.totalCostUsd.toFixed(4)})`,
    );
    return asset;
  }

  async latestSeo(lessonId: string): Promise<ContentAsset | null> {
    return this.assetRepo.findOne({
      where: { lessonId, assetType: 'seo' },
      order: { version: 'DESC' },
    });
  }
}
