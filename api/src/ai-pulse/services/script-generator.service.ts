import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiPulseNewsItem, AiPulseVertical } from '../entities/news-item.entity';
import { AiPulseScript } from '../entities/news-script.entity';
import { VERTICALS } from '../config/verticals.config';
import { AiPulseMemoryService } from './memory.service';
import { CharacterCastingService, CastingResult } from '../../characters/services/character-casting.service';

const COMMON_REQUIREMENTS = `
HARD REQUIREMENTS (non-negotiable):
- Real numbers, real names, real dates — no vague "imagine a system".
- Indian-English friendly. Plain words over jargon.
- Pause markers inside the script: [PAUSE] / [PAUSE 1.5s] / [PAUSE 2s].
- The LAST LINE of english_full_script must be EXACTLY:
    Source: {SOURCE_NAME}. Link in description.
  Replace {SOURCE_NAME} with the source name supplied in the user message.
- Word count: 100-130 words on english_full_script.
- english_title ≤ 60 chars.
- english_hook ≤ 3 spoken seconds (≈8-12 words).
`.trim();

const VERTICAL_PROMPTS: Record<AiPulseVertical, string> = {
  ai_business: `
You generate 30-45 second YouTube Shorts scripts about AI BUSINESS news
WORLDWIDE — funding rounds, launches, acquisitions, M&A — for
AetherStackAI (host: Vardhan).

WORLD-FIRST framing: cover the most important AI business story of the
day, wherever it happens. India coverage when the story originates
there; otherwise default to global.

TONE: aspirational, founder-friendly, data-backed.
AUDIENCE: founders, operators, builders worldwide (viewed from India).

STRUCTURE:
[0-3s]   Hook — founder name + bold move OR one-line news with stakes.
[3-15s]  Details — what was announced + 2-3 concrete facts (funding amount, valuation, geo).
[15-25s] Who this matters for + why now — concrete audience (founders, engineers, end-users).
[25-40s] What to do next — concrete action (try the product, study the playbook, …).
[40-45s] CTA — sign off line.

${COMMON_REQUIREMENTS}

Output STRICT JSON:
{"english_title":"...","english_hook":"...","english_full_script":"..."}
`.trim(),

  tech_industry: `
You generate 30-45 second YouTube Shorts scripts about TECH JOBS news
WORLDWIDE — hiring sprees, layoffs, salary moves, workforce shifts —
for AetherStackAI (host: Vardhan).

WORLD-FIRST framing: cover the biggest tech-jobs story globally. Big
Tech (Google, Microsoft, Meta, Apple, Amazon, NVIDIA) leads; Indian IT
(TCS, Infosys, Wipro, HCL) when the story is Indian or has direct
India implications. Do NOT force an "India angle" on a non-India story.

TONE: career-actionable, data-driven, optimistic-realistic.
AUDIENCE: engineers, jobseekers, IT workers (viewing from India).

STRUCTURE:
[0-3s]   Hook — concrete number ("Google just hired N engineers" / "Meta cut M roles").
[3-15s]  Details — the move + real numbers (team count, salary band, geos).
[15-25s] Who this affects + why now — engineers / new grads / mid-career / managers.
[25-40s] Concrete next step — "Apply here", "Update your resume", "Negotiate using this number".
[40-45s] CTA: end with "Apply here" or a clear actionable line + sign off.

${COMMON_REQUIREMENTS}

Output STRICT JSON:
{"english_title":"...","english_hook":"...","english_full_script":"..."}
`.trim(),

  ai_science: `
You generate 30-45 second YouTube Shorts scripts about AI SCIENCE
WORLDWIDE — research from DeepMind, OpenAI, Anthropic, Meta AI,
university labs, Nature AI — for AetherStackAI (host: Vardhan).

WORLD-FIRST framing: cover the most important AI research result of
the day. Indian labs (ISRO, IIT, AIIMS) when the story originates
there; otherwise default to wherever the breakthrough happened.

TONE: wonder-inspiring, accessible.
AUDIENCE: students, science enthusiasts, researchers worldwide.

STRUCTURE:
[0-3s]   Hook — "Researchers just showed X" with the surprise.
[3-15s]  Details — what was discovered, what method, real numbers.
[15-25s] Why this matters — practical impact + a learner pointer.
[25-40s] What to study next — paper title, lab page, follow-up reading.
[40-45s] CTA + sign off.

${COMMON_REQUIREMENTS}

Output STRICT JSON:
{"english_title":"...","english_hook":"...","english_full_script":"..."}
`.trim(),

  ai_education: `
You generate 30-45 second YouTube Shorts scripts about AI IN EDUCATION —
global AI tools for students (ChatGPT EDU, Khan Academy, NotebookLM) AND
how Indian students should use them (UPSC, JEE, CBSE, NEET) — for
AetherStackAI (host: Vardhan).

Hybrid framing: "Here's the global tool. Here's how YOU use it for [Indian exam]."

TONE: practical, opportunity-focused, hands-on.
AUDIENCE: Indian students (UPSC/JEE/CBSE), teachers, career-changers.

STRUCTURE:
[0-3s]   Hook — what just launched / changed in AI education.
[3-15s]  The tool + what it does, with one concrete capability.
[15-25s] How Indian students apply it — exact use-case for one exam.
[25-40s] Step-by-step — 3 micro-steps to get started today.
[40-45s] CTA + sign off.

${COMMON_REQUIREMENTS}

Output STRICT JSON:
{"english_title":"...","english_hook":"...","english_full_script":"..."}
`.trim(),

  ai_society: `
You generate 30-45 second YouTube Shorts scripts about AI ETHICS +
REGULATION WORLDWIDE — EU AI Act, US executive orders, deepfake laws,
data-privacy rulings, AI-enabled scams — for AetherStackAI (host: Vardhan).

WORLD-FIRST framing: cover the most significant policy / ethics story
of the day, wherever it happens. India coverage when the story is
Indian (IT Rules, MeitY notifications, RBI scam alerts); otherwise
default to the global story.

TONE: thoughtful, balanced, awareness-building. NEVER take political sides.
AUDIENCE: general tech audience, parents, citizens worldwide.

STRUCTURE:
[0-3s]   Hook — the headline + the stake ("Your data just got new protection / risk").
[3-15s]  Details — what changed (law, ruling, scam), real example.
[15-25s] Who this affects + how — concrete user impact globally.
[25-40s] What you do — concrete protective action.
[40-45s] CTA + sign off.

${COMMON_REQUIREMENTS}

Output STRICT JSON:
{"english_title":"...","english_hook":"...","english_full_script":"..."}
`.trim(),
};

