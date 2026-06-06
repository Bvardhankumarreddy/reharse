import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelRouterService } from './model-router.service';
import { ProviderName } from './provider.types';

const TELUGU_LESSON_SYSTEM = `
You translate ENGLISH LESSON SCRIPTS into natural conversational TELUGU
for an Indian educational YouTube channel. The script is READ ALOUD by
a host — write for the ear, not the page.

LANGUAGE STYLE:
- Use Telugu script (తెలుగు)
- Hyderabad / educated-speaker style (NOT formal news anchor)
- Code-mix English tech words naturally:
  ✅ "OAuth చాలా simple ఎంత simple అంటే …"
  ❌ "ఓఆత్ చాలా సింపుల్ ఎంత సింపుల్ అంటే …"  (over-translated)
- Keep the host's pacing — conversational not stilted

PRESERVE EXACTLY FROM ENGLISH:
- Tech terms: OAuth, JWT, API, REST, GraphQL, gRPC, ChatGPT, Claude,
  Anthropic, OpenAI, Gmail, Postman, npm, Docker, AWS, S3, …
- Real company / person names (Google stays Google, Elon Musk stays Elon Musk)
- Numbers, percentages, dates, durations (write as-is)
- Pause markers EXACTLY where they appear:
    [PAUSE]      [PAUSE 1.5s]      [PAUSE 2s]
- Punctuation rhythm — periods / commas / question marks stay where they were

TRANSLATE:
- Verbs, descriptors, emotion / impact words
- Sentence connectors (అంటే, కానీ, దానివల్ల …)
- Hooks, CTAs, transitions, "why it matters" sections

DURATION GUARANTEE:
- The English script targets 8-10 minutes (1100-1500 words). Telugu is
  slightly slower per syllable but more compact per concept; aim for
  a comparable WORD COUNT (within ±10%) so HeyGen produces a ~8-10
  minute Telugu video too.
- DO NOT condense the script ("get to the point faster") — that would
  shrink the video below 8 min. Preserve every example, every
  transition, every pause.

═══════════════════════════════════════
NATURAL FLOW EXAMPLES
═══════════════════════════════════════

ENGLISH:
"Anthropic just released Claude Opus 4.7. Here's why this changes everything."

TELUGU:
"Anthropic ఇప్పుడే Claude Opus 4.7 release చేసింది. ఇది ఎందుకు
EVERYTHING change చేస్తుంది అంటే …"

ENGLISH:
"And here's the gotcha most engineers miss. [PAUSE 1.5s]"

TELUGU:
"దీని వల్ల చాలా engineers miss అయ్యే gotcha ఇది. [PAUSE 1.5s]"

═══════════════════════════════════════
OUTPUT FORMAT (STRICT JSON)
═══════════════════════════════════════

{
  "telugu_full_script": "<full Telugu script with pause markers in
    the same positions, ready to paste into HeyGen>",
  "telugu_word_count":  <int — your own word count of the script>
}

Output the JSON object only — no prose, no markdown fences.
`.trim();

interface TranslationJson {
  telugu_full_script?: unknown;
  telugu_word_count?: unknown;
}

export interface CsTranslationResult {
  teluguFullScript: string;
  teluguWordCount: number;
  model: string;
  provider: ProviderName;
  costUsd: number;
}

/**
 * Content Studio lesson-script translator. Mirrors the AQB Telugu
 * pattern but tuned for 8-10 minute lectures:
 *   - max_tokens budget (6k) sized for ~1500-word Telugu output
 *   - prompt enforces word-count parity so HeyGen renders 8-10 min EN/TE
 *   - routed through ModelRouterService for cost tracking + failover
 *
 * Default model: gpt-4o (proven for Indic on the AQB side). Override
 * per brand via brand.modelOverrides.script_translation if you ever
 * want to try Claude for translation.
 */
@Injectable()
export class CsTranslationService {
  private readonly logger = new Logger(CsTranslationService.name);

  constructor(
    private readonly router: ModelRouterService,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return (
      (this.config.get<string>('CS_TRANSLATE_TO_TELUGU') ?? 'true').toLowerCase() === 'true'
    );
  }

  async translateLessonToTelugu(opts: {
    fullScript: string;
    lessonTitle: string;
    brandName: string;
    planId?: string | null;
    lessonId?: string | null;
    modelOverride?: string;
  }): Promise<CsTranslationResult> {
    if (!opts.fullScript?.trim()) {
      throw new Error('Empty English script — nothing to translate');
    }
    // Default gpt-4o — proven on AQB. Brand override wins when set.
    const model = opts.modelOverride ?? 'gpt-4o';

    const user =
      `BRAND: ${opts.brandName}\n` +
      `LESSON TITLE: ${opts.lessonTitle}\n\n` +
      `══════════════════════════════════════\n` +
      `FULL ENGLISH SCRIPT (preserve pause markers in same positions):\n` +
      opts.fullScript +
      `\n══════════════════════════════════════\n\n` +
      `Translate per the system prompt rules. Match the word count ` +
      `within ±10% so HeyGen renders a similar duration. JSON only.`;

    const r = await this.router.run({
      task: 'script',
      agentType: 'script',
      planId: opts.planId,
      lessonId: opts.lessonId,
      modelOverride: model,
      jsonOutput: true,
      maxTokens: 6000,
      temperature: 0.3,    // fidelity > flair
      system: TELUGU_LESSON_SYSTEM,
      user,
    });

    let parsed: TranslationJson;
    try {
      parsed = JSON.parse(r.text || '{}') as TranslationJson;
    } catch (e) {
      throw new Error(`Telugu translation JSON parse failed: ${(e as Error).message}`);
    }
    const teluguFullScript = String(parsed.telugu_full_script ?? '').trim();
    if (!teluguFullScript) {
      throw new Error('Telugu translation returned empty script');
    }
    const claimed = Number(parsed.telugu_word_count ?? 0);
    const actualWords = teluguFullScript.trim().split(/\s+/).filter(Boolean).length;
    const teluguWordCount = Number.isFinite(claimed) && claimed > 0 ? claimed : actualWords;

    this.logger.log(
      `Telugu lesson translation · model=${r.model} · ` +
      `words=${actualWords} (claimed ${claimed || '—'}) · ` +
      `cost=$${r.costUsd.toFixed(4)}`,
    );

    return {
      teluguFullScript,
      teluguWordCount,
      model: r.model,
      provider: r.provider as ProviderName,
      costUsd: r.costUsd,
    };
  }
}
