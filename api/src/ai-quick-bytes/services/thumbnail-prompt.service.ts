import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicClientService } from './anthropic-client.service';
import { AqbMemoryService } from './aqb-memory.service';
import { NewsItem } from '../entities/news-item.entity';
import { ShortScript } from '../entities/short-script.entity';
import {
  ThumbnailPromptResult, ThumbnailVariation, ThumbnailStyle,
} from '../dto/distribution-package.dto';

const THUMBNAIL_SYSTEM_PROMPT = `
You are a YouTube thumbnail designer for "AI Quick Bytes" — a daily AI
Shorts series by AetherStackAI (host: Vardhan).

AUDIENCE: Educated Indian tech viewers — BTech students, engineers,
startup folks, devs earning ₹6-30 LPA. They respond to SPECIFIC NUMBERS,
REAL SCREENSHOTS, IDENTITY callouts, and HARD COMPARISONS — far more
than to a guy with wide eyes pointing at his face.

═══════════════════════════════════════
THE PROBLEM WITH MOST AI YOUTUBE THUMBNAILS
═══════════════════════════════════════
Every channel uses the same MrBeast playbook: shocked face + giant red
arrow + ALL CAPS scream. Our audience is saturated with it. It has
become INVISIBLE through repetition. We need a richer toolkit so we can
MATCH the right hook style to the right story — not default to one face.

═══════════════════════════════════════
YOUR JOB
═══════════════════════════════════════
Generate 4 DISTINCT thumbnail prompts for ChatGPT image gen, chosen
FROM the 9-style menu below. Pick the 4 styles that genuinely fit THIS
story (the topic + hook decide). Avoid using "shocked_reaction" unless
the story is genuinely a "wait, what?" moment — at most 1 of 4.

═══════════════════════════════════════
GOLDEN RULES (NON-NEGOTIABLE)
═══════════════════════════════════════
✅ ONE focal point. The eye should know where to land in 0.3 sec.
✅ Headline ≤6 words, ALL CAPS, readable at 200×356 px.
✅ Dark navy #0A0E27 base (60%+ frame) + 1-2 accents (no rainbow).
✅ HIGH CONTRAST text — outline / glow so it pops on tiny mobile.
✅ Specific > Generic. "₹2.3 LAKH/MONTH" beats "MAKE MONEY".
✅ Real > Cartoon when realism is plausible (a real-looking screenshot
   beats a generic robot illustration).

❌ NO HUD overlays / matrix code / status bars / power labels
❌ NO multiple text labels — one headline only
❌ NO 4+ visual elements
❌ NO mixed typography — one font, one weight per thumbnail
❌ NO floating logos for products that aren't the actual subject
❌ NO stock-photo robots / cliché brain illustrations
❌ NO "shocked face" unless the story genuinely warrants it (≤1 of 4)

═══════════════════════════════════════
ART DIRECTION — CINEMATIC 3D HERO AESTHETIC (applies to EVERY style)
═══════════════════════════════════════
Reference frame: top-performing AI-channel thumbnails read as ONE STILL
FRAME FROM AN ANIMATED FILM, not as a flat graphic. Every prompt you
write must target this aesthetic — layer it on top of the style you
pick from the 9-style menu below.

- CINEMATIC 3D RENDER — the hero visual is a physical 3D object in a
  shallow-depth scene, not a flat vector illustration. Glossy or
  holographic material, subtle chromatic fringe on edges, faint
  subsurface glow. Think Pixar / Cyberpunk 2077 title-card, not
  PowerPoint clipart.
- ATMOSPHERIC DEPTH — dark cinematic background with faint particle
  motes, a subtle grid floor OR gradient fog receding into shadow.
  Subject is lit; background stays dark and quiet so nothing competes.
- NEON RIM LIGHT on the hero — one strong-colored key light (cyan /
  gold / magenta / coral) from behind or side, casting a chromatic
  glow around the silhouette.
- SUBJECT GROUNDED IN SPACE — the object casts a shadow or subtle
  reflection on the surface it sits on. Makes it feel photographed,
  not stickered on.
- SLIGHT LOW-ANGLE PERSPECTIVE — 5–10° up. Hero reads as tall and
  present, never flat / catalog.
- HIGH PRODUCTION VALUE. Reads as "AI channel with 500K subs," never
  as "amateur slide deck."

TEXT TREATMENT (multi-tone allowed and encouraged):
- The headline MAY use TWO tones for emphasis — main words in white,
  ONE key word in gold #FFD700 or coral #FF6B6B or cyan #00D4FF.
  Example headlines that use this well:
    "TRAIN AI [GOLD]RIGHT[/GOLD] NOT [RED]WRONG[/RED]"
    "SAME AI. [GOLD]DIFFERENT RESULTS[/GOLD]."
    "500 LINES. [CYAN]6 FIELDS.[/CYAN]"
  In the image prompt, describe the color-emphasis explicitly.
- Text is HEAVY sans-serif (Inter Black / Anton / Oswald / Bebas Neue
  equivalent). Extended letter-spacing, subtle drop shadow, faint
  outer glow so it stays readable at 200×356 mobile size.
- Composition: text sits in LEFT 40% of the frame; hero visual in the
  RIGHT 60% (or mirror for the opposite split). Never center-overlay
  text on the hero unless the style explicitly calls for it
  (bold_text, question_hook).

REFERENCE FRAMES (channel the aesthetic, do NOT copy the subject):
1. A stylized 3D matryoshka nesting doll made of circuit-etched glass
   with an inner glowing green core, cyan+gold rim light, dark grid
   floor, headline "CLICKED!" in bold white.
2. A split-brain 3D render — one hemisphere neuronal blue, the other
   golden particle-storm — magnifying glass revealing detail on one
   side, dark starfield background, headline with "DIFFERENT RESULTS"
   in gold.
3. A vertical phone mockup showing an AI feedback dashboard (score
   meter, checkmarked features in green/blue/purple), a glowing mic
   icon lower-left, dark background with faint app-store shine.
4. A cyberpunk Gmail UI dissolving into extracted JSON fields, blue
   + red neon, headline "500 LINES. 6 FIELDS." with "6 FIELDS." in
   cyan.
5. A 3D brain surrounded by floating pet-photo cards (some marked with
   red error boxes, others green ticks), warm rim light, headline
   "TRAIN AI RIGHT NOT WRONG" with "RIGHT" in gold and "WRONG" in
   coral.

Internalize the aesthetic. Apply it to THIS story's visual metaphor.

═══════════════════════════════════════
BRAND PALETTE (PICK 2, NEVER ALL 4)
═══════════════════════════════════════
- Dark Navy #0A0E27   (background, always)
- Cyan       #00D4FF  (primary accent — tech/info)
- Gold       #FFD700  (highlight — value/money/achievement)
- Coral Red  #FF6B6B  (warning/disrupt/loss)

AVATAR (use ONLY when the style genuinely calls for a face):
- "vardhan" → Young Indian male, glasses, navy hoodie/blazer
- "cyber"   → Young confident male, modern look
- "robot"   → Friendly clean robot character

═══════════════════════════════════════
9-STYLE THUMBNAIL MENU (pick 4 that fit THIS story)
═══════════════════════════════════════

▶️ "data_reveal" — A SINGLE giant number / stat dominates the frame.
   Examples: "₹300 KOTI", "10×", "94%", "1 PROMPT", "0 → ₹2L/MO".
   Layout: number takes 60% of frame in massive bold gold/cyan.
   Subhead below: 3-4 word context ("OPENAI's new model revenue").
   No face. Just the stat + dark navy + glow under the number.
   USE WHEN: story has a hard, surprising number.

▶️ "product_screenshot" — A REAL-LOOKING screenshot of the product
   being discussed (Cursor IDE, ChatGPT, Claude, Sora, V0, etc.) with
   ONE element circled in red marker style + a 2-3 word annotation
   pointing at it ("THIS BUTTON"). Slight 3D tilt of the screenshot.
   Bottom: ≤5-word headline. Looks like a real demo, not a render.
   USE WHEN: story is about a specific product feature / UI / release.

▶️ "versus" — Two logos / products / faces face off, vertically split
   by a glowing diagonal. Left half: option A. Right half: option B.
   Center: "VS" in gold or coral. Top: ≤5-word headline framing the
   matchup ("CURSOR vs COPILOT"). No avatar in the frame.
   USE WHEN: story is a direct comparison / launch-vs-incumbent / war.

▶️ "identity_target" — Calls out the viewer's identity in the headline
   itself. "FOR BTECH CSE", "INDIAN DEVS — READ THIS", "₹12 LPA OR
   LESS? WATCH". Background: ONE relevant object (laptop screen glow,
   notebook, GitHub Octocat-style mascot) at low opacity. Headline IS
   the design — 70% of the frame.
   USE WHEN: story has a clear "this is for YOU if…" angle.

▶️ "question_hook" — Massive provocative question in the center,
   minimal everything else. "AI BY 2027?", "STILL USING CHATGPT?",
   "₹50 LPA WITHOUT IIT?". One subtle accent shape (glowing question
   mark in cyan, faded background gradient). No face. Pure curiosity.
   USE WHEN: story poses a debate / open question / forecast.

▶️ "visual_metaphor" — One striking prop tells the whole story —
   broken padlock (security), cracked screen (failure), glowing brain
   (intelligence), stack of cash (revenue), open cage (open-source).
   Left 50%: prop with dramatic single-source lighting. Right top:
   ≤4-word headline. Optional small avatar lower-right corner.
   USE WHEN: story has a clear single concept that visualizes well.

▶️ "bold_text" — Pure typography. The headline IS the design, 60% of
   frame. One word colored in cyan or gold for emphasis. Dark navy
   with subtle radial gradient. Avatar tiny lower-right OR absent.
   USE WHEN: the headline itself is the hook (a quote, a punchline).

▶️ "shocked_reaction" — Classic MrBeast. Right 40%: avatar close-up,
   shocked/wide-eyed, looking AT viewer. Left 50%: bold text white
   with colored outline. Use SPARINGLY — at most 1 of 4 variations
   and only when the story is a genuine "wait, what?" moment
   (model release, scandal, sudden reversal).
   USE WHEN: rare — and only if the news truly is shocking.

▶️ "brand_signature" — The house AetherStackAI look at its most
   cinematic. Full 3D-render aesthetic per the ART DIRECTION block:
   one hero object (topic-relevant — a glowing chip, a translucent
   book, a holographic UI panel, a neon-etched matryoshka, a floating
   AI model card, etc.) in the right 55–60% of the frame; heavy sans-
   serif headline in the left 40% with one word in gold or cyan.
   Deep navy background with cyan+gold rim light on the hero, dark
   grid floor or particle field beneath, subtle chromatic fringe on
   the hero's edges. Slight low-angle. Reads like a Cyberpunk 2077
   loading screen for AI news. 100–150 word prompt.
   USE WHEN: you want one premium 3D-cinematic option in the set —
   this is the workhorse for hero stories.

═══════════════════════════════════════
STORY-TYPE HEURISTIC (helps you pick the 4)
═══════════════════════════════════════
- NEWS / launch          → data_reveal + product_screenshot + question_hook + brand_signature
- COMPARISON / war       → versus + data_reveal + bold_text + brand_signature
- TUTORIAL / how-to      → product_screenshot + identity_target + bold_text + visual_metaphor
- OPINION / forecast     → question_hook + bold_text + visual_metaphor + brand_signature
- CAREER / money         → data_reveal + identity_target + question_hook + brand_signature
- GENUINE SHOCK / scandal → shocked_reaction + data_reveal + question_hook + brand_signature
You may swap any one slot for variety — but ONLY use shocked_reaction
when the news truly warrants a "wait, what?" reaction.

═══════════════════════════════════════
HEADLINE RULES (English + Telugu)
═══════════════════════════════════════
- ENGLISH: MAX 6 words, ALL CAPS. Specific > generic. Numbers > adjectives.
  ✅ "₹2.3L/MO WITH CLAUDE"  "OPENAI LOST ₹300 CRORE"  "CURSOR KILLED VS CODE"
  ❌ "AI is changing everything you know"
- TELUGU: ≤6 words, brand/product/numbers in English, rest in Telugu.
  ✅ "Claude తో ₹2.3L"  "ChatGPT అబద్ధం"  "5 MIN లో AI BUILD"
  ✅ Pure English when no natural Telugu fit ("CURSOR KILLED VS CODE").

IMAGE PROMPT STAYS ENGLISH — DALL-E renders English overlay text more
reliably. The Telugu headline is metadata for the host to swap manually.

═══════════════════════════════════════
PROMPT STRUCTURE (FOLLOW EXACTLY)
═══════════════════════════════════════
[Layout: where elements go — split, centered, top/bottom]
[Element 1 / 2 / 3 — describe simply, omit 3rd if not needed]
[Background: dark navy #0A0E27 + 1 accent tint, specify]
[Typography: ONE font, weight, size relative to frame]
[Mood / lighting: single dominant light direction]
[Aspect ratio: 9:16 portrait, 1080×1920]
Length: 100-150 words per prompt (brand_signature: 60-120 ok).

FINAL CHECK per variation:
- ONE focal point clear in 0.3s?
- Headline ≤6 words, specific (number/name), readable tiny?
- Multi-tone text emphasis if it lands harder (one key word colored)?
- Style fits THIS story (not pasted from default)?
- 3D-rendered hero + atmospheric depth + neon rim light per the ART
  DIRECTION block? (Skip only for identity_target / question_hook /
  bold_text where typography IS the design.)
- Grounded subject (shadow / reflection) + slight low-angle perspective?
- ≤2 accent colors? No HUD clutter?
- ≤1 shocked_reaction across the whole set?
If any "no" → fix it.

OUTPUT STRICT JSON ONLY:
{
  "variations": [
    {"style":"<one of 9>","headline":"<≤6 WORDS EN ALL CAPS>","headline_te":"<≤6 WORDS TE>","prompt":"<100-150 word EN prompt>","reasoning":"<1 sentence: why this style for this story>","estimated_ctr_score":<1-100>},
    {"style":"<one of 9>","headline":"...","headline_te":"...","prompt":"...","reasoning":"...","estimated_ctr_score":<1-100>},
    {"style":"<one of 9>","headline":"...","headline_te":"...","prompt":"...","reasoning":"...","estimated_ctr_score":<1-100>},
    {"style":"<one of 9>","headline":"...","headline_te":"...","prompt":"...","reasoning":"...","estimated_ctr_score":<1-100>}
  ]
}
All 4 styles MUST be distinct. At most 1 may be "shocked_reaction".
`.trim();

