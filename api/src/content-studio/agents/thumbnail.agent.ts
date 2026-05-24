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

export type ThumbnailStyle = 'cinematic' | 'clean' | 'dramatic';
export type AspectRatio = '16:9' | '1:1' | '9:16';

export const THUMBNAIL_STYLES: ThumbnailStyle[] = ['cinematic', 'clean', 'dramatic'];
export const ASPECT_RATIOS: AspectRatio[] = ['16:9', '1:1', '9:16'];

/** aspect → the DALL-E size we'll actually render + the sizing line for the prompt. */
export const ASPECT_MAP: Record<AspectRatio, { dalleSize: '1792x1024' | '1024x1024' | '1024x1792'; sizingLine: string }> = {
  '16:9': { dalleSize: '1792x1024', sizingLine: 'Aspect ratio: 16:9 widescreen, 1792x1024 pixels' },
  '1:1':  { dalleSize: '1024x1024', sizingLine: 'Aspect ratio: 1:1 square, 1024x1024 pixels' },
  '9:16': { dalleSize: '1024x1792', sizingLine: 'Aspect ratio: 9:16 vertical, 1024x1920 framing (rendered 1024x1792)' },
};

const STYLE_PRESETS: Record<ThumbnailStyle, string> = {
  cinematic:
    'CINEMATIC — the war-room breakthrough look, film-quality. Dramatic ' +
    'side-lighting (amber-gold rim on the subject), shallow depth of field ' +
    'with a desaturated background, a glowing focal element (screen / ' +
    'hologram / data), subject leaning in with a knowing, confident ' +
    'expression. Composition reads like a movie still. Mood: "the reveal".',
  clean:
    'CLEAN — MrBeast minimal, maximum impact. MAX 3 visual elements, 60%+ ' +
    'negative space, ONE bold headline (≤6 words), ONE strong face/element, ' +
    '2 colours only, flat high-contrast, instantly readable at mobile size.',
  dramatic:
    'DRAMATIC — high emotion, high contrast. Intense facial expression ' +
    '(shock / awe / concern), strong navy-vs-cyan-or-red contrast, bold ' +
    'glowing text, tension in the composition, spotlight or dramatic shadows.',
};

const SYSTEM = `
You are a senior YouTube thumbnail art director for educational tech channels.
You write ONE production-ready image-generation prompt (for DALL-E / Ideogram /
Midjourney) plus 3 alternates. The system renders it directly — detail matters.

EVERY main_prompt (and every alternate) MUST explicitly specify ALL of:
1. COMPOSITION — where each element sits (left/right/center, % of frame), the
   focal point + eye flow, foreground vs background separation.
2. LIGHTING — direction (side-lit / rim / top-down), colour of the light, mood.
3. DEPTH — depth of field (shallow/deep), what is sharp vs blurred.
4. COLOUR GRADING — enforce the brand palette, saturation + contrast choices.
5. MOOD / EMOTION — the feeling, and the subject's expression if a person is shown.
6. SIZING — END the prompt with the exact aspect line given in the brief. NEVER omit it.

BRAND PALETTE (use 2-3 per thumbnail; the dark navy always dominates ~60%):
- Deep navy #0A0E27 (background)
- Cyan #00D4FF (highlights / glow / focal accents)
- Amber-gold #FFD700 (rim light / key highlights)
- Coral #FF6B6B (warnings / contrast — sparingly)
Prefer the brand's own primary/secondary colours when provided; fold the above in.

STYLE PRESETS (you will be told which ONE to use — match it, never mix):
- ${STYLE_PRESETS.cinematic}
- ${STYLE_PRESETS.clean}
- ${STYLE_PRESETS.dramatic}

Required JSON fields:
- main_prompt: one rich paragraph (≤ 900 chars) covering composition + lighting
  + depth + colour + mood, ENDING with the exact sizing line. Plain English.
- face_position: "left" | "right" | "center" | "none".
- text_overlay: ≤ 6 words, ALL CAPS, drop articles.
- color_palette: 3–4 hex colours (with #).
- mood: 2–3 words.
- art_direction_notes: 1 sentence on the key visual choice.
- alternates: 3 ALTERNATIVE main_prompt strings (each ≤ 700 chars, each also
  ending with the sizing line, same style).

Obey the brand voice/style memories. Return STRICT JSON ONLY:
{"main_prompt":"…","face_position":"left|right|center|none","text_overlay":"…","color_palette":["#…"],"mood":"…","art_direction_notes":"…","alternates":["…","…","…"]}
`.trim();

interface ThumbJson {
  main_prompt?: string;
  face_position?: string;
  text_overlay?: string;
  color_palette?: string[];
  mood?: string;
  art_direction_notes?: string;
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
  artDirectionNotes: string;
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

  async generateThumbnail(
    lessonId: string,
    opts: { style?: ThumbnailStyle; aspectRatio?: AspectRatio } = {},
  ): Promise<ContentAsset> {
    const style: ThumbnailStyle = THUMBNAIL_STYLES.includes(opts.style as ThumbnailStyle)
      ? (opts.style as ThumbnailStyle)
      : 'cinematic';
    const aspectRatio: AspectRatio = ASPECT_RATIOS.includes(opts.aspectRatio as AspectRatio)
      ? (opts.aspectRatio as AspectRatio)
      : '16:9';
    const sizingLine = ASPECT_MAP[aspectRatio].sizingLine;

    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const memories = await this.memories.semanticRelevantFor(
      brand.id, 'thumbnail', `${lesson.title} ${lesson.hook ?? ''}`, 6,
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
      `BRAND: ${brand.name}\nBrand voice: ${brand.voiceStyle ?? ''}\n` +
      `Brand colours: primary ${brand.colorPrimary ?? '(none)'}, ` +
      `secondary ${brand.colorSecondary ?? '(none)'}\n\n` +
      `LESSON ${lesson.lessonNumber}: ${lesson.title}\nHook: ${lesson.hook ?? '(none)'}\n\n` +
      (scriptText
        ? `LESSON AUDIO SCRIPT (the strongest image often comes from the hook):\n${scriptText.slice(0, 4000)}\n\n`
        : '') +
      `BRAND MEMORIES:\n${memoryBlock}\n\n` +
      `REQUESTED STYLE: ${style} — ${STYLE_PRESETS[style]}\n` +
      `ASPECT / SIZING: every main_prompt AND every alternate must END with ` +
      `this exact line → "${sizingLine}"\n\n` +
      `Output the JSON object only.`;

    const result = await this.loop.run<ThumbParsed>({
      agentType: 'thumbnail',
      planId: plan.id,
      lessonId: lesson.id,
      memoryCount: memories.length,
      graderModelOverride: brand.modelOverrides?.grader,
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
          modelOverride: brand.modelOverrides?.thumbnail,
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
          artDirectionNotes: String(parsed.art_direction_notes ?? '').slice(0, 300),
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
        content: {
          ...t,
          style,
          aspectRatio,
          dalleSize: ASPECT_MAP[aspectRatio].dalleSize,
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
      `Thumbnail v${asset.version} (${style}, ${aspectRatio}) for "${lesson.title}" — ` +
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
