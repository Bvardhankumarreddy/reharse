import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NewsItem } from '../entities/news-item.entity';
import { NewsScore } from '../entities/news-score.entity';
import { ShortScript, AvatarKey } from '../entities/short-script.entity';
import { OpenAIClientService } from './openai-client.service';
import { ThumbnailPromptService } from './thumbnail-prompt.service';
import { DistributionPackageService } from './distribution-package.service';

const SCRIPT_SYSTEM_PROMPT = `
You write YouTube Shorts scripts for AetherStackAI — an Indian AI
education channel hosted by Vardhan. The series is called "AI Quick Bytes"
— a daily AI insight series with sequential day numbering.

BRAND VOICE:
- Conversational, like explaining to a friend
- Slightly mysterious / curious tone
- Indian English audience
- Use phrases like "Spoiler:", "Plot twist:", "Here's the thing"
- 30-45 seconds total (90-130 words)

═══════════════════════════════════════
MANDATORY OPENING (USE PROVIDED DAY NUMBER)
═══════════════════════════════════════

Choose ONE of these 5 opening variations based on day number rotation:

Variation 1: "Welcome to Day [X] of AI Quick Bytes."
Variation 2: "Day [X] of AI Quick Bytes — let's go."
Variation 3: "It's Day [X]. Today's AI byte:"
Variation 4: "Welcome back to AI Quick Bytes. Day [X]."
Variation 5: "Day [X]. One AI thing you should know today."

Rules:
- ALWAYS replace [X] with the actual day number provided
- ALWAYS add [1 sec pause] after the opening
- Use the variation number the user prompt tells you to prefer

═══════════════════════════════════════
SCRIPT STRUCTURE (FIXED)
═══════════════════════════════════════

1. OPENING (0-3 sec): The Day [X] welcome from the list + [1 sec pause]
2. HOOK (3-8 sec): Question, surprising fact, or bold statement
3. BODY (8-35 sec): The actual news/fact/tip + clear "why it matters"
4. CTA (35-45 sec): Subscribe / Follow / Comment prompt

═══════════════════════════════════════
PAUSE MARKERS (CRITICAL)
═══════════════════════════════════════

- [1 sec pause] after impact lines and transitions
- [2 sec pause] before reveals or key insights

═══════════════════════════════════════
CONTENT RULES
═══════════════════════════════════════

DO: explain jargon simply; connect every fact to "what this means for you";
stay factually accurate; Indian-English-friendly; end with a strong CTA.
DON'T: clickbait that doesn't deliver; opinions as facts; unexplained jargon;
skip the Day [X] opening; forget pause markers.

═══════════════════════════════════════
CTA ROTATION (PICK ONE FITTING THE CONTENT)
═══════════════════════════════════════

News:  "Subscribe for daily AI insights." / "Follow for daily AI breakdowns."
Facts: "Subscribe for daily AI facts that change perspectives."
Tips:  "Follow for daily AI productivity hacks." / "Subscribe — more AI prompts that actually work."

═══════════════════════════════════════
OUTPUT FORMAT (STRICT JSON ONLY)
═══════════════════════════════════════

{
  "day_number": <integer, exactly the day number provided>,
  "opening": "<the Day [X] welcome line you chose>",
  "opening_variation_used": <integer 1-5>,
  "hook": "<the 5-second hook after the opening>",
  "body": "<25-30 second main content with [pause] markers>",
  "cta": "<5-10 second call to action>",
  "full_script": "<complete script: opening + hook + body + cta, all pause markers, ready to paste into HeyGen>",
  "duration_estimate": <total seconds, integer>,
  "brand_voice_score": <1-100>
}
`.trim();

interface ScriptResponse {
  day_number?: number;
  opening?: string;
  opening_variation_used?: number;
  hook: string;
  body: string;
  cta: string;
  full_script?: string;
  duration_estimate: number;
  brand_voice_score: number;
}

@Injectable()
export class ScriptGeneratorService {
  private readonly logger = new Logger(ScriptGeneratorService.name);

  constructor(
    @InjectRepository(NewsItem)
    private readonly itemRepo: Repository<NewsItem>,
    @InjectRepository(NewsScore)
    private readonly scoreRepo: Repository<NewsScore>,
    @InjectRepository(ShortScript)
    private readonly scriptRepo: Repository<ShortScript>,
    private readonly openai: OpenAIClientService,
    private readonly config: ConfigService,
    private readonly thumbnail: ThumbnailPromptService,
    private readonly distribution: DistributionPackageService,
  ) {}