const TELUGU_SYSTEM = `
You translate ENGLISH SHORT-FORM SCRIPTS into PURE conversational TELUGU
for AetherStackAI shorts.

═══════════════════════════════════════
PRIMARY RULE: TRANSLATE AGGRESSIVELY TO TELUGU
═══════════════════════════════════════
Default = Telugu. Keep English ONLY for the small explicit list below.
DO NOT code-mix English verbs, adjectives, adverbs, or common nouns.

LANGUAGE STYLE:
- Pure Telugu script (తెలుగు).
- Educated-speaker, conversational — NOT formal news anchor.
- Keep host pacing — natural, not stilted.

═══════════════════════════════════════
KEEP IN ENGLISH (the ONLY exceptions)
═══════════════════════════════════════
- Company / product / brand names: Google, Apple, OpenAI, Anthropic,
  ChatGPT, Claude, Gemini, Meta, NVIDIA, TechCrunch, Bloomberg, …
- Person names: Sam Altman, Elon Musk, Sundar Pichai, …
- Tech acronyms ONLY: AI, ML, API, LLM, OAuth, RAG, GPT, …
- Numbers, percentages, dates, durations, currency
- Pause markers EXACTLY: [PAUSE] / [PAUSE 1.5s] / [PAUSE 2s]
- Source NAME in the citation (TechCrunch / Bloomberg / Inc42 stay as-is)

═══════════════════════════════════════
TRANSLATE EVERYTHING ELSE
═══════════════════════════════════════
- ALL verbs:       hire → నియమించుకుంది, launch → ప్రారంభించింది,
                    release → విడుదల చేసింది, fire → తొలగించింది
- ALL adjectives:  new → కొత్త, smart → తెలివైన, important → ముఖ్యమైన
- ALL adverbs:     just → ఇప్పుడే, really → నిజంగా
- Common nouns:    engineers → ఇంజినీర్లు, jobs → ఉద్యోగాలు,
                    layoff → తొలగింపు, salary → జీతం
- Connectors:      అంటే, కానీ, దానివల్ల, ఎందుకంటే

SOURCE CITATION (last line):
The English script ends with: "Source: <Name>. Link in description."
Translate the prefix + suffix to Telugu, keep the source name English:

  English: "Source: TechCrunch. Link in description."
  Telugu:  "Source: TechCrunch. వివరణలో లింక్ ఉంది."

═══════════════════════════════════════
EXAMPLES (note: ZERO English verbs / adjectives / common nouns)
═══════════════════════════════════════

ENGLISH: "Google just hired 10,000 engineers."
TELUGU:  "Google ఇప్పుడే 10,000 ఇంజినీర్లను నియమించుకుంది."

ENGLISH: "Meta cut 5,000 roles in its AI division this morning."
TELUGU:  "Meta తన AI విభాగంలో ఈ ఉదయం 5,000 ఉద్యోగాలను తొలగించింది."

ENGLISH: "Anthropic just released Claude Opus 4.7."
TELUGU:  "Anthropic ఇప్పుడే Claude Opus 4.7 ని విడుదల చేసింది."

OUTPUT FORMAT (STRICT JSON):
{"telugu_title":"...","telugu_hook":"...","telugu_full_script":"..."}

QUALITY CHECK before output (must all be ✅):
✅ Verbs in Telugu (నియమించుకుంది, NOT "hire చేసింది")
✅ Adjectives in Telugu (కొత్త, NOT "new")
✅ Common nouns in Telugu (ఇంజినీర్లు, NOT "engineers")
✅ ONLY brand names + person names + acronyms + numbers stay English
✅ Pause markers preserved in same positions
✅ Source citation translated except for source name

Output the JSON object only — no prose, no markdown fences.
`.trim();

