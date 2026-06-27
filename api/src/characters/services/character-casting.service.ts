import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { CharacterDictionaryService } from './character-dictionary.service';
import { Character, CharacterCategory } from '../entities/character.entity';
import { CHARACTER_SEED } from '../data/seed';

export interface CastingResult {
  /** Main protagonist (always 1). Drives the story; appears in every scene. */
  main: Character;
  /** 0-3 supporting characters. Appear in 1-3 scenes each. */
  supporting: Character[];
  /** 0-3 cameo characters — NAMED in narration, NEVER depicted visually. */
  cameo: Character[];
  /** Reasoning the LLM gave for the cast. 1-2 sentences. */
  reasoning: string;
}

interface LlmCastingOutput {
  main: string | null;
  supporting: string[];
  cameo: string[];
  reasoning: string;
  /** Brand-new characters the LLM proposed that aren't in the dictionary.
   *  Each gets upserted to the DB as source='auto_generated' before being
   *  resolved into the cast. */
  new_characters?: Array<{
    slug:             string;
    category:         CharacterCategory;
    display_name:     string;
    visual_dna:       string;
    signature_action?:string;
    personality?:     string;
    mood_palette?:    string;
  }>;
}

/**
 * Decides which cartoon characters a script will star, given a news item.
 *
 *   - One LLM call (~$0.003 per script).
 *   - Reads the seed dictionary to know the existing cast roster.
 *   - LLM picks 1 main + 0-3 supporting + 0-3 cameo from the roster.
 *   - LLM can ALSO propose brand-new characters for subjects not in the
 *     roster (e.g. a niche startup CEO); those upsert into the DB so the
 *     next script that mentions them gets the same DNA.
 *
 * Triage tier semantics (locked):
 *   MAIN       → in every scene; drives story arc
 *   SUPPORTING → in 1-3 scenes; relevant beats only
 *   CAMEO      → spoken in narration; NEVER depicted (image-gen would
 *                exceed the 3-character ceiling and lose DNA consistency)
 *
 * Non-fatal — if casting fails or the LLM is misconfigured, callers fall
 * back to the prior behaviour (no cast = scene gen renders generic
 * subjects/silhouettes as before).
 */
