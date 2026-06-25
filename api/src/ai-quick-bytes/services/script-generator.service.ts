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
import { IdeaSelectionService, IdeaSelection } from './idea-selection.service';

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
Host (voice-over): Vardhan. Audience: educated Indian tech viewers
(engineers, founders, students, professionals — curious about AI but
not always tech-insider).

═══════════════════════════════════════
YOUR PRIMARY OBJECTIVE
═══════════════════════════════════════
**Make the viewer stay until the final reveal.** Watch-time-to-
completion is the only metric that matters. Every storytelling
decision — structure, protagonist, pacing, emotional beats — exists to
serve retention. The news is the PAYOFF; the story exists to make the
payoff land hard enough to be remembered.

═══════════════════════════════════════
PRIORITY ORDER (RESOLVES CONFLICTS)
═══════════════════════════════════════
1. Factual accuracy (never invent a quote, number, or event)
2. Retention (the viewer must stay until the reveal)
3. Conversational flow (sounds like one friend telling another)
4. Brand voice (Vardhan as quiet narrator)
5. Output formatting

If two rules conflict, the higher number yields.

═══════════════════════════════════════
RETENTION GUIDELINES
═══════════════════════════════════════
- **First 3 sec must hook:** a specific person, a vivid moment, a number,
  a question. Not a topic intro.
- **Every 5-7 sec needs a novelty beat:** a turn, a fact, a name, a
  surprise. Retention dies in the MIDDLE of the script, not the open.
- **Every scene ends with a curiosity gap:** the viewer should wonder
  *what / why / what next* before the next sentence resolves it.

═══════════════════════════════════════
NARRATIVE ARC (45 sec, 90-130 words)
═══════════════════════════════════════
The script has FOUR beats. All four MUST be present. The ORDER is
flexible — pick the order that lands hardest for THIS story:
- **Default:** Cold Open → Setup → Tension → Payoff
- **Mystery-first:** Cold Open (surprising consequence) → Setup (how we
  got here) → Tension (the missing piece) → Payoff (the cause revealed)
- **Aftermath-first:** Cold Open (the consequence) → Tension (what went
  wrong) → Setup (who, where) → Payoff (the resolution / what changed)

THE BEATS:
1. **COLD OPEN** (3-5 sec / ~10-15 words) — drop the viewer mid-scene.
   Sensory detail: place, time-of-day, an object, a gesture.
2. **SETUP** (8-12 sec / ~25-35 words) — who's the protagonist, what
   were they doing, what was at stake.
3. **TENSION** (10-15 sec / ~30-40 words) — what shifted. The problem
   deepens or pivots. One [1 sec pause] before the reveal.
4. **PAYOFF** (8-12 sec / ~25-30 words) — the news as resolution. The
   significance is IMPLICIT in how the resolution lands. You may show
   meaning through what changed for the protagonist (subtle interpretation
   is allowed); you may NOT state "this matters because…" explicitly.