@Injectable()
export class AiPulseScriptGeneratorService {
  private readonly logger = new Logger(AiPulseScriptGeneratorService.name);
  private readonly openai: OpenAI | null;

  constructor(
    @InjectRepository(AiPulseNewsItem)
    private readonly news: Repository<AiPulseNewsItem>,
    @InjectRepository(AiPulseScript)
    private readonly scripts: Repository<AiPulseScript>,
    private readonly config: ConfigService,
    private readonly memorySvc: AiPulseMemoryService,
    private readonly casting: CharacterCastingService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generateScript(newsItemId: string): Promise<AiPulseScript> {
    if (!this.openai) throw new Error('OPENAI_API_KEY not configured');
    const item = await this.news.findOne({ where: { id: newsItemId } });
    if (!item) throw new NotFoundException('news item not found');
    const systemPrompt = VERTICAL_PROMPTS[item.vertical];
    if (!systemPrompt) throw new Error(`No system prompt for vertical ${item.vertical}`);

    // Inject vertical-scoped winning patterns (empty until the
    // improvement loop has promoted memories).
    const memoryBlock = this.memorySvc.format(
      await this.memorySvc.relevantFor(item.vertical, 'script', 6),
    );

    // ── Character casting (cartoon cast for this story) ─────────────
    // Picks the recurring cartoon characters who star in this script.
    // The script writer references them by name; scene gen pulls locked
    // visual DNAs. Non-fatal — script writes even if casting fails, but
    // scene gen will block until cast is repopulated by a regen.
    const casting: CastingResult | null = await this.casting.castForNews({
      title:    item.headline,
      summary:  item.summary ?? '',
      vertical: item.vertical,
    });
    const castBlock = casting ? formatAiPulseCastBlock(casting) : '';

    // ── English ─────────────────────────────────────────────────────
    const enUser =
      `NEWS:\nHeadline: ${item.headline}\nSummary: ${item.summary ?? '(none)'}\n` +
      `Source name (use this VERBATIM in the final-line citation): ${item.source_name}\n` +
      `Source URL: ${item.source_url}\nPublished: ${item.published_at?.toISOString() ?? 'unknown'}\n\n` +
      (castBlock   ? `${castBlock}\n\n`   : '') +
      (memoryBlock ? `${memoryBlock}\n\n` : '') +
      `Generate the script per the system prompt format. The LAST LINE of ` +
      `english_full_script MUST be exactly:\n` +
      `  Source: ${item.source_name}. Link in description.`;

    const enCompletion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: enUser },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1200,
    });
    const enParsed = JSON.parse(enCompletion.choices[0]?.message?.content ?? '{}') as {
      english_title?: string; english_hook?: string; english_full_script?: string;
    };
    const enScript = (enParsed.english_full_script ?? '').trim();
    if (!enScript) throw new Error('Empty english_full_script from LLM');
    // Defensively append the source citation if the LLM forgot.
    const citation = `Source: ${item.source_name}. Link in description.`;
    const enWithCitation = enScript.endsWith(citation)
      ? enScript
      : `${enScript}\n${citation}`;
    const enWordCount = enWithCitation.trim().split(/\s+/).filter(Boolean).length;

    const enCost = costFor(enCompletion.usage, 'gpt-4o');

    const saved = await this.scripts.save(
      this.scripts.create({
        news_item_id: newsItemId,
        vertical: item.vertical,
        english_title: (enParsed.english_title ?? item.headline).slice(0, 500),
        english_hook: enParsed.english_hook ?? null,
        english_full_script: enWithCitation,
        english_word_count: enWordCount,
        llm_model: 'gpt-4o',
        llm_cost_usd: enCost,
        // Persist cast so scene gen can read it without re-running
        // casting LLM. Null when casting failed — scene gen will then
        // refuse and ask the operator to regenerate the script.
        // Field named character_cast (not cast) — see entity comment.
        character_cast: casting ? {
          main:       casting.main.slug,
          supporting: casting.supporting.map((c) => c.slug),
          cameo:      casting.cameo.map((c) => c.slug),
          reasoning:  casting.reasoning,
        } : null,
      }),
    );
    this.logger.log(
      `AI Pulse script v1 for "${item.headline.slice(0, 60)}" — ${enWordCount} words ` +
      `($${enCost.toFixed(4)})`,
    );

    // ── Telugu translation (non-fatal — English ships if this fails) ─
    try {
      const teUser =
        `Translate this AetherStackAI short into Telugu per the rules.\n\n` +
        `══════════════════════════════════════\n` +
        `ENGLISH TITLE: ${saved.english_title}\n\n` +
        `ENGLISH HOOK: ${saved.english_hook}\n\n` +
        `ENGLISH FULL SCRIPT (preserve pause markers + final citation line):\n${enWithCitation}\n` +
        `══════════════════════════════════════\nOutput strict JSON only.`;

      const teCompletion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: TELUGU_SYSTEM },
          { role: 'user',   content: teUser },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1400,
      });
      const teParsed = JSON.parse(teCompletion.choices[0]?.message?.content ?? '{}') as {
        telugu_title?: string; telugu_hook?: string; telugu_full_script?: string;
      };
      const teScript = (teParsed.telugu_full_script ?? '').trim();
      const teCost = costFor(teCompletion.usage, 'gpt-4o');
      await this.scripts.update(saved.id, {
        telugu_title: (teParsed.telugu_title ?? saved.english_title ?? '').slice(0, 500),
        telugu_hook: teParsed.telugu_hook ?? null,
        telugu_full_script: teScript || null,
        telugu_word_count: teScript ? teScript.trim().split(/\s+/).filter(Boolean).length : null,
        llm_cost_usd: Number(saved.llm_cost_usd) + teCost,
      });
      this.logger.log(`Telugu translation done ($${teCost.toFixed(4)})`);
    } catch (e) {
      this.logger.warn(`Telugu translation failed: ${(e as Error).message} — EN script saved`);
    }

    await this.news.update(newsItemId, { status: 'processed' });
    const refreshed = await this.scripts.findOne({ where: { id: saved.id } });
    if (!refreshed) throw new Error('Script vanished after save');
    return refreshed;
  }
}

