import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiPulseScript } from '../entities/news-script.entity';
import { AiPulseVertical } from '../entities/news-item.entity';
import {
  VERTICAL_SCENE_ACCENTS, VERTICALS, VerticalSceneAccent,
} from '../config/verticals.config';
import { AiPulseMemoryService } from './memory.service';
import { CharacterDictionaryService } from '../../characters/services/character-dictionary.service';
import { Character } from '../../characters/entities/character.entity';

/**
 * Cartoon-first brand style for AI Pulse scenes. Mirrors the AQB cartoon
 * brand style — both modules share one stylized 3D Pixar-Indian cinematic
 * universe; only the per-vertical accent overlay differs.
 */
const AI_PULSE_CARTOON_BRAND_STYLE =
  'STYLIZED 3D ANIMATION ONLY — NOT photoreal, NOT live-action. ' +
  'Style: stylized 3D Pixar-meets-Indian-animation rendering. ' +
  'Friendly Pixar/DreamWorks-style proportions — slightly larger heads, big expressive eyes, ' +
  'simplified-but-detailed cartoon-realism. Full 3D character animation with subtle ambient occlusion, ' +
  'soft cinematic depth-of-field, warm atmospheric lighting (golden hour preferred). ' +
  'Recognizably Indian context: chai tapri, IT office, household kitchen, auto rickshaw, ' +
  'Bengaluru/Hyderabad street, college campus. ' +
  '9:16 vertical aspect ratio for Shorts. Channel identity: AetherStackAI 3D cartoon universe — ' +
  'every scene must look like it came from the SAME 3D animated short.';

// ── Types (parallel to AQB scenes; same blueprint shape) ────────────────

export interface AiPulseScene {
  scene_id:             string;
  duration_seconds:     number;
  spoken_text:          string;
  setting:              string;
  subject:              string;
  shot:                 string;
  lighting:             string;
  mood:                 string;
  style:                string;       // INLINE per blueprint
  character_dna:        string;       // INLINE per blueprint
  /** Slugs of characters depicted in this scene (max 3). Pulled from
   *  script.cast; LLM picks per scene. Empty for still-life scenes. */
  characters_in_scene?: string[];
  reference_image_url?: string | null;
}

export interface AiPulseVoiceoverSpec {
  full_text:    string;
  voice_style:  string;
  pacing_notes: string;
}

export interface AiPulseMusicSpec {
  style:          string;
  tempo:          string;
  mood:           string;
  minimax_prompt: string;
}

export interface AiPulseScenesPayload {
  scenes:             AiPulseScene[];
  scene_count:        number;
  total_duration_sec: number;
  voiceover:          AiPulseVoiceoverSpec;
  music:              AiPulseMusicSpec;
}

/**
 * AI Pulse scene generator — mirrors AQB SceneGeneratorService but with
 * a per-vertical visual accent overlay so ai_business / tech_industry /
 * ai_science / ai_education / ai_society scenes feel like distinct
 * "studio sets" under one channel.
 *
 * Same blueprint discipline: per-scene structured JSON, style +
 * character_dna inlined in every scene, voiceover + music block for
 * MiniMax / Lyria / Suno paste.
 */
@Injectable()
export class AiPulseSceneGeneratorService {
  private readonly logger = new Logger(AiPulseSceneGeneratorService.name);
  private readonly openai: OpenAI | null;

