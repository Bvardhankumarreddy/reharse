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
You write a DETAILED PROMPT for a thumbnail image generator (Midjourney /
DALL-E / SDXL). The host generates the image themselves — your job is to
hand them a brief good enough to ship.

Required fields:
- main_prompt: ONE paragraph (≤ 800 chars) covering subject, composition,
  lighting, colour, style. Include the brand's primary + secondary colours
  if they fit naturally. Plain English — no Midjourney parameters.
- face_position: "left" | "right" | "center" | "none".
- text_overlay: ≤ 8 words. Drop articles.
- color_palette: 3–4 hex colours (with #).
- mood: 2–3 words.
- style: e.g. "photoreal cinematic", "minimal flat-vector with bold accent".
- alternates: 3 ALTERNATIVE main_prompt strings, each ≤ 600 chars.

Obey the brand voice/style memories.

Return STRICT JSON ONLY:
{"main_prompt":"…","face_position":"left|right|center|none","text_overlay":"…","color_palette":["#…","#…"],"mood":"…","style":"…","alternates":["…","…","…"]}
`.trim();

interface ThumbJson {
  main_prompt?: string;
  face_position?: string;
  text_overlay?: string;
  color_palette?: string[];
  mood?: string;
  style?: string;
  alternates?: string[];
}

const FACE_POSITIONS = ['left', 'right', 'center', 'none'] as const;
type FacePosition = (typeof FACE_POSITIONS)[number];

interface ThumbParsed {
  mainPrompt: string;
  facePosition: FacePosition;
  textOverlay: string;
  colorPalette: string[];
  mood: string;
  style: string;
  alternates: string[];
}

@Injectable()
export class ThumbnailAgent {
  private readonly logger = new Logger(ThumbnailAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    private readonly router: ModelRouterService,
    private readonly loop: ImprovementLoopService,
    private readonly memories: BrandMemoryService,
  ) {}

  async generateThumbnail(lessonId: string): Promise<ContentAsset> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const memories = await this.memories.relevantFor(brand.id, 'thumbnail');
    const memoryBlock = this.memories.format(memories);
    const script = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
    const scriptText =
      (script?.content as { fullScript?: string } | null | undefined)
        ?.fullScript ?? '';

    const userBase =
      `BRAND: ${brand.name}\nBrand voice: ${brand.voiceStyle ?? ''}\n` +
      `Brand colours: primary ${brand.colorPrimary ?? '(none)'}, ` +
      `secondary ${brand.colorSecondary ?? '(none)'}\n\n` +
      `LESSON ${lesson.lessonNumber}: ${lesson.title}\nHook: ${lesson.hook ?? '(none)'}\n\n` +
      (scriptText
        ? `LESSON AUDIO SCRIPT (the strongest image often comes from the hook):\n${scriptText.slice(0, 4000)}\n\n`
        : '') +
      `BRAND MEMORIES:\n${memoryBlock}\n\n` +
      `Output the JSON object only.`;

    const result = await this.loop.run<ThumbParsed>({
      agentType: 'thumbnail',
      planId: plan.id,
      lessonId: lesson.id,
      memoryCount: memories.length,
      context: `Lesson: ${lesson.title} · Brand colours: ${brand.colorPrimary}/${brand.colorSecondary}`,
      draftFn: async (critique) => {
        const user = critique
          ? `${userBase}\n\nREVISION REQUESTED — fix these:\n${critique}\nReturn the full JSON object only.`
          : userBase;
        const r = await this.router.run({
          task: 'thumbnail',
          agentType: 'thumbnail',
          planId: plan.id,
          lessonId: lesson.id,
          jsonOutput: true,
          maxTokens: 1500,
          temperature: 0.8,
          system: SYSTEM,
          user,
        });
        const parsed = JSON.parse(r.text || '{}') as ThumbJson;
        const face = (FACE_POSITIONS as readonly string[]).includes(
          String(parsed.face_position),
        )
          ? (parsed.face_position as FacePosition)
          : 'left';
        const out: ThumbParsed = {
          mainPrompt: String(parsed.main_prompt ?? '').slice(0, 1500),
          facePosition: face,
          textOverlay: String(parsed.text_overlay ?? '').slice(0, 80),
          colorPalette: (parsed.color_palette ?? []).map((c) => String(c).slice(0, 12)).slice(0, 5),
          mood: String(parsed.mood ?? '').slice(0, 60),
          style: String(parsed.style ?? '').slice(0, 100),
          alternates: (parsed.alternates ?? []).map((s) => String(s).slice(0, 1500)).slice(0, 4),
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

    const t = result.parsed;
    const latest = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'thumbnail_prompt' },
      order: { version: 'DESC' },
    });
    const asset = await this.assetRepo.save(
      this.assetRepo.create({
        planId: plan.id,
        lessonId: lesson.id,
        assetType: 'thumbnail_prompt',
        version: (latest?.version ?? 0) + 1,
        content: { ...t, model: result.model, provider: result.provider, costUsd: result.totalCostUsd },
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
      `Thumbnail v${asset.version} for "${lesson.title}" — ` +
      `${result.revisions} revision(s), score ${result.qualityScore ?? 'n/a'} ` +
      `($${result.totalCostUsd.toFixed(4)})`,
    );
    return asset;
  }

  async latestThumbnail(lessonId: string): Promise<ContentAsset | null> {
    return this.assetRepo.findOne({
      where: { lessonId, assetType: 'thumbnail_prompt' },
      order: { version: 'DESC' },
    });
  }
}
