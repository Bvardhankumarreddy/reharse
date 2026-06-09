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
import { socialFooter } from '../services/social-footer';

const SYSTEM = `
You write THREE promotion posts for one new lesson — one per platform.
Each platform has very different norms; the same words don't work across
them. Mine real beats from the lesson script — do NOT just rephrase the
title.

═══ TAGS/HASHTAGS ARE MANDATORY ═══
LinkedIn and Instagram posts MUST each include AT LEAST 20 hashtags. NEVER
return an empty or short hashtags array. Mix broad + niche + brand +
topic-specific tags. If unsure, adapt from the lesson topic and brand name.

HASHTAG CASING (non-negotiable):
- EVERY hashtag is ALL LOWERCASE, every platform, every field.
  ✅ "aishorts" "machinelearning" "techindia"
  ❌ "AIShorts" "MachineLearning" "TechIndia"
- Applies to the hashtags array AND any inline hashtags inside
  linkedin body / instagram caption.
- The post-pass will lowercase anything you miss, but emitting
  lowercase up front saves output tokens.

LINKEDIN (technical-pro audience):
- hook: 1 line, ≤ 200 chars, concrete stakes.
- body: 3–5 short paragraphs (~600–900 chars total).
- cta: 1 line.
- hashtags: REQUIRED, AT LEAST 20 (20–24), no spaces, no "#", ALL LOWERCASE.
  Mix broad (ai, artificialintelligence, innovation, techindia) + many
  topic-specific.

INSTAGRAM:
- caption: 80–220 chars, punchy. Allow 1 emoji max if natural.
- hashtags: REQUIRED, AT LEAST 20 (20–30), no spaces, no "#", ALL LOWERCASE.
  Mix niche + popular + brand + topic-specific.

WHATSAPP_STATUS:
- text: ≤ 700 chars total AND ≤ 10 lines. Conversational. End with a
  one-line nudge to watch the lesson. (No hashtags.)

SELF-CHECK before output: linkedin.hashtags has ≥ 20 items, instagram.hashtags
has ≥ 20 items, neither is empty. If short, add more topic + broad tags.

Obey brand voice/style/do/don't memories verbatim.

Return STRICT JSON ONLY:
{"linkedin":{"hook":"…","body":"…","cta":"…","hashtags":["…"]},
 "instagram":{"caption":"…","hashtags":["…"]},
 "whatsapp_status":{"text":"…"}}
`.trim();

/** Generic fallback pool — only used to backfill if the LLM under-delivers.
 *  Large enough to top any platform up to the 20-tag minimum. */
const BASE_PROMO_TAGS = [
  'ai', 'artificialintelligence', 'machinelearning', 'deeplearning',
  'genai', 'generativeai', 'llm', 'chatgpt', 'aitools', 'aiagents',
  'datascience', 'tech', 'technology', 'techindia', 'futuretech',
  'learnai', 'aieducation', 'edtech', 'coding', 'programming',
  'developer', 'softwareengineering', 'devops', 'cloud', 'automation',
  'innovation', 'productivity', 'startup', 'careers', 'upskilling',
];

function topicWords(s: string, max: number): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, max);
}

/**
 * Guarantee hashtags are never empty / below the platform minimum. Keeps the
 * LLM's tags, then backfills from brand slug + topic words + a generic pool
 * only if needed. Deduped, capped at max.
 */
function ensureHashtags(
  have: string[], brandSlug: string, lessonTitle: string, min: number, max: number,
): string[] {
  const out = [...have];
  if (out.length >= min) return out.slice(0, max);
  const pool = [brandSlug, ...topicWords(lessonTitle, 5), ...BASE_PROMO_TAGS]
    .map((t) => t.replace(/[^a-z0-9]/gi, '').toLowerCase())
    .filter(Boolean);
  for (const t of pool) {
    if (out.length >= min) break;
    if (!out.includes(t)) out.push(t);
  }
  return out.slice(0, max);
}

function joinTags(tags: string[]): string {
  return tags.map((t) => `#${t}`).join(' ');
}

interface PromoJson {
  linkedin?: { hook?: string; body?: string; cta?: string; hashtags?: string[] };
  instagram?: { caption?: string; hashtags?: string[] };
  whatsapp_status?: { text?: string };
}

interface PromoParsed {
  linkedin: { hook: string; body: string; cta: string; hashtags: string[]; full_text: string };
  instagram: { caption: string; hashtags: string[]; full_text: string };
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
    // Strip the leading "#" + interior whitespace, then force lowercase
    // so the LLM's PascalCase ("AIShorts") becomes "aishorts" — matches
    // the casing convention from the AQB lowercase pass.
    .map((h) => String(h).replace(/^#/, '').trim().replace(/\s+/g, '').toLowerCase())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Lowercase every #Word hashtag in a body of text. Body content
 * outside hashtags is untouched. Used to clean inline hashtags in
 * caption/body fields without disturbing the surrounding prose.
 */
function lowercaseInlineHashtags(s: string): string {
  return s.replace(/#([A-Za-z0-9_]+)/g, (_m, word) => '#' + word.toLowerCase());
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

    const memories = await this.memories.semanticRelevantFor(
      brand.id, 'promo', `${lesson.title} ${lesson.hook ?? ''}`, 6,
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
      graderModelOverride: brand.modelOverrides?.grader,
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
          modelOverride: brand.modelOverrides?.promo,
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
        const brandSlug = String(brand.slug ?? brand.name ?? '');
        const footer = socialFooter(lesson.lessonNumber, lesson.title);

        // Inline hashtags inside body/caption get lowercased too, so a
        // stray "#AIShorts" in the LinkedIn body or Instagram caption
        // ends up matching the (already-lowercased) array entries.
        const liHook = lowercaseInlineHashtags(String(li.hook ?? '').slice(0, 250));
        const liBody = lowercaseInlineHashtags(String(li.body ?? '').slice(0, 1500));
        const liCta  = lowercaseInlineHashtags(String(li.cta  ?? '').slice(0, 200));
        const liTags = ensureHashtags(cleanHashtags(li.hashtags, 24), brandSlug, lesson.title, 20, 24);

        const igCaption = lowercaseInlineHashtags(String(ig.caption ?? '').slice(0, 300));
        const igTags = ensureHashtags(cleanHashtags(ig.hashtags, 30), brandSlug, lesson.title, 20, 30);

        const out: PromoParsed = {
          linkedin: {
            hook: liHook,
            body: liBody,
            cta:  liCta,
            hashtags: liTags,
            full_text: [liHook, liBody, liCta, footer, joinTags(liTags)].filter(Boolean).join('\n\n'),
          },
          instagram: {
            caption: igCaption,
            hashtags: igTags,
            full_text: [igCaption, footer, joinTags(igTags)].filter(Boolean).join('\n\n'),
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
