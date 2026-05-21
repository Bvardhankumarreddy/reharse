import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicClientService } from './anthropic-client.service';
import { NewsItem } from '../entities/news-item.entity';
import { ShortScript } from '../entities/short-script.entity';
import {
  ThumbnailPromptResult, ThumbnailVariation, ThumbnailStyle,
} from '../dto/distribution-package.dto';

const THUMBNAIL_SYSTEM_PROMPT = `
You are a YouTube thumbnail designer for "AI Quick Bytes" — a daily AI
Shorts series by AetherStackAI (host: Vardhan).

CRITICAL DESIGN PHILOSOPHY:
═══════════════════════════════════════
LESS IS MORE. SIMPLE BEATS COMPLEX EVERY TIME.
═══════════════════════════════════════

Your job: Generate 4 DIFFERENT thumbnail prompts for ChatGPT image gen —
3 clean MrBeast-style options PLUS 1 in our richer signature brand look.

═══════════════════════════════════════
GOLDEN RULE (NON-NEGOTIABLE)
═══════════════════════════════════════

Every thumbnail = MAXIMUM 3 visual elements total.
ONE face + ONE message + ONE prop. That's it.
If you have 4+ elements, REMOVE something. Always.

═══════════════════════════════════════
WHAT MAKES A GOOD THUMBNAIL
═══════════════════════════════════════

✅ ONE bold message (max 4-6 words, all caps)
✅ ONE strong emotion on a face
✅ ONE clean visual prop
✅ 60%+ negative space (background should breathe)
✅ 2-3 color palette MAX
✅ Big readable text (works at thumbnail size)
✅ Dark moody background
✅ Strong contrast

═══════════════════════════════════════
WHAT TO ABSOLUTELY AVOID (applies to the 3 CLEAN styles only —
the "brand_signature" style is the deliberate exception)
═══════════════════════════════════════

❌ NO HUD elements / sci-fi interface overlays
❌ NO multiple text labels (e.g., "System Status: Active")
❌ NO floating data fragments / matrix code
❌ NO company logos floating around
❌ NO detailed circuit board patterns covering background
❌ NO multiple fonts / mixed typography
❌ NO status indicators / progress bars
❌ NO more than 3 light sources
❌ NO clutter — every element must EARN its place
❌ NO power/mission/data labels at the bottom

═══════════════════════════════════════
BRAND VISUAL IDENTITY (KEEP MINIMAL)
═══════════════════════════════════════

COLORS (use MAX 2-3, never all 4):
- Background: Dark Navy #0A0E27 (always 60%+ of frame)
- Primary accent: Cyan #00D4FF
- Highlight: Gold #FFD700
- Warning: Coral Red #FF6B6B
Pick TWO colors per thumbnail. Not all of them.

AVATAR USAGE (match script's avatar):
- "cyber"   → Young male, slight confident expression, modern look
- "robot"   → Friendly robot character, clean design
- "vardhan" → Young Indian male with glasses, navy blazer/hoodie

═══════════════════════════════════════
4 STYLE VARIATIONS (GENERATE ONE OF EACH)
═══════════════════════════════════════

▶️ VARIATION 1: "shocked_reaction" — the classic MrBeast look.
   Right 40%: avatar close-up, SHOCKED expression, looking AT viewer.
   Left 50%: BIG bold text, white with colored outline.
   Dark navy, subtle radial gradient. 70% negative space.

▶️ VARIATION 2: "bold_text" — pure typography.
   Center: MASSIVE headline (60% of frame), one word highlighted.
   Avatar tiny in a corner or absent. Clean dark navy. 80% negative space.

▶️ VARIATION 3: "visual_metaphor" — story in one image.
   Left 50%: avatar with relevant emotion. Right 50%: ONE strong prop
   (broken padlock, glowing brain, money stack, robot silhouette).
   Top: ≤4-word headline. Spotlight on the prop. 60% negative space.

▶️ VARIATION 4: "brand_signature" — the richer AetherStackAI look (the
   EXCEPTION to the minimalism rules above; this is our previous house style,
   kept for variety).
   - Dark navy (#0A0E27) background with subtle glowing tech particles.
   - Cyan (#00D4FF) + gold (#FFD700) neon accents, high-contrast, a
     futuristic game-show / tech energy.
   - ONE striking focal subject tied to the topic (avatar or a hero prop),
     not generic clip-art. Tasteful HUD/glow accents are allowed here.
   - Space reserved for a bold 3-5 word overlay headline.
   - Still vivid and self-contained — 60-120 word prompt.

═══════════════════════════════════════
HEADLINE RULES
═══════════════════════════════════════
- MAX 6 words, ALL CAPS, punchy, curiosity-driven, no empty clickbait.
✅ "AI JUST LEARNED THIS"  "CHATGPT IS LYING"  "BUILD AI IN 5 MIN"
❌ "How OpenAI Just Released Claude Opus 4.7 With New Features"

═══════════════════════════════════════
EACH PROMPT STRUCTURE (FOLLOW EXACTLY)
═══════════════════════════════════════
[Layout: where elements go]
[Element 1 / 2 / 3 — describe simply, or omit element 3]
[Background: ALWAYS dark navy #0A0E27 + 1 accent tint]
[Style: clean MrBeast thumbnail, 60-80% negative space]
[Aspect ratio: 9:16 portrait, 1080x1920]
Length: 100-150 words per prompt. Over 200 = too much.

FINAL CHECK per variation: max 3 elements? 60%+ negative space? message a
5-year-old gets? headline ≤6 words? only 2-3 colors? If any "no", simplify.

OUTPUT STRICT JSON ONLY:
{
  "variations": [
    {"style":"shocked_reaction","headline":"<≤6 WORDS ALL CAPS>","prompt":"<clean 100-150 word prompt>","reasoning":"<1 sentence>","estimated_ctr_score":<1-100>},
    {"style":"bold_text","headline":"<≤6 WORDS ALL CAPS>","prompt":"<clean 100-150 word prompt>","reasoning":"<1 sentence>","estimated_ctr_score":<1-100>},
    {"style":"visual_metaphor","headline":"<≤6 WORDS ALL CAPS>","prompt":"<clean 100-150 word prompt>","reasoning":"<1 sentence>","estimated_ctr_score":<1-100>},
    {"style":"brand_signature","headline":"<≤6 WORDS ALL CAPS>","prompt":"<richer 60-120 word AetherStackAI signature prompt>","reasoning":"<1 sentence>","estimated_ctr_score":<1-100>}
  ]
}
`.trim();