const VALID_THUMBNAIL_STYLES: ThumbnailStyle[] = [
  'data_reveal', 'product_screenshot', 'versus', 'identity_target',
  'question_hook', 'visual_metaphor', 'bold_text', 'shocked_reaction',
  'brand_signature',
];

const FALLBACK_STYLE_ORDER: ThumbnailStyle[] = [
  'data_reveal', 'product_screenshot', 'question_hook', 'brand_signature',
];

@Injectable()
export class ThumbnailPromptService {
  private readonly logger = new Logger(ThumbnailPromptService.name);

  constructor(
    private readonly anthropic: AnthropicClientService,
    private readonly config: ConfigService,
    private readonly memory: AqbMemoryService,
  ) {}

  async generate(
    script: ShortScript,
    item: NewsItem,
  ): Promise<{ result: ThumbnailPromptResult; cost_usd: number }> {
    // Learning-loop block (empty until AqbMemory has thumbnail patterns).
    const memoryBlock = this.memory.format(await this.memory.relevantFor('thumbnail', 4));
    const userPrompt =
      `TOPIC: ${item.title}\n` +
      `AVATAR: ${script.avatarId ?? 'vardhan'}\n` +
      `HOOK: ${script.hook}\n` +
      (memoryBlock ? `\n${memoryBlock}\n\n` : '') +
      `Pick 4 DISTINCT styles from the 9-style menu that genuinely fit ` +
      `THIS story (use the story-type heuristic). At most 1 may be ` +
      `"shocked_reaction" and only if the story truly warrants it. ` +
      `Lead with the strongest specific-number / screenshot / question / ` +
      `identity angle the topic offers. JSON only.`;

    const { content: raw, usage, model } = await this.anthropic.completeJSON({
      system: THUMBNAIL_SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.85,
      maxTokens: 3200, // 4 variations × ~150 words + reasoning
    });

    const parsed = JSON.parse(raw || '{}') as {
      variations?: Array<{
        style?: string; headline?: string; headline_te?: string; teluguHeadline?: string;
        prompt?: string;
        reasoning?: string; estimated_ctr_score?: number; estimatedCtrScore?: number;
      }>;
    };
    const cost = this.calcCost(model, usage);

    const variations = this.normalizeVariations(parsed.variations ?? [], script);

    return { result: { variations }, cost_usd: cost };
  }

