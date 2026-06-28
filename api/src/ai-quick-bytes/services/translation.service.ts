import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIClientService } from './openai-client.service';

const TELUGU_TRANSLATION_SYSTEM = `
You translate English AI news scripts into PURE conversational TELUGU
for AetherStackAI's AI Quick Bytes Shorts (host: Vardhan).

═══════════════════════════════════════
DIALOGUE STYLE ANCHOR — WRITE LIKE A TOP TELUGU DIALOGUE WRITER
═══════════════════════════════════════
Channel your inner TRIVIKRAM SRINIVAS. The dialogue must feel like
something from a Trivikram script — educated, witty, conversational
Telugu with sharp observational rhythm. Sentences land like punchlines.
The viewer should feel a small smile or "wah" moment, not a news bulletin.

Secondary inspirations (use sparingly when they fit the beat):
- PARUCHURI BROTHERS — warm conversational gravitas for serious beats
- JANDHYALA — sophisticated comedic timing for lighter moments
- TANIKELLA BHARANI — earthy + profound for safety / philosophy beats

Trivikram trademarks to lean into:
- Short clauses with a sudden pivot ("అది వేరే మాట. కానీ ఇక్కడ ట్విస్ట్ ఏంటంటే…")
- Everyday observations elevated by precise word choice
- Educated-Hyderabadi code-mix where English lands harder than Telugu
- Rhetorical questions that pull the listener in ("మీకు తెలుసా?", "ఎందుకో తెలుసా?")
- Lines that could be quoted on Instagram — punchy, memorable, never preachy

What to AVOID (anti-Trivikram):
- Formal news-anchor Telugu (నివేదిక, ప్రకటించడం, తెలియజేయడం)
- Over-Sanskritised vocabulary that nobody uses in conversation
- Flat sentence rhythm where every line is the same length
- Lecturing tone — never explain to the viewer; let them feel it

═══════════════════════════════════════
PRIMARY RULE: TRANSLATE AGGRESSIVELY TO TELUGU
═══════════════════════════════════════

Default = Telugu. Keep English ONLY for the small explicit list below.
DO NOT code-mix English verbs, adjectives, adverbs, or common nouns.

LANGUAGE STYLE:
- Pure Telugu script (తెలుగు)
- Educated-speaker, conversational, Trivikram-rhythm — NOT formal news anchor
- Punchy + engaging (these are Shorts, not lectures)

═══════════════════════════════════════
KEEP IN ENGLISH (the ONLY exceptions)
═══════════════════════════════════════
- Company / product / brand names: OpenAI, Anthropic, Google, Apple,
  Meta, Microsoft, ChatGPT, Claude, GPT-4, Gemini, NVIDIA, Tesla, …
- Person names: Sam Altman, Elon Musk, Sundar Pichai, …
- Tech acronyms ONLY: AI, ML, API, LLM, RAG, OAuth, JWT, SaaS, IDE
- Numbers, percentages, dates, durations, currency (write as-is)
- Pause markers EXACTLY: [1 sec pause], [1.5 sec pause], [2 sec pause]
- The show-opener brand line — "Welcome to Day N of AI Quick Bytes"
  stays English (brand consistency)

═══════════════════════════════════════
TRANSLATE EVERYTHING ELSE
═══════════════════════════════════════
- ALL verbs:       release → విడుదల చేసింది, hire → నియమించుకుంది,
                    launched → ప్రారంభించింది, dropped → తెచ్చింది
- ALL adjectives:  smart → తెలివైన, important → ముఖ్యమైన,
                    huge → చాలా పెద్దది, new → కొత్త
- ALL adverbs:     just → ఇప్పుడే, really → నిజంగా, quickly → త్వరగా
- Common nouns:    engineers → ఇంజినీర్లు, problem → సమస్య,
                    answer → సమాధానం (unless they're acronyms above)
- Connectors:      అంటే, కానీ, దానివల్ల, ఎందుకంటే, మరియు

═══════════════════════════════════════
EXAMPLES (note: ZERO English verbs / adjectives)
═══════════════════════════════════════

ENGLISH: "Anthropic just dropped Claude Opus 4.7."
TELUGU:  "Anthropic ఇప్పుడే Claude Opus 4.7 ని తెచ్చింది."

ENGLISH: "And here's why this matters."
TELUGU:  "ఇది ఎందుకు ముఖ్యం అంటే..."

ENGLISH: "Wait — this changes EVERYTHING."
TELUGU:  "ఆగండి — ఇది అన్నీ మార్చేస్తుంది."

ENGLISH: "Google just hired 10,000 engineers."
TELUGU:  "Google ఇప్పుడే 10,000 ఇంజినీర్లను నియమించుకుంది."

ENGLISH: "Welcome to Day 12 of AI Quick Bytes. [1 sec pause]"
TELUGU:  "Welcome to Day 12 of AI Quick Bytes. [1 sec pause]"
         (brand opener — stays English)

ENGLISH: "This is a huge breakthrough for AI safety."
TELUGU:  "ఇది AI safety కోసం చాలా పెద్ద పురోగతి."
         (AI is acronym → kept; safety could go either way, prefer Telugu)

═══════════════════════════════════════
OUTPUT FORMAT (STRICT JSON)
═══════════════════════════════════════

{
  "telugu_hook":        "<translated hook with pause markers>",
  "telugu_body":        "<translated body with pause markers>",
  "telugu_cta":         "<translated CTA with pause markers>",
  "telugu_full_script": "<complete translated script ready to paste into HeyGen>"
}

═══════════════════════════════════════
QUALITY CHECK (must all be ✅)
═══════════════════════════════════════
✅ Verbs in Telugu (విడుదల చేసింది / తెచ్చింది / etc., NOT "release చేసింది")
✅ Adjectives in Telugu (తెలివైన / ముఖ్యమైన, NOT "smart" / "important")
✅ Common nouns in Telugu (ఇంజినీర్లు, NOT "engineers")
✅ ONLY brands + person names + acronyms (AI/ML/API) + numbers stay English
✅ Pause markers preserved in same positions
✅ Day-N show opener stays English
✅ Energy / impact preserved (not flat translation)
Output the JSON object only — no prose, no markdown fences.
`.trim();