const THUMBNAIL_STYLES: ThumbnailStyle[] = [
  'shocked_reaction', 'bold_text', 'visual_metaphor', 'brand_signature',
];

@Injectable()
export class ThumbnailPromptService {
  private readonly logger = new Logger(ThumbnailPromptService.name);

  constructor(
    private readonly anthropic: AnthropicClientService,
    private readonly config: ConfigService,
  ) {}

  async generate(
    script: ShortScript,
    item: NewsItem,
  ): Promise<{ result: ThumbnailPromptResult; cost_usd: number }> {
    const { content: raw, usage, model } = await this.anthropic.completeJSON({
      system: THUMBNAIL_SYSTEM_PROMPT,
      user:
        `TOPIC: ${item.title}\n` +
        `AVATAR: ${script.avatarId ?? 'vardhan'}\n` +
        `HOOK: ${script.hook}\n` +
        `Generate 4 thumbnail variations (3 clean MrBeast + 1 brand_signature). JSON only.`,
      temperature: 0.85,
      maxTokens: 3200, // 4 variations × ~150 words + reasoning
    });

    const parsed = JSON.parse(raw || '{}') as {
      variations?: Array<{
        style?: string; headline?: string; prompt?: string;
        reasoning?: string; estimated_ctr_score?: number; estimatedCtrScore?: number;
      }>;
    };
    const cost = this.calcCost(model, usage);

    const variations = this.normalizeVariations(parsed.variations ?? [], script);

    return { result: { variations }, cost_usd: cost };
  }

  /**
   * Coerce the model output into exactly the 3 expected styles, in order.
   * Missing/invalid entries fall back to a minimal stub so the host always
   * gets three slots. Sanitises prompts/headlines and clamps the CTR score.
   */
  private normalizeVariations(
    raw: Array<{
      style?: string; headline?: string; prompt?: string;
      reasoning?: string; estimated_ctr_score?: number; estimatedCtrScore?: number;
    }>,
    script: ShortScript,
  ): ThumbnailVariation[] {
    const byStyle = new Map<ThumbnailStyle, (typeof raw)[number]>();
    for (const v of raw) {
      const s = String(v.style ?? '').toLowerCase() as ThumbnailStyle;
      if (THUMBNAIL_STYLES.includes(s) && !byStyle.has(s)) byStyle.set(s, v);
    }
    return THUMBNAIL_STYLES.map((style) => {
      const v = byStyle.get(style);
      const score = Number(v?.estimated_ctr_score ?? v?.estimatedCtrScore ?? 0);
      return {
        style,
        headline: this.sanitize(
          (v?.headline ?? script.hook.slice(0, 50)).trim(),
        ).toUpperCase().slice(0, 60),
        prompt: this.sanitize(v?.prompt?.trim() || ''),
        reasoning: this.sanitize(v?.reasoning?.trim() || ''),
        estimatedCtrScore: Number.isFinite(score)
          ? Math.max(1, Math.min(100, Math.round(score)))
          : 50,
      };
    });
  }

  /**
   * Strip stray non-Latin glyphs from the thumbnail prompt. Claude
   * occasionally injects a CJK token mid-word (e.g. "intense and警alert");
   * this is a plain-English image prompt the host pastes into ChatGPT, so
   * we keep ASCII, Latin accents and common typographic punctuation, replace
   * anything else with a space, and collapse the gap so words don't mash.
   */
  private sanitize(s: string): string {
    if (!s) return s;
    return s
      .replace(
        /[^\x09\x0A\x0D\x20-\x7E -ɏ‐-‧‰-⁞]/g,
        ' ',
      )
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private calcCost(
    model: string,
    usage?: { prompt_tokens?: number; completion_tokens?: number },
  ): number {
    const inTok = usage?.prompt_tokens ?? 0;
    const outTok = usage?.completion_tokens ?? 0;
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