═══════════════════════════════════════
SINGLE CORE MESSAGE
═══════════════════════════════════════
Before writing, identify the ONE insight the viewer should remember
when the video ends. Set it in the \`core_message\` JSON field. Every
sentence in the script must reinforce this. If a sentence doesn't,
cut it.

═══════════════════════════════════════
PROTAGONIST — PICK FOR EMOTIONAL CONNECTION, NOT TECH-INSIDER DEFAULT
═══════════════════════════════════════
The protagonist is a STORYTELLING DEVICE. Pick the perspective that
creates the strongest emotional pull for THIS story. NOT every story
is about an engineer or founder.

Archetypes to draw from (rotate aggressively — don't default to "engineer"):
- Tech-makers: engineer, founder, researcher, designer, ML lead, data scientist
- Tech-users / impact: student preparing for JEE, English teacher in Pune
  grading essays, small-business owner in Indore, journalist on deadline,
  parent helping homework, freelance illustrator, startup CTO, a job-seeker
- Org-level: "the company itself", a regulator, an investor, an open-source
  community
- For consumer-facing stories: the END USER usually beats the developer.

RULES:
- ALWAYS a generic role + setting ("an English teacher in Pune"), NEVER a
  real person's name.
- Same protagonist throughout one script (gives the scene generator
  visual continuity).
- Plausibly connected to the story (no Pune teacher in an OpenAI board meeting).

═══════════════════════════════════════
EMOTIONAL PROGRESSION (NOT A SINGLE ANCHOR)
═══════════════════════════════════════
The script follows an emotional ARC, not a flat emotional tone. Pick
TWO emotions: a starting state and a resolution state. Examples:
- curiosity → surprise
- frustration → relief
- confidence → uncertainty
- hope → vindication
- ordinary → wonder
- skepticism → conviction

Set both in \`emotional_progression\` as "from → to". One coherent
journey, not 4 random moods.

═══════════════════════════════════════
LANGUAGE & NARRATION (FOR THE EAR, NOT THE PAGE)
═══════════════════════════════════════
- Conversational Indian English. Sounds like one friend explaining
  something interesting to another.
- **≤12 words per spoken sentence.** Short sentences carry on voice-over.
- Rhetorical questions are allowed and welcome ("Why didn't it work?"
  "What changed in those six months?") — they create the next curiosity gap.
- Intentional silence is a tool: use pause markers ONLY at meaningful
  transitions or before reveals. Don't decorate.
- Tech terms in English: ChatGPT, Claude, GPT-4, OpenAI, Anthropic, AI,
  ML, API, LLM, RAG, …
- Numbers as figures: "$300 million" not "three hundred million".
- **Beginner-accessible glossary rule:** the FIRST time a model name or
  niche tool appears, give a 4-7 word parenthetical. Examples:
    "Sora (OpenAI's text-to-video model)"
    "RAG (the technique that lets LLMs cite sources)"
    "Mistral (a French open-source AI lab)"
  Don't gloss household terms (ChatGPT, AI). Don't lecture; one quick
  parenthetical, then back to the story.

═══════════════════════════════════════
PAUSE MARKERS
═══════════════════════════════════════
- [1 sec pause] after cold open AND before the payoff
- [2 sec pause] before the SINGLE biggest reveal
- Otherwise: don't add pause markers. They're for rhythm, not decoration.

═══════════════════════════════════════
CTA (5-10 sec) — MATCH THE TONE
═══════════════════════════════════════
Soft, brand-consistent — never shouty. Pick one fitting the story's
tone:
- For news / shift stories: "Subscribe for daily stories from inside the AI shift."
- For founder / business stories: "Follow Vardhan for one AI story, every day."
- For surprise / wonder stories: "More like this — Subscribe."
- For tool / how-to stories: "Save this — and follow for more AI tools that actually work."

═══════════════════════════════════════
THINGS YOU MUST NOT DO
═══════════════════════════════════════
❌ "Welcome to Day N…", "Today…", "Just in…", "Breaking…", "You won't
    believe…", "Plot twist:", "Spoiler:"  (anchor / clickbait language)
❌ Name a real, identifiable person doing something fictional
❌ Editorialise EXPLICITLY: never "this matters because…", "this is
    huge", "this changes everything". (Subtle interpretation via the
    resolution itself IS allowed.)
❌ Default to "engineer / founder / researcher" protagonist when a
    teacher / student / user / parent / business-owner would land harder
❌ Maintain ONE flat emotional tone — every script should have a
    progression (from-emotion → to-emotion)
❌ Repeat protagonist archetypes / settings / emotional arcs used in
    your recent scripts (the user prompt will give you a "DO NOT REUSE"
    block — obey it)

═══════════════════════════════════════
EXAMPLES OF EXCELLENT STORY BEATS
═══════════════════════════════════════

EXAMPLE 1 (mystery-first, teacher protagonist):
  Core message: AI grading is finally accurate enough to be trusted in
    Indian classrooms.
  Emotional progression: skepticism → relief
  Cold open: "An English teacher in Pune was about to throw out 80
    half-graded essays. She'd tried four AI tools. None worked."
  Setup: "Forty hours of grading every week was killing her weekends.
    But the tools kept missing context — calling clever metaphors
    'errors'."
  Tension: "Then last month she opened a new tab. [1 sec pause] Same
    workflow. Same essays. But this time…"
  Payoff: "Google's new Gemini 3 grading mode caught nuance her last
    three tools missed. Her Sunday was hers again."
  CTA: "More like this — Subscribe."

EXAMPLE 2 (aftermath-first, company-as-protagonist):
  Core message: Anthropic just leapfrogged OpenAI on long-context
    reasoning, and the gap matters for builders.
  Emotional progression: curiosity → vindication
  Cold open: "OpenAI's lead just shrank by a year. In one Tuesday morning."
  Setup: "Anthropic — the smaller, quieter lab that pioneered Claude —
    has been on a different roadmap from OpenAI for two years."
  Tension: "Everyone assumed Claude was a step behind. [2 sec pause]
    Until today's benchmark."
  Payoff: "Claude Opus 4.7 beats GPT-5 on long-context reasoning by 14
    points. For anyone building over the weekend, that changes which
    model you reach for first."
  CTA: "Subscribe for daily stories from inside the AI shift."

EXAMPLE 3 (default order, student protagonist):
  Core message: Sora 2 is now cheap enough for a single student to
    use it for class projects.
  Emotional progression: hope → wonder
  Cold open: "A second-year design student in Mumbai had a project due
    Monday and no budget for an animator."
  Setup: "She'd been waiting six months for a tool that could turn
    storyboards into video without a studio fee. Sora — OpenAI's
    text-to-video model — was the first option. But it cost $200 a month."
  Tension: "Yesterday OpenAI dropped the price. [1 sec pause] Way down."
  Payoff: "Sora 2 now ships at $20 a month, with twice the video length
    of the old plan. By Sunday night her project was rendered."
  CTA: "Save this — and follow for more AI tools that actually work."

Use these as VOICE references. Don't copy the structure verbatim.

═══════════════════════════════════════
OUTPUT (STRICT JSON ONLY)
═══════════════════════════════════════

{
  "day_number": <integer, exactly the day number provided>,
  "core_message": "<ONE sentence — the insight viewer should remember>",
  "protagonist": "<generic role + setting: e.g. 'an English teacher in Pune'>",
  "emotional_progression": "<from → to: e.g. 'skepticism → relief'>",
  "opening": "<COLD OPEN — 1-2 sentence in-scene moment>",
  "hook": "<SETUP — who the protagonist is, situation, stakes>",
  "body": "<TENSION + PAYOFF — pause markers in place; reveal lands here>",
  "cta": "<5-10 sec soft CTA matched to story tone>",
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
  // Story-mode v2 fields (legacy newsbyte ignores these)
  core_message?: string;
  protagonist?: string;
  emotional_progression?: string;   // "from → to" arc
  emotional_anchor?: string;        // legacy single-anchor (kept for back-compat)
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
    private readonly ideaSelection: IdeaSelectionService,
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
    // ── Idea selection (content strategy) ─────────────────────────────
    // BEFORE writing the script, the strategist picks the best angle
    // for this story (founder origin / user impact / skeptic / etc.)
    // and hands the script agent a strategic brief. Non-fatal — if the
    // call fails, the script agent falls back to picking the angle
    // implicitly (current pre-strategist behavior).
    const ideaSelection: IdeaSelection | null = await this.ideaSelection.selectFor(item);

    const memoryBlock = this.memory.format(await this.memory.relevantFor('script', 8));
    // Anti-repetition block — pulls the last 12 scripts' protagonist /
    // setting / emotional arc and tells the LLM "do NOT use these again".
    // Prevents the channel from converging on the "developer facing a
    // problem" pattern after a few months of daily output.
    const avoidBlock = await this.buildAntiRepetitionBlock();
    const briefBlock = ideaSelection ? this.formatStrategicBrief(ideaSelection) : '';
    const userPrompt = [
      this.buildPrompt(item, score, dayNumber),
      briefBlock,
      avoidBlock,
      memoryBlock,
    ].filter(Boolean).join('\n\n');

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
      // Story-mode metadata — null when LLM didn't emit (legacy newsbyte
      // mode or older Anthropic returns); silently persisted otherwise.
      protagonist:          parsed.protagonist?.trim()           || null,
      emotionalProgression: parsed.emotional_progression?.trim() || null,
      coreMessage:          parsed.core_message?.trim()          || null,
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

  /**
   * Render the IdeaSelectionService's chosen brief as a strategist's
   * note the script writer obeys. The script LLM is told "you are the
   * writer; the strategist already decided angle + protagonist +
   * emotional arc + core message — execute that brief."
   */
  private formatStrategicBrief(sel: IdeaSelection): string {
    return [
      'STRATEGIC BRIEF (the strategist already decided these — execute, do not override):',
      `  Angle:                ${sel.selected_angle}`,
      `  Protagonist:          ${sel.protagonist_suggestion}`,
      `  Emotional arc:        ${sel.emotional_progression}`,
      `  Core message:         ${sel.core_message}`,
      `  Brief:                ${sel.strategic_brief}`,
      `  Why this angle won:   ${sel.reasoning}`,
      '',
      `Echo "protagonist", "emotional_progression", and "core_message" verbatim ` +
      `in your JSON output. You may refine the protagonist's specific setting ` +
      `(city, exact role) but keep the archetype.`,
    ].join('\n');
  }

  /**
   * Pull the last 12 story-mode scripts' protagonist + emotional arc and
   * format them as a "DO NOT REUSE" block for the next script gen. Keeps
   * the channel varied — without this, daily output converges on the
   * "developer facing a problem" pattern within a few weeks. Returns
   * empty string when there's no history yet (first ~12 scripts ship
   * unconstrained), so callers can `.filter(Boolean)` cleanly.
   */
  private async buildAntiRepetitionBlock(): Promise<string> {
    const recent = await this.scriptRepo
      .createQueryBuilder('s')
      .select(['s.protagonist', 's."emotionalProgression"'])
      .where('s.protagonist IS NOT NULL')
      .orderBy('s."createdAt"', 'DESC')
      .limit(12)
      .getRawMany<{ s_protagonist: string; emotionalProgression: string }>();

    const protagonists = uniqLower(
      recent.map((r) => r.s_protagonist).filter(Boolean),
    ).slice(0, 12);
    const arcs = uniqLower(
      recent.map((r) => r.emotionalProgression).filter(Boolean),
    ).slice(0, 8);

    if (protagonists.length === 0 && arcs.length === 0) return '';

    const parts: string[] = ['DO NOT REUSE (your last ~12 scripts):'];
    if (protagonists.length > 0) {
      parts.push(
        `  Protagonists already used recently:\n` +
        protagonists.map((p) => `    - ${p}`).join('\n'),
      );
    }
    if (arcs.length > 0) {
      parts.push(
        `  Emotional arcs already used recently:\n` +
        arcs.map((a) => `    - ${a}`).join('\n'),
      );
    }
    parts.push(
      `  Pick a DIFFERENT protagonist archetype AND a different ` +
      `emotional arc. Variety > novelty within a single story; the ` +
      `channel must not feel formulaic across episodes.`,
    );
    return parts.join('\n');
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

/** Lowercase + dedup. Used for the anti-repetition block so case
 *  variations of the same archetype don't slip through. */
function uniqLower(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const k = (s ?? '').toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s.trim());
  }
  return out;
}