@Injectable()
export class CharacterCastingService {
  private readonly logger = new Logger(CharacterCastingService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(
    private readonly dictionary: CharacterDictionaryService,
    private readonly config: ConfigService,
  ) {
    // Reuses the same Anthropic API key both modules already use.
    // Prefers ai-quick-bytes config (the existing canonical Anthropic
    // wiring) but falls back to a top-level env var.
    const apiKey =
      this.config.get<string>('aiQuickBytes.anthropic.apiKey') ??
      process.env.ANTHROPIC_API_KEY ??
      null;
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    // Cheap + fast — casting is a small structured-JSON task. Override
    // via CHARACTERS_CASTING_MODEL env if you ever want richer reasoning.
    this.model =
      process.env.CHARACTERS_CASTING_MODEL ?? 'claude-haiku-4-5-20251001';
    if (!this.client) {
      this.logger.warn(
        'ANTHROPIC_API_KEY not set — character casting will return null and ' +
        'scenes will render without locked DNAs (legacy behaviour).',
      );
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /** Cast a news item. Returns null on any failure — caller falls back. */
  async castForNews(input: {
    title:    string;
    summary:  string;
    /** Optional — a strategic brief from IdeaSelection (AQB) or a vertical
     *  tone hint (AI Pulse). Helps the LLM bias toward angle-appropriate
     *  characters. */
    brief?:   string | null;
    /** Optional — vertical name ("ai_business", "tech_industry", …) so
     *  AI Pulse can hint at sector context. */
    vertical?: string | null;
  }): Promise<CastingResult | null> {
    if (!this.client) return null;

    const roster = this.formatRoster();
    const system = this.buildSystemPrompt(roster);
    const user =
      `NEWS ITEM\n` +
      `Title:    ${input.title}\n` +
      (input.vertical ? `Vertical: ${input.vertical}\n` : '') +
      `Summary:  ${input.summary.slice(0, 1500)}\n` +
      (input.brief ? `\nSTRATEGIC BRIEF (from upstream agent — bias toward angle-fitting characters):\n${input.brief.slice(0, 600)}\n` : '') +
      `\nCast this story. JSON only.`;

    try {
      const resp = await this.client.messages.create({
        model: this.model,
        max_tokens: 1200,
        temperature: 0.4,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text).join('');
      // The LLM occasionally wraps JSON in fences despite the instructions.
      // Strip them defensively.
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned || '{}') as Partial<LlmCastingOutput>;
      return await this.resolveAndPersist(parsed, input.title);
    } catch (e) {
      this.logger.warn(
        `Character casting failed for "${input.title.slice(0, 60)}": ${(e as Error).message}`,
      );
      return null;
    }
  }

  /** Persist any LLM-proposed new characters, then resolve the cast
   *  slugs to actual Character rows. Drops anything that fails to
   *  resolve so the scene gen never receives a broken cast. */
  private async resolveAndPersist(
    parsed: Partial<LlmCastingOutput>,
    titleForLog: string,
  ): Promise<CastingResult | null> {
    // 1. Upsert any new characters the LLM proposed.
    for (const nc of parsed.new_characters ?? []) {
      if (!nc?.slug || !nc?.visual_dna) continue;
      const slug = String(nc.slug).toLowerCase().trim().replace(/[\s\-]+/g, '_');
      const validCat = new Set<CharacterCategory>([
        'ai_brands','real_people','organizations','indian_archetypes','concept_objects',
      ]);
      const category: CharacterCategory =
        validCat.has(nc.category as CharacterCategory)
          ? (nc.category as CharacterCategory)
          : 'concept_objects';
      try {
        await this.dictionary.upsertAuto({
          slug,
          category,
          display_name:     String(nc.display_name ?? slug).slice(0, 200),
          visual_dna:       String(nc.visual_dna).slice(0, 2000),
          signature_action: nc.signature_action ? String(nc.signature_action).slice(0, 400) : undefined,
          personality:      nc.personality      ? String(nc.personality     ).slice(0, 400) : undefined,
          mood_palette:     nc.mood_palette     ? String(nc.mood_palette    ).slice(0, 200) : undefined,
        });
      } catch (e) {
        this.logger.warn(`Failed to upsert new character ${slug}: ${(e as Error).message}`);
      }
    }

    // 2. Resolve all slugs (main + supporting + cameo) to actual rows.
    const mainSlug    = parsed.main ? this.dictionary.resolve(parsed.main)            : null;
    const supportSlugs = (parsed.supporting ?? []).map((s) => this.dictionary.resolve(s)).filter((s): s is string => !!s);
    const cameoSlugs   = (parsed.cameo      ?? []).map((s) => this.dictionary.resolve(s)).filter((s): s is string => !!s);

    if (!mainSlug) {
      this.logger.warn(`Casting for "${titleForLog.slice(0, 60)}" returned no resolvable main protagonist`);
      return null;
    }
    const uniq = (xs: string[]) => Array.from(new Set(xs));
    const allSlugs = uniq([mainSlug, ...supportSlugs, ...cameoSlugs]);
    const rows = await this.dictionary.findManyBySlugs(allSlugs);
    const bySlug = new Map(rows.map((r) => [r.slug, r]));

    const main = bySlug.get(mainSlug);
    if (!main) return null;
    const supporting = uniq(supportSlugs).slice(0, 3)
      .map((s) => bySlug.get(s)).filter((c): c is Character => !!c)
      .filter((c) => c.slug !== mainSlug);
    const cameo = uniq(cameoSlugs).slice(0, 3)
      .map((s) => bySlug.get(s)).filter((c): c is Character => !!c)
      .filter((c) => c.slug !== mainSlug && !supporting.some((s) => s.slug === c.slug));

    return {
      main,
      supporting,
      cameo,
      reasoning: String(parsed.reasoning ?? '').trim().slice(0, 300),
    };
  }

  /** Format the seed roster as a compact list the LLM picks from.
   *  Includes aliases so the LLM can match common alt-names. */
  private formatRoster(): string {
    const byCategory = new Map<CharacterCategory, string[]>();
    for (const s of CHARACTER_SEED) {
      const line = `  - ${s.slug} (${s.display_name})` +
        (s.aliases?.length ? ` [aliases: ${s.aliases.join(', ')}]` : '');
      const arr = byCategory.get(s.category) ?? [];
      arr.push(line);
      byCategory.set(s.category, arr);
    }
    const cats: CharacterCategory[] = [
      'ai_brands','real_people','organizations','indian_archetypes','concept_objects',
    ];
    return cats.map((cat) => {
      const lines = byCategory.get(cat) ?? [];
      return `${cat.toUpperCase()}:\n${lines.join('\n')}`;
    }).join('\n\n');
  }

  private buildSystemPrompt(roster: string): string {
    return `
You are the CASTING DIRECTOR for AetherStackAI — a cartoon-anthropomorphism
YouTube channel covering AI news (audience: educated Indian tech viewers).

YOUR JOB
========
Given a news item, decide which CARTOON CHARACTERS will star in the script.
The subject(s) of the news — companies, models, people, regulations,
concepts — are personified as recurring cartoon characters, so the SAME
cartoon Sam Altman / Claude / EU Regulation appears across every script
that names them. Channel identity compounds over time.

THE ROSTER (existing characters — prefer these whenever applicable)
==================================================================
${roster}

INDIAN ARCHETYPES — use whenever the story mirrors a real-Indian-life
beat (a TCS fresher getting laid off, an anxious mother seeing AI news,
a UPSC aspirant trying ChatGPT, a kirana shopkeeper discovering UPI-like
tech, an auto driver adapting to ride-sharing apps).

CASTING TIERS (cast-level caps; per-scene visibility is decided later
by the scene writer with no per-scene character cap)
=====================================================================
- MAIN       → exactly 1 character. Drives the arc. Appears in every scene.
- SUPPORTING → 0 to 3 characters. Appear in scenes where their action
               or dialogue is relevant. May share scenes freely.
- CAMEO      → 0 to 3 characters. NAMED in narration ONLY. Never depicted.
- DROPPED    → everyone else the news mentions. Omitted entirely.

PICK MAIN BY
============
- Most central to the news event (the subject the verb acts on).
- Most visually iconic — a known character beats a generic concept.
- The character whose perspective makes the strongest emotional arc.

CHARACTER FORM (non-negotiable)
================================
Every character is a HUMAN. Always a person — a researcher, a host, a
shopkeeper, a judge, a student, an HR officer, a CEO. Even abstract
concepts (a regulation, an AI agent, an exam, a deepfake) appear as a
HUMAN who personifies or wields the concept. Brands and AI models also
appear as HUMAN ambassadors in the brand's colours, holding a device
showing the product — never as the logo itself, never as an animal,
never as a floating shape.

WHEN TO PROPOSE A NEW CHARACTER (rarely)
========================================
If the news centres on a subject that's NOT in the roster and will
plausibly recur (e.g. a major new AI lab, a new flagship model, a
notable regulator), propose it under "new_characters" with a full
visual_dna spec written in THE SAME STYLE as the roster: a stylized
3D Pixar-DreamWorks human character — age, skin tone, hair, outfit,
brand colour palette, signature accessory. It auto-saves so the next
script that mentions it stays consistent.

DO NOT propose new characters that are animals, logos, floating
shapes, robots, or any non-human form. DO NOT propose new characters
for one-off subjects (a single quoted analyst, an obscure named
startup that won't recur) — use a concept character instead.

OUTPUT (STRICT JSON ONLY — no preamble, no markdown fences)
============================================================
{
  "main":        "<slug>",
  "supporting":  ["<slug>", "<slug>"],
  "cameo":       ["<slug>", "<slug>"],
  "reasoning":   "<1-2 sentences: why this cast for this story>",
  "new_characters": [
    {
      "slug":             "<snake_case_slug>",
      "category":         "<ai_brands|real_people|organizations|indian_archetypes|concept_objects>",
      "display_name":     "<Title Case>",
      "visual_dna":       "<2-3 sentence cartoon spec in the shared style>",
      "signature_action": "<1 sentence>",
      "personality":      "<1 line>",
      "mood_palette":     "<comma-separated colours>"
    }
  ]
}

new_characters is OFTEN empty — only fill it for recurring subjects
missing from the roster. Most casts use existing slugs only.
`.trim();
  }
}
