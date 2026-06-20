import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NewsItem } from '../entities/news-item.entity';
import { NewsScore } from '../entities/news-score.entity';
import { ShortScript, AvatarKey } from '../entities/short-script.entity';
import { AnthropicClientService } from './anthropic-client.service';
import { ThumbnailPromptService } from './thumbnail-prompt.service';
import { DistributionPackageService } from './distribution-package.service';
import { AqbMemoryService } from './aqb-memory.service';
import { TranslationService } from './translation.service';
import { QuoteBankService } from './quote-bank.service';

// ──────────────────────────────────────────────────────────────────────
// STORY MODE — narrative arc, cold open, scene-friendly
// ──────────────────────────────────────────────────────────────────────
// The default. The news is the PAYOFF of a tiny story, not a bullet
// read by an anchor. This lets the scene generator (separate service)
// break each script into 12-18 cinematic posters — one per beat.
//
// Selected via AQB_SCRIPT_STYLE=story (default). Set =newsbyte to fall
// back to the legacy prompt below if a story-mode script ever feels off.
const SCRIPT_SYSTEM_PROMPT_STORY = `
You write 30-45 second narrative YouTube Shorts for AetherStackAI's
"AI Quick Bytes" series — daily AI news, told as miniature stories.
Host (voice-over): Vardhan. Audience: educated Indian tech viewers.

═══════════════════════════════════════
THIS IS NOT AN ANCHOR READING NEWS
═══════════════════════════════════════
You are NOT a news anchor. You are a quiet narrator dropping the viewer
mid-scene. The news is the PAYOFF — the resolution to a tiny story you
set up first. Cold open. Build tension. Reveal.

No "Today in AI news." No "Welcome back." No "Day N." No "Breaking."
Start INSIDE a moment.

═══════════════════════════════════════
NARRATIVE ARC (45 sec, 90-130 words)
═══════════════════════════════════════
1. COLD OPEN (3-5 sec / ~10-15 words)
   - Drop the viewer into a scene. A specific person. A specific moment.
   - Sensory detail: a place, a time-of-day, an object, a gesture.
   - Examples:
     ✅ "Three months ago, an engineer at Anthropic was stuck on the same bug for the eleventh time."
     ✅ "It's 2 a.m. in Bangalore. A startup founder is reading the same email for the fifth time."
     ❌ "OpenAI announced a new model today."
     ❌ "Welcome to AI Quick Bytes."

2. SETUP (8-12 sec / ~25-35 words)
   - Who is the protagonist (profession only, NEVER a name).
   - What were they doing. What was at stake. What did they want.

3. TENSION (10-15 sec / ~30-40 words)
   - What changed. The problem deepens or shifts.
   - One [1 sec pause] for breathing room before the reveal.

4. PAYOFF (8-12 sec / ~25-30 words)
   - The news itself, framed as the resolution. The "why it matters"
     is implicit in how the resolution lands — never explicitly state
     "this matters because…".

═══════════════════════════════════════
PROTAGONIST RULES (LIKENESS-SAFE)
═══════════════════════════════════════
- ALWAYS a generic role + setting: "an engineer at Anthropic", "a
  founder in Bangalore", "a researcher at DeepMind", "a developer in
  Hyderabad". NEVER a real person's name.
- Same protagonist throughout one script — gives the scene generator
  visual continuity to work with.
- Pick a role that's PLAUSIBLY connected to the story (don't put a
  Bangalore founder in an OpenAI press conference).

═══════════════════════════════════════
LANGUAGE
═══════════════════════════════════════
- Conversational Indian English, calm narrator voice.
- Tech terms in English: ChatGPT, Claude, GPT-4, OpenAI, Anthropic,
  AI, ML, API, LLM, …
- Numbers as figures (e.g. "$300 million", not "three hundred million").
- One emotional anchor per script (frustration / awe / hope / fear /
  curiosity) — tone matches throughout.

═══════════════════════════════════════
PAUSE MARKERS (FOR THE READER)
═══════════════════════════════════════
- [1 sec pause] after cold open AND before the payoff
- [2 sec pause] before the single biggest reveal

═══════════════════════════════════════
CTA (5-10 sec)
═══════════════════════════════════════
Soft, brand-consistent — never shouty. Pick one fitting the tone:
- "Subscribe for daily stories from inside the AI shift."
- "Follow Vardhan for one AI story, every day."
- "More like this — Subscribe."

═══════════════════════════════════════
THINGS YOU MUST NOT DO
═══════════════════════════════════════
❌ "Welcome to Day N…", "Today…", "Just in…", "Breaking…", "You won't
    believe…", "Plot twist:", "Spoiler:"  (anchor / clickbait language)
❌ Name a real, identifiable person doing something fictional
❌ Editorialise: never "this matters because…", "this is huge", "this
    changes everything"
❌ Skip the cold open and start with the news

═══════════════════════════════════════
OUTPUT (STRICT JSON ONLY)
═══════════════════════════════════════

{
  "day_number": <integer, exactly the day number provided>,
  "protagonist": "<one line: e.g. 'an engineer at Anthropic'>",
  "emotional_anchor": "<one word: frustration | awe | hope | fear | curiosity>",
  "opening": "<COLD OPEN — the 1-2 sentence in-scene moment>",
  "hook": "<SETUP — who the protagonist is, situation, stakes>",
  "body": "<TENSION + PAYOFF — pause markers in place; reveal lands here>",
  "cta": "<5-10 sec soft CTA>",
  "full_script": "<assembled: opening + hook + body + cta, pause markers preserved>",
  "duration_estimate": <total seconds, integer>,
  "brand_voice_score": <1-100>
}
`.trim();

