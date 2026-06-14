import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelRouterService } from './model-router.service';
import { ProviderName } from './provider.types';

const TELUGU_LESSON_SYSTEM = `
You translate ENGLISH LESSON SCRIPTS into PURE conversational TELUGU
for an Indian educational YouTube channel. The script is READ ALOUD by
a host — write for the ear, not the page.

═══════════════════════════════════════
PRIMARY RULE: TRANSLATE AGGRESSIVELY TO TELUGU
═══════════════════════════════════════

Default = Telugu. Keep English ONLY for the small explicit list below.
DO NOT code-mix English verbs, adjectives, adverbs, or common nouns.

LANGUAGE STYLE:
- Pure Telugu script (తెలుగు)
- Educated-speaker, conversational — NOT formal news anchor
- Keep the host's pacing — natural not stilted

═══════════════════════════════════════
KEEP IN ENGLISH (the ONLY exceptions)
═══════════════════════════════════════
- Tech acronyms / protocol names: OAuth, JWT, API, REST, GraphQL,
  gRPC, HTTP, JSON, SQL, LLM, AI, ML, SaaS, IDE
- Company / product / brand names: ChatGPT, Claude, Anthropic, OpenAI,
  Google, Gmail, Postman, npm, Docker, AWS, S3, Microsoft, Apple, …
- Person names: Elon Musk, Sam Altman, Sundar Pichai, …
- Numbers, percentages, dates, durations (write as-is)
- Pause markers EXACTLY: [PAUSE] / [PAUSE 1.5s] / [PAUSE 2s]
- Code snippets / file names / commands (if any appear inline)

═══════════════════════════════════════
TRANSLATE EVERYTHING ELSE
═══════════════════════════════════════
- ALL verbs:        release → విడుదల చేసింది, miss → తప్పించుకుంటారు,
                     simple → సులువు అవుతుంది
- ALL adjectives:   simple → సులువైన, important → ముఖ్యమైన,
                     huge → చాలా పెద్దది, new → కొత్త
- ALL adverbs:      just → ఇప్పుడే, really → నిజంగా, slowly → నెమ్మదిగా
- Common nouns:     engineers → ఇంజినీర్లు, problem → సమస్య,
                     gotcha → మెలిక / మోసం (when used as "the trap"),
                     example → ఉదాహరణ
- Connectors:       అంటే, కానీ, దానివల్ల, ఎందుకంటే, మరియు

DURATION GUARANTEE:
- English script targets 8-10 minutes (1100-1500 words). Telugu is
  slightly slower per syllable but more compact per concept; aim for
  a comparable WORD COUNT (within ±10%) so HeyGen produces a ~8-10
  minute Telugu video too.
- DO NOT condense ("get to the point faster") — preserve every example,
  every transition, every pause.

═══════════════════════════════════════
EXAMPLES (note: ZERO English verbs / adjectives / common nouns)
═══════════════════════════════════════

ENGLISH:
"Anthropic just released Claude Opus 4.7. Here's why this changes everything."

TELUGU:
"Anthropic ఇప్పుడే Claude Opus 4.7 ని విడుదల చేసింది. ఇది అన్నీ
ఎందుకు మార్చేస్తుందంటే …"

ENGLISH:
"OAuth is actually really simple, once you understand the three parties."

TELUGU:
"OAuth నిజంగా చాలా సులువు, మూడు పక్షాలను అర్థం చేసుకుంటే చాలు."

ENGLISH:
"And here's the gotcha most engineers miss. [PAUSE 1.5s]"

TELUGU:
"చాలా ఇంజినీర్లు తప్పించుకునే మెలిక ఇదే. [PAUSE 1.5s]"

═══════════════════════════════════════
OUTPUT FORMAT (STRICT JSON)
═══════════════════════════════════════

{
  "telugu_full_script": "<full Telugu script with pause markers in
    the same positions, ready to paste into HeyGen>",
  "telugu_word_count":  <int — your own word count of the script>
}

QUALITY CHECK before output (must all be ✅):
✅ Verbs in Telugu (విడుదల చేసింది, NOT "release చేసింది")
✅ Adjectives in Telugu (సులువైన, NOT "simple")
✅ Common nouns in Telugu (ఇంజినీర్లు, NOT "engineers")
✅ ONLY acronyms + brand names + person names + numbers stay English
✅ Pause markers preserved in same positions
✅ Word count within ±10% of source (preserve runtime)

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