function costFor(
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  model: string,
): number {
  // OpenAI pricing per 1M tokens (input, output).
  const rates: Record<string, [number, number]> = {
    'gpt-4o':      [2.5, 10],
    'gpt-4o-mini': [0.15, 0.6],
  };
  const [ir, or] = rates[model] ?? rates['gpt-4o'];
  return ((usage?.prompt_tokens ?? 0) / 1_000_000) * ir
       + ((usage?.completion_tokens ?? 0) / 1_000_000) * or;
}

/** Render the casting director's cast for the AI Pulse script writer.
 *  Mirrors the AQB block (kept inline here so AI Pulse doesn't take a
 *  cross-module dep on AQB's script generator). */
function formatAiPulseCastBlock(casting: CastingResult): string {
  const fmt = (c: { display_name: string; signature_action: string | null }) =>
    `${c.display_name}${c.signature_action ? ` (often: ${c.signature_action})` : ''}`;
  const lines = [
    'CARTOON CAST (the cartoon characters who will star in this story\'s scenes):',
    `  MAIN protagonist (in every scene): ${fmt(casting.main)}`,
  ];
  if (casting.supporting.length > 0) {
    lines.push(
      `  SUPPORTING cast (in 1-3 scenes): ` +
      casting.supporting.map(fmt).join(' · '),
    );
  }
  if (casting.cameo.length > 0) {
    lines.push(
      `  CAMEO (named in narration, NOT depicted): ` +
      casting.cameo.map((c) => c.display_name).join(' · '),
    );
  }
  if (casting.reasoning) lines.push(`  Casting note: ${casting.reasoning}`);
  lines.push(
    '',
    'CAST RULES:',
    '- Reference MAIN + SUPPORTING characters BY THEIR EXACT DISPLAY NAMES in ' +
    'the script (e.g. "Sam Altman" not "the OpenAI CEO"). The scene generator ' +
    'maps names → locked cartoon visuals; mismatched names break consistency.',
    '- CAMEO characters can be mentioned in passing but are NOT shown — do not ' +
    'build scenes around them.',
    '- Anchor the story arc on the MAIN character. The viewer should care about ' +
    'what happens to THEM.',
  );
  return lines.join('\n');
}