  constructor(
    @InjectRepository(AiPulseScript)
    private readonly scripts: Repository<AiPulseScript>,
    private readonly config: ConfigService,
    private readonly memory: AiPulseMemoryService,
    private readonly characters: CharacterDictionaryService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generateFor(
    scriptId: string,
    language: 'en' | 'te' = 'en',
  ): Promise<AiPulseScenesPayload> {
    if (!this.openai) throw new Error('OPENAI_API_KEY not configured');

    const script = await this.scripts.findOne({ where: { id: scriptId } });
    if (!script) throw new NotFoundException('script not found');

    // Pick the source script for spoken_text breakdown — same cast +
    // visual style across languages, only spoken_text changes.
    const sourceScript = language === 'te'
      ? script.telugu_full_script?.trim()
      : script.english_full_script?.trim();
    if (!sourceScript) {
      throw new BadRequestException(
        language === 'te'
          ? 'script has no telugu_full_script — translate the script first'
          : 'script has no english_full_script to break into scenes',
      );
    }
    // Cast-driven scenes — REQUIRE the script to have a cartoon cast.
    // Older scripts predating the casting system have character_cast=null
    // and must be regenerated before scenes can be (re)generated.
    if (!script.character_cast?.main) {
      throw new BadRequestException(
        'Script has no character cast — regenerate the script first so the ' +
        'casting director can pick the cartoon cast for this story. ' +
        'Existing scripts predating the cast system need a fresh generation pass.',
      );
    }

    // Resolve cast slugs → Character rows from the shared dictionary.
    const allSlugs = Array.from(new Set([
      script.character_cast.main,
      ...(script.character_cast.supporting ?? []),
    ]));
    const castRows = await this.characters.findManyBySlugs(allSlugs);
    const castBySlug = new Map(castRows.map((c) => [c.slug, c]));
    const mainChar = castBySlug.get(script.character_cast.main);
    if (!mainChar) {
      throw new BadRequestException(
        `Script cast references unknown main character "${script.character_cast.main}". ` +
        `Regenerate the script to pick a fresh cast.`,
      );
    }
    const supportingChars = (script.character_cast.supporting ?? [])
      .map((s) => castBySlug.get(s))
      .filter((c): c is Character => !!c);
    const depictedCast = [mainChar, ...supportingChars];
    const composedDna = this.characters.composeCharacterDna(depictedCast);

    const vertical = script.vertical;
    const accent   = VERTICAL_SCENE_ACCENTS[vertical];
    const verticalLabel = VERTICALS[vertical]?.display_name ?? vertical;

    // Cartoon-first brand style — pasted into every scene's "style" field.
    // The realistic-documentary default conflicted with the cartoon
    // character_dna injected by the cast dictionary, so image gen
    // defaulted to realism. Locking to cartoon style here so style +
    // character_dna agree (HeyGen Avatar IV / ChatGPT image gen / Sora
    // all render cartoon as a result).
    const baseStyle = AI_PULSE_CARTOON_BRAND_STYLE;

    const hostRef = this.config.get<string>('AI_PULSE_HOST_REFERENCE_URL') ?? null;

    // Per-vertical scene memory — empty until improvement service has
    // mined ≥3 scene-enabled winners in this vertical.
    const memoryBlock = this.memory.format(
      await this.memory.relevantFor(vertical, 'scene', 8),
    );

    const system = this.buildSystemPrompt(
      vertical, verticalLabel, accent, baseStyle, hostRef, memoryBlock,
      depictedCast, mainChar,
    );
    const user = this.buildUserPrompt(script, verticalLabel, sourceScript, language);

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      // Per-scene JSON + voiceover + music + 10-20 scenes — give plenty
      // of headroom so the response never truncates mid-string.
      max_tokens: 6000,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let parsed: AiPulseScenesPayload;
    try {
      parsed = JSON.parse(raw) as AiPulseScenesPayload;
    } catch (e) {
      this.logger.error(
        `Scene-gen LLM returned non-JSON for script ${scriptId}: ` +
        `head="${(raw ?? '').slice(0, 200)}"`,
      );
      throw new BadRequestException(
        `Scene generator returned malformed JSON. Retry usually fixes it. ${(e as Error).message}`,
      );
    }

    // Combined style string (base + per-vertical accent) — pasted into
    // every scene's "style" field by normalize().
    const combinedStyle =
      `${baseStyle} Per-vertical accent: palette = ${accent.palette}; ` +
      `props = ${accent.props}; settings = ${accent.settings}.`;

    const normalized = this.normalize(parsed, combinedStyle, hostRef, composedDna, depictedCast);
    const cost = this.calcCost(completion.usage);

    if (language === 'te') {
      script.scenes_te = normalized;
      script.scenes_te_generated_at = new Date();
      script.scenes_te_cost_usd = Number(script.scenes_te_cost_usd ?? 0) + cost;
    } else {
      script.scenes = normalized;
      script.scenes_generated_at = new Date();
      script.scenes_cost_usd = Number(script.scenes_cost_usd ?? 0) + cost;
    }
    await this.scripts.save(script);

    this.logger.log(
      `AI Pulse scenes for ${scriptId} (${vertical}) [${language}] — ` +
      `${normalized.scene_count} scenes / ${normalized.total_duration_sec}s · ` +
      `$${cost.toFixed(4)}`,
    );
    return normalized;
  }

  // ── Prompts ────────────────────────────────────────────────────────

  private buildSystemPrompt(
    vertical: AiPulseVertical,
    verticalLabel: string,
    accent: VerticalSceneAccent,
    baseStyle: string,
    hostRef: string | null,
    memoryBlock: string,
    cast: Character[],
    mainChar: Character,
  ): string {
    const hostBlock = hostRef
      ? `When the HOST (Vardhan) appears in a scene, set the scene's ` +
        `"reference_image_url" to EXACTLY: ${hostRef}\n` +
        `Use ONLY for the final CTA scene (and optionally the cold open ` +
        `if the host narrates on-camera). For ALL other scenes, set ` +
        `"reference_image_url" to null.`
      : `(No host reference image configured. For host scenes, set ` +
        `"reference_image_url" to null; describe the host generically in ` +
        `"subject" as "young Indian male, late 20s, glasses, navy hoodie".)`;

    return `
You convert a 30-45 second AI Pulse story script (vertical: ${verticalLabel})
into a SHOT-BY-SHOT scene plan in the format used by AI filmmakers shipping
to VEO 3.1 / Sora / Gemini / ChatGPT. Each scene is a STRUCTURED JSON OBJECT
— NOT prose — and every consistency marker is repeated INLINE in every
scene so each scene is paste-ready.

═══════════════════════════════════════
GOAL
═══════════════════════════════════════
A scrolling viewer must stop on ANY single frame as if it were a magazine
cover. Each scene = one frozen cinematic moment. Cut between shot scales.
Never two adjacent same-frame scenes.

═══════════════════════════════════════
THE NON-NEGOTIABLE: INLINE EVERYTHING
═══════════════════════════════════════
Per the AI filmmaker blueprint:
  "Do not give me a separate master prompt for consistency — include
   that inside all of the prompts already."

EVERY scene's JSON MUST include, verbatim across scenes:
  - "style"          — the SAME cinematography + accent line in every scene
  - "character_dna"  — every recurring character described the SAME WAY

THE STYLE TO PASTE VERBATIM into every scene's "style" field:
${baseStyle}
Per-vertical accent (${verticalLabel}): palette = ${accent.palette};
props = ${accent.props}; settings = ${accent.settings}.

═══════════════════════════════════════
THIS VERTICAL'S VISUAL IDENTITY (${verticalLabel})
═══════════════════════════════════════
Palette:       ${accent.palette}
Settings:      ${accent.settings}
Props:         ${accent.props}
Archetypes:    ${accent.character_archetypes}
Default mood:  ${accent.mood_default}

Lean into these. Different verticals look DIFFERENT. An ai_business scene
should not look like an ai_science scene.

═══════════════════════════════════════
CHARACTER RULES (CARTOON CAST — LOCKED DNA)
═══════════════════════════════════════
This story uses an anthropomorphic-cartoon cast — the same cartoon
characters recur across every script that mentions them, so channel
identity compounds. CharacterCastingService already picked this cast:

THE CAST FOR THIS STORY
${cast.map((c) => `  • ${c.slug} (${c.display_name}) — ${c.signature_action ?? ''}`).join('\n')}

MAIN protagonist: ${mainChar.slug} (${mainChar.display_name}). Appears
in every scene that has any character at all.

PER-SCENE CHARACTER ASSIGNMENT (you decide this)
- For each scene, choose 1-3 character SLUGS from the cast above and
  list them in "characters_in_scene" (e.g. ["${mainChar.slug}"] or
  ["${mainChar.slug}", "${cast[1]?.slug ?? mainChar.slug}"]).
- MAX 3 characters per scene (image gen breaks beyond that).
- MAIN appears in every scene with characters; SUPPORTING joins when
  the spoken_text references them or their action is relevant.
- Pure still-life / closing-citation scenes → empty array [].

CHARACTER_DNA FIELD (auto-injected — do NOT improvise visuals)
- The locked cartoon DNAs for the chosen characters get deterministically
  pasted into the character_dna field after generation, so you may emit a
  placeholder like "(see locked cast DNA)" — it'll be replaced. What
  MATTERS is that you correctly populate "characters_in_scene".

${hostBlock}

═══════════════════════════════════════
SCENE SCHEMA (every scene — same shape)
═══════════════════════════════════════
{
  "scene_id":            "<zero-padded 01, 02, …>",
  "duration_seconds":    <int 2-4>,
  "spoken_text":         "<exact words from the script during this scene; '' for silent scenes>",
  "setting":             "<location + time-of-day + atmosphere matching the vertical>",
  "subject":             "<who/what is the focal subject + action + position in frame>",
  "shot":                "<shot type + lens + aperture/DoF + camera movement>",
  "lighting":            "<key + fill + colour temperature + mood>",
  "mood":                "<one emotional word>",
  "style":               "<PASTE THE STYLE STRING ABOVE VERBATIM, with the per-vertical accent>",
  "character_dna":       "(see locked cast DNA — injected post-gen)",
  "characters_in_scene": ["<cast slug>", "..."],
  "reference_image_url": "<URL string or null per host rules>"
}

═══════════════════════════════════════
DURATION + COVERAGE DISCIPLINE
═══════════════════════════════════════
- 10-18 scenes total. Most 2-4 seconds.
- The script's full spoken text MUST be split across scenes in order,
  no words skipped, no duplicates. Concatenated "spoken_text" fields =
  original script (ignoring pause markers).
- Total of all "duration_seconds" ≈ script's spoken duration (±3s OK).

═══════════════════════════════════════
SHOT VARIETY (USE A MIX)
═══════════════════════════════════════
- Wide establishing (office at dusk, city window, lab corridor)
- Medium / three-quarter back of protagonist
- Close-up on hands (typing, holding paper, pouring tea)
- Over-the-shoulder of a screen (code, dashboard, news article)
- Environmental detail (specific to the vertical's props above)
- Reaction shot (eyes lit by monitor glow, small smile, sigh)
- Symbolic still life (clock at 2 a.m., closed door, stacked notebooks)

═══════════════════════════════════════
VOICEOVER + MUSIC (ONE BLOCK AT END)
═══════════════════════════════════════
After all scenes, emit a single "voiceover" + "music" block so the host
can paste straight into MiniMax / Lyria / Suno.

"voiceover":
  - "full_text": the full spoken script in order, pause markers preserved
  - "voice_style": e.g. "Calm Indian-English male narrator, mid-30s,
    contemplative pace, warm low chest voice, soft consonants"
  - "pacing_notes": when to slow down, breathe, emphasise

"music":
  - "style": ONE line matched to vertical's mood (see default above)
  - "tempo": e.g. "60 BPM, slow build"
  - "mood": ${accent.mood_default}
  - "minimax_prompt": one ready-to-paste prompt for MiniMax / Lyria

${memoryBlock ? `═══════════════════════════════════════
WHAT'S WORKED ON THIS VERTICAL (from past winners — bias toward these)
═══════════════════════════════════════
${memoryBlock}

` : ''}═══════════════════════════════════════
OUTPUT (STRICT JSON — NO PREAMBLE, NO MARKDOWN FENCES)
═══════════════════════════════════════
Your response MUST start with "{" and contain ONLY:
{
  "scenes": [ <one object per scene, in order> ],
  "scene_count":        <int>,
  "total_duration_sec": <int>,
  "voiceover": { "full_text": "…", "voice_style": "…", "pacing_notes": "…" },
  "music":     { "style": "…", "tempo": "…", "mood": "…", "minimax_prompt": "…" }
}
`.trim();
  }

  private buildUserPrompt(
    script: AiPulseScript,
    verticalLabel: string,
    sourceScript: string,
    language: 'en' | 'te',
  ): string {
    const langLabel = language === 'te' ? 'TELUGU' : 'ENGLISH';
    const title = language === 'te'
      ? (script.telugu_title ?? script.english_title ?? '(untitled)')
      : (script.english_title ?? '(untitled)');
    const hook  = language === 'te'
      ? (script.telugu_hook  ?? script.english_hook  ?? '')
      : (script.english_hook ?? '');
    return [
      `AI PULSE STORY SCRIPT — vertical: ${verticalLabel} — ${langLabel}`,
      `Title: ${title}`,
      `Hook:  ${hook}`,
      ``,
      `Full script (${langLabel} — preserve EVERY word across scenes' "spoken_text" fields, in order; do NOT translate, the script is already in ${langLabel}):`,
      sourceScript,
      ``,
      `Emit the JSON object per the system prompt. Start with "{". ` +
      `No preamble. Style + character_dna repeat verbatim in every scene. ` +
      `spoken_text MUST be in ${langLabel} (do not translate).`,
    ].join('\n');
  }

  // ── Normalisation: clamp / repair / enforce inline consistency ─────

  private normalize(
    parsed: AiPulseScenesPayload,
    combinedStyle: string,
    hostRef: string | null,
    composedDna: string,
    depictedCast: Character[],
  ): AiPulseScenesPayload {
    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];

    const castBySlug = new Map(depictedCast.map((c) => [c.slug, c]));
    const validSlugs = new Set(castBySlug.keys());

    const scenes: AiPulseScene[] = rawScenes
      .filter((s) => s && (s.subject ?? '').toString().trim())
      .map((s, i): AiPulseScene => {
        const dur = Number(s.duration_seconds);
        const showsHost = isHostScene(s);

        // Clamp characters_in_scene to known slugs, deduped, max 3.
        const rawChars = Array.isArray(s.characters_in_scene) ? s.characters_in_scene : [];
        const chars = Array.from(new Set(
          rawChars.map((c) => String(c).toLowerCase().trim())
            .filter((c) => validSlugs.has(c)),
        )).slice(0, 3);

        // Per-scene DNA composed from chosen slugs; falls back to full
        // cast DNA when scene has none (silent / still-life beat).
        const characterDna = chars.length > 0
          ? this.characters.composeCharacterDna(chars.map((c) => castBySlug.get(c)!).filter(Boolean))
          : composedDna;

        return {
          scene_id:         String(s.scene_id ?? String(i + 1).padStart(2, '0')),
          duration_seconds: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 3,
          spoken_text:      String(s.spoken_text ?? '').trim(),
          setting:          String(s.setting ?? '').trim(),
          subject:          String(s.subject ?? '').trim(),
          shot:             String(s.shot ?? '').trim(),
          lighting:         String(s.lighting ?? '').trim(),
          mood:             String(s.mood ?? '').trim(),
          style:            combinedStyle,
          // Deterministic — always overwrite with dictionary-composed DNA
          // so the same cartoon characters look the same across scripts.
          character_dna:    characterDna,
          characters_in_scene: chars,
          reference_image_url: showsHost ? hostRef : null,
        };
      });

    const totalDur = scenes.reduce((sum, s) => sum + s.duration_seconds, 0);

    const voiceover: AiPulseVoiceoverSpec = {
      full_text:    String(parsed.voiceover?.full_text    ?? '').trim(),
      voice_style:  String(parsed.voiceover?.voice_style  ?? '').trim(),
      pacing_notes: String(parsed.voiceover?.pacing_notes ?? '').trim(),
    };
    const music: AiPulseMusicSpec = {
      style:          String(parsed.music?.style          ?? '').trim(),
      tempo:          String(parsed.music?.tempo          ?? '').trim(),
      mood:           String(parsed.music?.mood           ?? '').trim(),
      minimax_prompt: String(parsed.music?.minimax_prompt ?? '').trim(),
    };

    return {
      scenes,
      scene_count:        scenes.length,
      total_duration_sec: totalDur,
      voiceover,
      music,
    };
  }

  private calcCost(usage?: { prompt_tokens?: number; completion_tokens?: number }): number {
    // gpt-4o: $2.50/M input, $10/M output
    return ((usage?.prompt_tokens ?? 0) / 1_000_000) * 2.5
         + ((usage?.completion_tokens ?? 0) / 1_000_000) * 10;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function isHostScene(s: Partial<AiPulseScene>): boolean {
  const blob = [
    s.subject, s.character_dna, s.reference_image_url,
  ].filter(Boolean).join(' ').toLowerCase();
  return /\b(host|vardhan)\b/.test(blob);
}