  async generateScript(itemId: string): Promise<ShortScript> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId },
      relations: ['source'],
    });
    if (!item) throw new Error(`News item ${itemId} not found`);

    const score = await this.scoreRepo.findOne({ where: { newsItemId: itemId } });
    const model = this.config.get<string>('aiQuickBytes.openai.scriptModel') ?? 'gpt-4o';
    const dayNumber = await this.getNextDayNumber();

    const completion = await this.openai.getClient().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
        { role: 'user', content: this.buildPrompt(item, score, dayNumber) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as ScriptResponse;
    const cost = this.calcCost(model, completion.usage);
    const avatarId = this.assignAvatar(item);
    // Prefer the LLM's assembled full_script (opening baked in); fall back to
    // assembling it ourselves so a malformed response can't yield an empty script.
    const fullScript =
      parsed.full_script?.trim() ||
      [parsed.opening, parsed.hook, parsed.body, parsed.cta]
        .filter(Boolean)
        .join('\n\n');

    const script = await this.scriptRepo.save(this.scriptRepo.create({
      newsItemId: itemId,
      dayNumber,
      hook: parsed.hook,
      body: parsed.body,
      cta: parsed.cta,
      fullScript,
      durationEstimateSeconds: parsed.duration_estimate ?? null,
      avatarId,
      voiceId: this.config.get<string>('aiQuickBytes.heygen.voiceClone.vardhan') ?? null,
      brandVoiceScore: parsed.brand_voice_score ?? null,
      status: 'draft',
      costUsd: cost,
    }));

    await this.itemRepo.update(itemId, { status: 'scripted' });

    // ── Thumbnail prompt (non-fatal) ───────────────────────────────────
    try {
      const { result, cost_usd } = await this.thumbnail.generate(script, item);
      script.thumbnailPrompt = result;
      script.thumbnailCostUsd = cost_usd;
      script.thumbnailGeneratedAt = new Date();
      await this.scriptRepo.save(script);
    } catch (e) {
      this.logger.error(`Thumbnail prompt failed for ${script.id}: ${(e as Error).message}`);
    }

    // ── Distribution package (non-fatal) ───────────────────────────────
    try {
      const { package: pkg, cost_usd } = await this.distribution.generatePackage(script, item);
      script.distributionPackage = pkg as unknown as Record<string, unknown>;
      script.distributionCostUsd = cost_usd;
      script.distributionGeneratedAt = new Date();
      await this.scriptRepo.save(script);
    } catch (e) {
      this.logger.error(`Distribution package failed for ${script.id}: ${(e as Error).message}`);
    }

    return script;
  }

  /** Generate scripts for the top-scored, not-yet-scripted stories. */
  async generateForTopStories(limit = 3): Promise<number> {
    if (!this.openai.isConfigured()) {
      this.logger.warn('OpenAI not configured — skipping script generation');
      return 0;
    }

    // Scripts must be about timely news — only consider stories published
    // within the freshness window (same knob as ingestion), then rank by
    // score, breaking ties toward the more recent story.
    const maxAgeHours =
      this.config.get<number>('aiQuickBytes.limits.freshnessHours') ?? 48;
    const cutoff = new Date(Date.now() - maxAgeHours * 3600_000);

    const top = await this.itemRepo
      .createQueryBuilder('item')
      .innerJoin(NewsScore, 'score', 'score."newsItemId" = item.id')
      .where('item.status = :status', { status: 'scored' })
      .andWhere(
        '(item."publishedAt" >= :cutoff OR item."publishedAt" IS NULL)',
        { cutoff },
      )
      .orderBy('score."compositeScore"', 'DESC')
      .addOrderBy('item."publishedAt"', 'DESC', 'NULLS LAST')
      .limit(limit)
      .getMany();

    let generated = 0;
    for (const item of top) {
      try {
        await this.generateScript(item.id);
        generated++;
      } catch (e) {
        this.logger.error(`Script gen failed for ${item.id}: ${(e as Error).message}`);
      }
    }
    return generated;
  }

  private assignAvatar(item: NewsItem): AvatarKey {
    const sourceName = item.source?.name ?? '';
    const isNews = ['OpenAI', 'Google', 'Anthropic', 'TechCrunch', 'VentureBeat'].some(
      (n) => sourceName.includes(n),
    );
    const t = item.title.toLowerCase();
    const isFact = sourceName.includes('ArXiv') || t.includes('fact') || t.includes('history');

    if (isNews) return 'cyber';
    if (isFact) return 'robot';
    return 'vardhan';
  }

  /**
   * Next sequential day number. Counts draft too (not just approved) so the
   * batch "Generate Top N" flow — which creates N drafts in a loop with no
   * approval between — produces Day 1, 2, 3… instead of all colliding on 1.
   * A rejected draft therefore "burns" its number; that is intentional and
   * keeps the public series strictly sequential.
   */
  private async getNextDayNumber(): Promise<number> {
    const row = await this.scriptRepo
      .createQueryBuilder('script')
      .select('MAX(script."dayNumber")', 'max')
      .where('script.status IN (:...statuses)', {
        statuses: ['draft', 'approved', 'generating', 'ready', 'published'],
      })
      .andWhere('script."dayNumber" IS NOT NULL')
      .getRawOne<{ max: number | null }>();
    return (Number(row?.max) || 0) + 1;
  }

  private buildPrompt(
    item: NewsItem,
    score: NewsScore | null,
    dayNumber: number,
  ): string {
    const body = item.summary || item.content?.slice(0, 2000) || 'No summary';
    const preferredVariation = (dayNumber % 5) + 1;
    return `DAY NUMBER: ${dayNumber}

NEWS TO ADAPT:
Title: ${item.title}
Source: ${item.source?.name ?? 'unknown'}
Published: ${item.publishedAt?.toISOString() ?? 'unknown'}
Summary: ${body}
Score: ${score?.compositeScore ?? 'n/a'}/100

Create a 30-45 second YouTube Short script in the AetherStackAI brand voice.
Start with a Day ${dayNumber} welcome from the approved opening list.
For Day ${dayNumber}, prefer opening variation #${preferredVariation}.
Set "day_number" to exactly ${dayNumber} in your JSON response.`;
  }

  private calcCost(model: string, usage?: { prompt_tokens?: number; completion_tokens?: number }): number {
    const inTok = usage?.prompt_tokens ?? 0;
    const outTok = usage?.completion_tokens ?? 0;
    const rates: Record<string, [number, number]> = {
      'gpt-4o': [2.5, 10],
      'gpt-4o-mini': [0.15, 0.6],
    };
    const [inRate, outRate] = rates[model] ?? rates['gpt-4o'];
    return (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * outRate;
  }
}