// ──────────────────────────────────────────────────────────────────────
// LEGACY NEWSBYTE MODE — kept as fallback (AQB_SCRIPT_STYLE=newsbyte)
// ──────────────────────────────────────────────────────────────────────
const SCRIPT_SYSTEM_PROMPT_NEWSBYTE = `
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
    private readonly anthropic: AnthropicClientService,
    private readonly config: ConfigService,
    private readonly thumbnail: ThumbnailPromptService,
    private readonly distribution: DistributionPackageService,
    private readonly memory: AqbMemoryService,
    private readonly translation: TranslationService,
    private readonly quotes: QuoteBankService,
  ) {}

  async generateScript(itemId: string): Promise<ShortScript> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId },
      relations: ['source'],
    });
    if (!item) throw new Error(`News item ${itemId} not found`);

    const score = await this.scoreRepo.findOne({ where: { newsItemId: itemId } });
    const dayNumber = await this.getNextDayNumber();

    // Learning-loop block (empty until AqbMemory has script patterns).
    const memoryBlock = this.memory.format(await this.memory.relevantFor('script', 8));
    const userPrompt = memoryBlock
      ? `${this.buildPrompt(item, score, dayNumber)}\n\n${memoryBlock}`
      : this.buildPrompt(item, score, dayNumber);

    const style = this.config.get<'story' | 'newsbyte'>('aiQuickBytes.scriptStyle') ?? 'story';
    const systemPrompt = style === 'newsbyte'
      ? SCRIPT_SYSTEM_PROMPT_NEWSBYTE
      : SCRIPT_SYSTEM_PROMPT_STORY;

    const { content: raw, usage, model } = await this.anthropic.completeJSON({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.8,
      maxTokens: 2000,
    });

    const parsed = JSON.parse(raw || '{}') as ScriptResponse;
    const cost = this.calcCost(model, usage);
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

    const pickCtx = {
      title: item.title,
      hook:  script.hook,
      body:  script.body,
    };

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

    // ── English distribution package ──────────────────────────────────
    // INTENTIONALLY NOT auto-generated at script creation. The curator
    // triggers per-platform generation manually from the admin UI's
    // "🔄 Regenerate (N)" button (shipped in 63cf95c — supports
    // per-platform checkboxes). Reasons:
    //   1) Rejected scripts no longer waste ~$0.04 each on distribution
    //   2) Curator may only post to 2-3 platforms, not all 5
    //   3) Copy stays fresh — generated right before publish, not 3
    //      days earlier in the queue
    // The existing /approval/:id/distribution/regenerate endpoint
    // handles BOTH first-time create and subsequent refreshes — admin
    // UI's "No distribution package yet" prompt covers the empty state.

    // ── Telugu translation (non-fatal — English ships regardless) ──────
    if (this.translation.isConfigured()) {
      try {
        const t = await this.translation.translateToTelugu({
          hook: script.hook,
          body: script.body,
          cta: script.cta,
          fullScript: script.fullScript,
        });
        script.teluguHook = t.teluguHook;
        script.teluguBody = t.teluguBody;
        script.teluguCta = t.teluguCta;
        script.teluguFullScript = t.teluguFullScript;
        script.teluguTranslationModel = t.model;
        script.teluguTranslationCostUsd = t.costUsd;
        script.teluguTranslatedAt = new Date();
        await this.scriptRepo.save(script);

        // ── Telugu closing quote (NATIVE — from te bank) ──────────────
        // The Telugu translator above ran over a clean English script
        // (no quote yet — we inject English last on purpose), so the
        // Telugu output has no translated-English-quote line to strip.
        // Pick a native Telugu quote (Vemana / Sumati / Annamayya / Sri Sri /
        // Kalam / etc.) and splice a Telugu framing line in. Non-fatal —
        // an empty Telugu bank just means the Telugu video ships without
        // a closing quote.
        try {
          const tePicked = await this.quotes.pickFor('te', pickCtx);
          if (tePicked) {
            const teClosingLine = await this.quotes.composeClosingLine(tePicked, pickCtx);
            const newTeFull = injectQuoteIntoFull(
              script.teluguFullScript ?? '',
              script.teluguCta ?? '',
              teClosingLine,
            );
            script.teluguClosingQuoteId     = tePicked.id;
            script.teluguClosingQuoteText   = tePicked.text;
            script.teluguClosingQuoteAuthor = tePicked.author;
            script.teluguFullScript         = newTeFull;
            await this.scriptRepo.save(script);
          }
        } catch (e) {
          this.logger.error(
            `Telugu closing-quote pick failed for ${script.id}: ${(e as Error).message}`,
          );
        }

        // Telugu distribution package — only when AQB_TELUGU_FULL_TRACK is
        // on. Default is OFF so the host only gets the translated script
        // (recorded manually); the 5 Telugu social posts are an opt-in
        // extra. Manual regen endpoint still works either way.
        const autoTeluguDist =
          this.config.get<boolean>('aiQuickBytes.telugu.autoDistribution') ?? false;
        if (autoTeluguDist) {
          try {
            const { package: tePkg, cost_usd: teDistCost } =
              await this.distribution.generatePackage(script, item, 'te');
            script.teluguDistributionPackage =
              tePkg as unknown as Record<string, unknown>;
            script.distributionCostUsd =
              Number(script.distributionCostUsd ?? 0) + teDistCost;
            await this.scriptRepo.save(script);
          } catch (e) {
            this.logger.error(
              `Telugu distribution package failed for ${script.id}: ${(e as Error).message}`,
            );
          }
        }
      } catch (e) {
        this.logger.error(`Telugu translation failed for ${script.id}: ${(e as Error).message}`);
      }
    }

    // ── English closing quote (NATIVE — from en bank) ──────────────────
    // Done LAST so the Telugu translator never sees the English quote
    // line — otherwise Telugu inherits a translated English quote, which
    // defeats the whole point of having a native Telugu poet's quote on
    // the Telugu video. Non-fatal — an empty English bank means the
    // English video ships without a closing quote.
    try {
      const enPicked = await this.quotes.pickFor('en', pickCtx);
      if (enPicked) {
        const enClosingLine = await this.quotes.composeClosingLine(enPicked, pickCtx);
        const newFull = injectQuoteIntoFull(script.fullScript, script.cta, enClosingLine);
        script.closingQuoteId     = enPicked.id;
        script.closingQuoteText   = enPicked.text;
        script.closingQuoteAuthor = enPicked.author;
        script.fullScript         = newFull;
        await this.scriptRepo.save(script);
      }
    } catch (e) {
      this.logger.error(`English closing-quote pick failed for ${script.id}: ${(e as Error).message}`);
    }

    return script;
  }

  /** Generate scripts for the top-scored, not-yet-scripted stories. */
  async generateForTopStories(limit = 3): Promise<number> {
    if (!this.anthropic.isConfigured()) {
      this.logger.warn('Anthropic not configured — skipping script generation');
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
    // USD per 1M tokens [input, output].
    const rates: Record<string, [number, number]> = {
      'claude-sonnet-4-6': [3, 15],
      'claude-opus-4-7': [15, 75],
      'claude-haiku-4-5-20251001': [1, 5],
      'gpt-4o': [2.5, 10],
      'gpt-4o-mini': [0.15, 0.6],
    };
    const [inRate, outRate] = rates[model] ?? rates['claude-sonnet-4-6'];
    return (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * outRate;
  }
}

// ── Closing-quote helpers (module-private) ────────────────────────────

/**
 * Splice the closing line between body and CTA in the assembled fullScript.
 * Strategy:
 *   1. Try to find the exact CTA block as a substring and insert before it.
 *   2. If the CTA wasn't found verbatim (LLM rewrote it inline), append
 *      the closing line just before the LAST paragraph (the CTA tends to
 *      be the last block).
 *   3. If the script is one long blob with no paragraph breaks, append
 *      the closing line at the very end — better to have it land slightly
 *      misplaced than not at all.
 */
function injectQuoteIntoFull(fullScript: string, cta: string, closingLine: string): string {
  const fs = fullScript.trim();
  if (!fs) return closingLine;

  if (cta && fs.includes(cta)) {
    return fs.replace(cta, `${closingLine}\n\n${cta}`);
  }
  const parts = fs.split(/\n\s*\n/);
  if (parts.length >= 2) {
    parts.splice(parts.length - 1, 0, closingLine);
    return parts.join('\n\n');
  }
  return `${fs}\n\n${closingLine}`;
}