interface TranslationJson {
  telugu_hook?: unknown;
  telugu_body?: unknown;
  telugu_cta?: unknown;
  telugu_full_script?: unknown;
}

export interface TranslationResult {
  teluguHook: string;
  teluguBody: string;
  teluguCta: string;
  teluguFullScript: string;
  model: string;
  costUsd: number;
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    private readonly openai: OpenAIClientService,
    private readonly config: ConfigService,
  ) {}

  isConfigured(): boolean {
    return this.openai.isConfigured();
  }

  /**
   * Translate English script parts → Telugu. Throws if OpenAI is not
   * configured; the caller treats translation failure as non-fatal so the
   * English flow still ships.
   */
  async translateToTelugu(input: {
    hook: string;
    body: string;
    cta: string;
    fullScript: string;
  }): Promise<TranslationResult> {
    if (!this.openai.isConfigured()) {
      throw new Error('OpenAI not configured — Telugu translation skipped');
    }
    const model =
      this.config.get<string>('aiQuickBytes.openai.translationModel') ?? 'gpt-4o';

    const userPrompt =
      `Translate the following AI Quick Bytes Short into Telugu per the rules.\n\n` +
      `══════════════════════════════════════\n` +
      `HOOK (English):\n${input.hook}\n\n` +
      `══════════════════════════════════════\n` +
      `BODY (English):\n${input.body}\n\n` +
      `══════════════════════════════════════\n` +
      `CTA (English):\n${input.cta}\n\n` +
      `══════════════════════════════════════\n` +
      `FULL SCRIPT (English — preserve pause markers in same positions):\n${input.fullScript}\n\n` +
      `══════════════════════════════════════\n` +
      `Output strict JSON per system prompt format.`;

    const completion = await this.openai.getClient().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: TELUGU_TRANSLATION_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,  // low — fidelity over flair
      max_tokens: 4000,
    });

    const text = completion.choices?.[0]?.message?.content ?? '{}';
    let parsed: TranslationJson;
    try {
      parsed = JSON.parse(text) as TranslationJson;
    } catch (e) {
      throw new Error(`Translation JSON parse failed: ${(e as Error).message}`);
    }

    const teluguHook = String(parsed.telugu_hook ?? '').trim();
    const teluguBody = String(parsed.telugu_body ?? '').trim();
    const teluguCta  = String(parsed.telugu_cta  ?? '').trim();
    const teluguFullScript =
      String(parsed.telugu_full_script ?? '').trim() ||
      [teluguHook, teluguBody, teluguCta].filter(Boolean).join('\n\n');

    if (!teluguFullScript) {
      throw new Error('Translation returned empty full script');
    }

    const usage = completion.usage;
    const costUsd = this.cost(model, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0);

    this.logger.log(
      `Telugu translation done · model=${model} · ` +
      `tokens=${usage?.prompt_tokens ?? 0}+${usage?.completion_tokens ?? 0} · ` +
      `cost=$${costUsd.toFixed(4)}`,
    );

    return {
      teluguHook,
      teluguBody,
      teluguCta,
      teluguFullScript,
      model,
      costUsd,
    };
  }

  /** USD per 1M tokens for the models we'll actually use here. */
  private cost(model: string, inTok: number, outTok: number): number {
    const rates: Record<string, [number, number]> = {
      'gpt-4o':       [2.5, 10],
      'gpt-4o-mini':  [0.15, 0.6],
      'gpt-4-turbo':  [10, 30],
    };
    const [inRate, outRate] = rates[model] ?? rates['gpt-4o'];
    return (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * outRate;
  }
}
