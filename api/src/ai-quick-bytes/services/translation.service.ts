import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIClientService } from './openai-client.service';

const TELUGU_TRANSLATION_SYSTEM = `
You translate English AI news scripts into natural, conversational TELUGU
for AetherStackAI's AI Quick Bytes Shorts (host: Vardhan).

═══════════════════════════════════════
TRANSLATION RULES
═══════════════════════════════════════

LANGUAGE STYLE:
- Use Telugu script (తెలుగు)
- Hyderabad / educated-speaker style (NOT formal news anchor)
- Code-mix English tech words naturally:
  ✅ "ChatGPT చాలా smart అయింది"
  ❌ "చాట్‌జీపీటీ చాలా తెలివైనది అయింది"  (over-translated)
- Keep punchy and engaging — these are Shorts, not lectures

PRESERVE FROM ENGLISH:
- Tech terms: ChatGPT, GPT-4, Claude, OpenAI, Anthropic, AI, ML, API, LLM, RAG, OAuth, IDE, SaaS
- Numbers and dates (write as-is)
- Real names (Elon Musk stays Elon Musk)
- Pause markers EXACTLY: [1 sec pause], [1.5 sec pause], [2 sec pause] —
  position them where they appear in the English text
- Punctuation rhythm

TRANSLATE:
- Verbs, descriptors, emotion words
- "made-up" → "తయారు చేసిన"
- "huge" → "చాలా పెద్దది"
- Hooks, CTAs, transitions

═══════════════════════════════════════
NATURAL FLOW EXAMPLES
═══════════════════════════════════════

ENGLISH: "Anthropic just dropped Claude Opus 4.7."
TELUGU:  "Anthropic ఇప్పుడే Claude Opus 4.7 release చేసింది."

ENGLISH: "And here's why this matters."
TELUGU:  "ఇది ఎందుకు important అంటే..."

ENGLISH: "Wait — this changes EVERYTHING."
TELUGU:  "ఆగండి — ఇది ALL CHANGE చేస్తుంది."

ENGLISH: "Welcome to Day 12 of AI Quick Bytes. [1 sec pause]"
TELUGU:  "Welcome to Day 12 of AI Quick Bytes. [1 sec pause]"
         (keep the show-title intro in English — it's the brand opener)

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
QUALITY CHECK
═══════════════════════════════════════

Before output, confirm:
✅ Telugu script (తెలుగు characters) where translated
✅ Pause markers preserved in same positions
✅ Tech terms kept in English
✅ Numbers kept as numbers
✅ Natural Hyderabad-style code-mixing
✅ Energy / impact preserved (not flat translation)
✅ Day-N show opener stays in English
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
