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
You write THREE promotion posts for one new lesson — one per platform.
Each platform has very different norms; the same words don't work across
them. Mine real beats from the lesson script — do NOT just rephrase the
title.

LINKEDIN (technical-pro audience):
- hook: 1 line, ≤ 200 chars, concrete stakes.
- body: 3–5 short paragraphs (~600–900 chars total).
- cta: 1 line.
- hashtags: 3–6, no spaces, no "#".

INSTAGRAM:
- caption: 80–220 chars, punchy. Allow 1 emoji max if natural.
- hashtags: 8–15, no spaces, no "#".

WHATSAPP_STATUS:
- text: ≤ 700 chars total AND ≤ 10 lines. Conversational. End with a
  one-line nudge to watch the lesson.

Obey brand voice/style/do/don't memories verbatim.

Return STRICT JSON ONLY:
{"linkedin":{"hook":"…","body":"…","cta":"…","hashtags":["…"]},
 "instagram":{"caption":"…","hashtags":["…"]},
 "whatsapp_status":{"text":"…"}}
`.trim();

interface PromoJson {
  linkedin?: { hook?: string; body?: string; cta?: string; hashtags?: string[] };
  instagram?: { caption?: string; hashtags?: string[] };
  whatsapp_status?: { text?: string };
}

interface PromoParsed {
  linkedin: { hook: string; body: string; cta: string; hashtags: string[] };
  instagram: { caption: string; hashtags: string[] };
  whatsappStatus: { text: string; chars: number; lines: number };
}

function clampWhatsapp(s: string): string {
  let v = s.replace(/\r\n/g, '\n').trim();
  const lines = v.split('\n');
  if (lines.length > 10) v = lines.slice(0, 10).join('\n');
  if (v.length > 700) v = v.slice(0, 697).replace(/\s+\S*$/, '') + '…';
  return v;
}

function cleanHashtags(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((h) => String(h).replace(/^#/, '').trim().replace(/\s+/g, ''))
    .filter(Boolean)
    .slice(0, max);
}

@Injectable()
export class PromoAgent {
  private readonly logger = new Logger(PromoAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    private readonly router: ModelRouterService,
    private readonly loop: ImprovementLoopService,
    private readonly memories: BrandMemoryService,
  ) {}

  async generatePromo(lessonId: string): Promise<ContentAsset> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const memories = await this.memories.relevantFor(brand.id, 'promo');
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
      `LESSON ${lesson.lessonNumber}: ${lesson.title}\nHook: ${lesson.hook ?? '(none)'}\n\n` +
      (scriptText
        ? `LESSON AUDIO SCRIPT (mine real moments — not the title):\n${scriptText.slice(0, 5000)}\n\n`
        : '') +
      `BRAND MEMORIES:\n${memoryBlock}\n\n` +
      `Output the JSON object only.`;

    const result = await this.loop.run<PromoParsed>({
      agentType: 'promo',
      planId: plan.id,
      lessonId: lesson.id,
      memoryCount: memories.length,
      context: `Lesson: ${lesson.title} · Brand: ${brand.name}`,
      draftFn: async (critique) => {
        const user = critique
          ? `${userBase}\n\nREVISION REQUESTED — fix these:\n${critique}\nReturn the full JSON object only.`
          : userBase;
        const r = await this.router.run({
          task: 'promo',
          agentType: 'promo',
          planId: plan.id,
          lessonId: lesson.id,
          jsonOutput: true,
          maxTokens: 2200,
          temperature: 0.75,
          system: SYSTEM,
          user,
        });
        const parsed = JSON.parse(r.text || '{}') as PromoJson;
        const li = parsed.linkedin ?? {};
        const ig = parsed.instagram ?? {};
        const ws = parsed.whatsapp_status ?? {};
        const wsText = clampWhatsapp(String(ws.text ?? ''));
        const out: PromoParsed = {
          linkedin: {
            hook: String(li.hook ?? '').slice(0, 250),
            body: String(li.body ?? '').slice(0, 1500),
            cta:  String(li.cta  ?? '').slice(0, 200),
            hashtags: cleanHashtags(li.hashtags, 6),
          },
          instagram: {
            caption: String(ig.caption ?? '').slice(0, 300),
            hashtags: cleanHashtags(ig.hashtags, 15),
          },
          whatsappStatus: {
            text: wsText,
            chars: wsText.length,
            lines: wsText.split('\n').length,
          },
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

    const p = result.parsed;
    const latest = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'promo' },
      order: { version: 'DESC' },
    });
    const asset = await this.assetRepo.save(
      this.assetRepo.create({
        planId: plan.id,
        lessonId: lesson.id,
        assetType: 'promo',
        version: (latest?.version ?? 0) + 1,
        content: { ...p, model: result.model, provider: result.provider, costUsd: result.totalCostUsd },
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
      `Promo v${asset.version} for "${lesson.title}" — ` +
      `${result.revisions} revision(s), score ${result.qualityScore ?? 'n/a'} ` +
      `($${result.totalCostUsd.toFixed(4)})`,
    );
    return asset;
  }

  async latestPromo(lessonId: string): Promise<ContentAsset | null> {
    return this.assetRepo.findOne({
      where: { lessonId, assetType: 'promo' },
      order: { version: 'DESC' },
    });
  }
}
