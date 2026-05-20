import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { BrandMemory } from '../entities/brand-memory.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import { ModelRouterService } from '../services/model-router.service';

const SYSTEM = `
You write YouTube SEO packs for a single educational lesson. The viewer
should be ABLE to find this video AND want to click it. Be honest — no
clickbait, no all-caps screaming, no fake stakes.

Produce:
- title_variants: 8 distinct titles, ≤ 70 chars each. Mix angles: stakes,
  outcome, question, contrarian, "how to", "why most …", "the X that …",
  "before you …". No emoji.
- chosen_title_index: pick the strongest one. Brief reasoning is NOT
  required; just choose.
- description: 600–1200 chars. First 2 sentences MUST stand alone (they
  appear above the fold). Include 1–2 timestamps (00:00 / mm:ss). End with
  one CTA line + a reference to the Saturday quiz.
- tags: 12–20 lowercase tags, no #, no duplicates, ≤ 30 chars each. Mix
  broad and specific.
- end_screen_cards: 3 entries — what to suggest next ("subscribe", "watch
  next: <lesson 2 title>", "Saturday quiz").

Obey the brand voice/style/do/don't memories verbatim.

Return STRICT JSON ONLY:
{"title_variants":["…", "…"],"chosen_title_index":0,"description":"…","tags":["…"],"end_screen_cards":[{"label":"…","why":"…"}]}
`.trim();

interface SeoJson {
  title_variants?: string[];
  chosen_title_index?: number;
  description?: string;
  tags?: string[];
  end_screen_cards?: Array<{ label?: string; why?: string }>;
}

@Injectable()
export class SeoAgent {
  private readonly logger = new Logger(SeoAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(BrandMemory) private readonly memoryRepo: Repository<BrandMemory>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    private readonly router: ModelRouterService,
  ) {}

  async generateSeo(lessonId: string): Promise<ContentAsset> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const memories = await this.memoryRepo.find({
      where: { brandId: brand.id, isActive: true },
      order: { weight: 'DESC' },
    });
    const memoryBlock = memories.length
      ? memories.map((m) => `- [${m.memoryType}] ${m.content}`).join('\n')
      : '(no brand memories yet)';

    const script = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
    const scriptText =
      (script?.content as { fullScript?: string } | null | undefined)
        ?.fullScript ?? '';

    const result = await this.router.run({
      task: 'seo',
      agentType: 'seo',
      planId: plan.id,
      lessonId: lesson.id,
      jsonOutput: true,
      maxTokens: 1800,
      temperature: 0.6,
      system: SYSTEM,
      user:
        `BRAND: ${brand.name}\nVoice/style: ${brand.voiceStyle ?? ''}\n\n` +
        `WEEK THEME: ${plan.theme ?? '(none)'}\n` +
        `QUIZ SCOPE: ${plan.quizScope ?? '(none)'}\n\n` +
        `LESSON ${lesson.lessonNumber}: ${lesson.title}\n` +
        `Hook: ${lesson.hook ?? '(none)'}\n` +
        `Target duration: ${lesson.targetDurationMinutes} min.\n\n` +
        (scriptText
          ? `LESSON AUDIO SCRIPT (mine the strongest beats):\n${scriptText.slice(0, 6000)}\n\n`
          : `(No script yet — work from the lesson hook + outline.)\n\n`) +
        `BRAND MEMORIES:\n${memoryBlock}\n\n` +
        `Output the JSON object only.`,
    });

    const parsed = JSON.parse(result.text || '{}') as SeoJson;
    const titleVariants = (parsed.title_variants ?? [])
      .map((t) => String(t).slice(0, 100))
      .slice(0, 8);
    const chosenIndex =
      Number.isInteger(parsed.chosen_title_index) &&
      (parsed.chosen_title_index as number) >= 0 &&
      (parsed.chosen_title_index as number) < titleVariants.length
        ? (parsed.chosen_title_index as number)
        : 0;

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
          titleVariants,
          chosenTitleIndex: chosenIndex,
          chosenTitle: titleVariants[chosenIndex] ?? '',
          description: String(parsed.description ?? '').slice(0, 4000),
          tags: (parsed.tags ?? []).map((t) => String(t).toLowerCase().slice(0, 30)).slice(0, 20),
          endScreenCards: (parsed.end_screen_cards ?? []).slice(0, 4),
          model: result.model,
          provider: result.provider,
          costUsd: result.costUsd,
        },
        status: 'draft',
      }),
    );

    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + result.costUsd,
    });
    this.logger.log(
      `SEO v${asset.version} for lesson "${lesson.title}" — ` +
      `$${result.costUsd.toFixed(4)} (${result.model})`,
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