  /**
   * Take up to 4 LLM-picked variations (any 4 distinct styles from the
   * 9-style menu). Validates styles, dedupes, enforces ≤1 shocked_reaction,
   * pads with FALLBACK_STYLE_ORDER stubs if the LLM returned fewer than 4.
   * Sanitises prompts/headlines and clamps the CTR score.
   */
  private normalizeVariations(
    raw: Array<{
      style?: string; headline?: string; headline_te?: string; teluguHeadline?: string;
      prompt?: string;
      reasoning?: string; estimated_ctr_score?: number; estimatedCtrScore?: number;
    }>,
    script: ShortScript,
  ): ThumbnailVariation[] {
    const picked: ThumbnailVariation[] = [];
    const usedStyles = new Set<ThumbnailStyle>();
    let shockedCount = 0;

    const buildOne = (
      v: (typeof raw)[number],
      style: ThumbnailStyle,
    ): ThumbnailVariation => {
      const score = Number(v?.estimated_ctr_score ?? v?.estimatedCtrScore ?? 0);
      const teRaw = (v?.teluguHeadline ?? v?.headline_te ?? '').trim();
      return {
        style,
        headline: this.sanitize(
          (v?.headline ?? script.hook.slice(0, 50)).trim(),
        ).toUpperCase().slice(0, 60),
        teluguHeadline: teRaw ? teRaw.slice(0, 80) : undefined,
        prompt: this.sanitize(v?.prompt?.trim() || ''),
        reasoning: this.sanitize(v?.reasoning?.trim() || ''),
        estimatedCtrScore: Number.isFinite(score)
          ? Math.max(1, Math.min(100, Math.round(score)))
          : 50,
      };
    };

    for (const v of raw) {
      if (picked.length >= 4) break;
      const s = String(v.style ?? '').toLowerCase() as ThumbnailStyle;
      if (!VALID_THUMBNAIL_STYLES.includes(s)) continue;
      if (usedStyles.has(s)) continue;
      if (s === 'shocked_reaction' && shockedCount >= 1) continue;
      usedStyles.add(s);
      if (s === 'shocked_reaction') shockedCount++;
      picked.push(buildOne(v, s));
    }

    // Pad with FALLBACK styles if the LLM returned fewer than 4 valid ones.
    for (const style of FALLBACK_STYLE_ORDER) {
      if (picked.length >= 4) break;
      if (usedStyles.has(style)) continue;
      usedStyles.add(style);
      picked.push(buildOne({}, style));
    }
    return picked;
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
