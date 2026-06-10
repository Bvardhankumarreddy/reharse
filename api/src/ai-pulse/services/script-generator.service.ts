import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiPulseNewsItem, AiPulseVertical } from '../entities/news-item.entity';
import { AiPulseScript } from '../entities/news-script.entity';
import { VERTICALS } from '../config/verticals.config';
import { AiPulseMemoryService } from './memory.service';

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
You translate ENGLISH SHORT-FORM SCRIPTS into natural conversational
TELUGU for AetherStackAI shorts. Hyderabad-style code-mix.

LANGUAGE STYLE:
- Telugu script (తెలుగు).
- Code-mix English tech words naturally:
  ✅ "Google ఇప్పుడే 10,000 engineers hire చేసింది."
  ❌ over-translated nouns.
- Keep host pacing — conversational, not stilted.

PRESERVE EXACTLY:
- Tech terms, company names, person names, numbers, dates.
- Pause markers exactly where they appear: [PAUSE] / [PAUSE 1.5s] / [PAUSE 2s].
- The LAST LINE source citation — translate the prefix to Telugu but
  KEEP the source name verbatim:
    "Source: TechCrunch. Link in description."
    → "Source: TechCrunch. Description లో link ఉంది."

OUTPUT FORMAT (STRICT JSON):
{"telugu_title":"...","telugu_hook":"...","telugu_full_script":"..."}
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

    // ── English ─────────────────────────────────────────────────────
    const enUser =
      `NEWS:\nHeadline: ${item.headline}\nSummary: ${item.summary ?? '(none)'}\n` +
      `Source name (use this VERBATIM in the final-line citation): ${item.source_name}\n` +
      `Source URL: ${item.source_url}\nPublished: ${item.published_at?.toISOString() ?? 'unknown'}\n\n` +
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
