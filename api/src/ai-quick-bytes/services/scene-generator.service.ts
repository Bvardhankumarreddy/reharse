import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ShortScript } from '../entities/short-script.entity';
import { AnthropicClientService } from './anthropic-client.service';
import { AqbMemoryService } from './aqb-memory.service';
import { CharacterDictionaryService } from '../../characters/services/character-dictionary.service';
import { Character } from '../../characters/entities/character.entity';

/**
 * Cartoon-first brand style for AQB scenes. Pasted into every scene's
 * "style" field. MUST agree with the cartoon DNAs the casting system
 * injects — otherwise image gen / HeyGen Avatar IV sees mixed signals
 * (cartoon character + realistic cinematography) and defaults to realism.
 *
 * Current aesthetic: stylized 3D Pixar-meets-Indian-animation. Full 3D
 * rendering, not flat 2D. Cinematic depth-of-field + warm atmospheric
 * lighting + recognizably Indian settings. Reference style: Pixar /
 * DreamWorks / Disney 3D animation adapted for Indian audiences.
 */
const AQB_CARTOON_BRAND_STYLE =
  'Pixar-DreamWorks stylized 3D animation rendering. Full volumetric ' +
  'character animation with subsurface skin shading, soft ambient occlusion, ' +
  'shallow cinematic depth-of-field, golden-hour key lighting at 4500K, ' +
  'gentle rim light camera-left. Friendly Pixar character proportions: ' +
  'slightly larger head, big expressive eyes, simplified but detailed features. ' +
  'Saturated palette (marigold orange, kingfisher blue, ivory cream, terracotta). ' +
  'Recognizably Indian setting: chai tapri / IT office desk / household kitchen / ' +
  'auto rickshaw / college campus corridor / Bengaluru-Hyderabad street at golden hour. ' +
  '9:16 vertical aspect ratio, 1080x1920. Every character is HUMAN. ' +
  'Channel identity: AetherStackAI 3D cartoon universe — every scene reads as ' +
  'one continuous 3D animated short.';

// ── Types ─────────────────────────────────────────────────────────────

export interface AqbScene {
  scene_id:             string;
  duration_seconds:     number;
  spoken_text:          string;
  setting:              string;
  subject:              string;
  shot:                 string;
  lighting:             string;
  mood:                 string;
  style:                string;
  character_dna:        string;
  /** Slugs of characters depicted in THIS scene (max 3). Pulled from
   *  the script's cast field; the LLM chooses per scene from the
   *  available cast. Empty for pure still-life scenes (quote scene). */
  characters_in_scene?: string[];
  reference_image_url?: string | null;
}

export interface AqbVoiceoverSpec {
  full_text:    string;
  voice_style:  string;
  pacing_notes: string;
}

export interface AqbMusicSpec {
  style:          string;
  tempo:          string;
  mood:           string;
  minimax_prompt: string;
}

export interface AqbScenesPayload {
  scenes:             AqbScene[];
  scene_count:        number;
  total_duration_sec: number;
  voiceover:          AqbVoiceoverSpec;
  music:              AqbMusicSpec;
}

/**
 * AQB scene generator — adapted to the "AI Filmmaker Blueprint" format.
 *
 * Per-scene output is a STRUCTURED JSON OBJECT (not prose). Every
 * consistency marker — style, character DNA, reference image URL — is
 * repeated INLINE in every scene so each scene is fully self-contained
 * and paste-ready into VEO 3.1 / Sora / Gemini / ChatGPT without a
 * separate "master prompt" coordinating them.
 *
 * The script-level payload also includes a `voiceover` + `music` block
 * that the host pastes into MiniMax / Lyria / Suno to generate audio.
 *
 * Architectural insight that makes it not-cheesy: the SHOOTING DISCIPLINE
 * (lens, grade, aspect ratio, brand colour palette, host appearance) is
 * the SAME across every scene — controlled in this service from a single
 * source of truth (env-driven) — but inlined into every scene's JSON so
 * each scene "carries its own film inside it" per the blueprint.
 */
@Injectable()
export class SceneGeneratorService {
  private readonly logger = new Logger(SceneGeneratorService.name);

  constructor(
    @InjectRepository(ShortScript)
    private readonly scriptRepo: Repository<ShortScript>,
    private readonly anthropic: AnthropicClientService,
    private readonly config: ConfigService,
    private readonly memory: AqbMemoryService,
    private readonly characters: CharacterDictionaryService,
  ) {}

  async generateFor(
    scriptId: string,
    language: 'en' | 'te' = 'en',
  ): Promise<AqbScenesPayload> {
    const script = await this.scriptRepo.findOne({
      where: { id: scriptId },
      relations: ['newsItem'],
    });
    if (!script) throw new NotFoundException('script not found');

    // Pick the source script for spoken_text breakdown. Same cast +
    // visual style across languages — only the spoken_text in each
    // scene + the voiceover full_text change.
    const sourceScript = language === 'te'
      ? script.teluguFullScript?.trim()
      : script.fullScript?.trim();
    if (!sourceScript) {
      throw new BadRequestException(
        language === 'te'
          ? 'script has no teluguFullScript — run /telugu/regenerate-translation first'
          : 'script has no fullScript to break into scenes',
      );
    }
    // Cast-driven scenes — REQUIRE the script to have a cartoon cast.
    // Older scripts predating the casting system have characterCast=null
    // and must be regenerated before scenes can be (re)generated. This
    // is the explicit "regenerate script first" contract.
    if (!script.characterCast?.main) {
      throw new BadRequestException(
        'Script has no character cast — regenerate the script first so the ' +
        'casting director can pick the cartoon cast for this story. ' +
        'Existing scripts predating the cast system need a fresh generation pass.',
      );
    }

    // Resolve cast slugs → Character rows from the shared dictionary.
    // The script's cast is the source of truth; the dictionary supplies
    // the locked visual DNAs that pin character appearance.
    const allSlugs = Array.from(new Set([
      script.characterCast.main,
      ...(script.characterCast.supporting ?? []),
      // Cameos are named in narration but never depicted — exclude here.
    ]));
    const castRows = await this.characters.findManyBySlugs(allSlugs);
    const castBySlug = new Map(castRows.map((c) => [c.slug, c]));
    const mainChar = castBySlug.get(script.characterCast.main);
    if (!mainChar) {
      throw new BadRequestException(
        `Script cast references unknown main character "${script.characterCast.main}". ` +
        `Regenerate the script to pick a fresh cast.`,
      );
    }
    const supportingChars = (script.characterCast.supporting ?? [])
      .map((s) => castBySlug.get(s))
      .filter((c): c is Character => !!c);
    const depictedCast = [mainChar, ...supportingChars];
    const composedDna = this.characters.composeCharacterDna(depictedCast);

    // Cartoon-first brand style — pasted into every scene's "style" field.
    // The earlier realistic-cinematic default (ARRI Alexa / shallow DoF /
    // documentary lighting) conflicted with the cartoon character_dna we
    // now inject from the cast dictionary — image gen / HeyGen Avatar IV
    // saw both signals and defaulted to realism. Locking to cartoon style
    // here so style + character_dna agree.
    const brandStyle = AQB_CARTOON_BRAND_STYLE;
    const hostRef =
      this.config.get<string | null>('aiQuickBytes.scenes.hostReferenceUrl') ?? null;

    // Pull scene patterns mined from past winners (empty until the
    // improvement agent has run on ≥3 scene-enabled winning videos).
    // Self-improvement: each round of scene generation reads what worked
    // before and biases towards it.
    const memoryBlock = this.memory.format(
      await this.memory.relevantFor('scene', 8),
    );

    const system = this.buildSystemPrompt(brandStyle, hostRef, memoryBlock, depictedCast, composedDna, mainChar, language);
    const user   = this.buildUserPrompt(script, sourceScript, language);

    const { content: raw, usage, model } = await this.anthropic.completeJSON({
      system,
      user,
      temperature: 0.8,
      // Per-scene JSON + voiceover + music + 10-20 scenes. Bumped from
      // 6000 → 10000 after humans-only character DNAs (longer full-body
      // descriptions) + Google Flow specificity rules (8-15 words per
      // descriptor field) pushed responses past 6000 tokens and caused
      // "Unterminated string in JSON" truncation errors.
      maxTokens:   10000,
    });

    let parsed: AqbScenesPayload;
    try {
      parsed = JSON.parse(raw || '{}') as AqbScenesPayload;
    } catch (e) {
      this.logger.error(
        `Scene-gen LLM returned non-JSON for script ${scriptId}: ` +
        `head="${(raw ?? '').slice(0, 200)}"`,
      );
      throw new BadRequestException(
        `Scene generator returned malformed JSON. Retry usually fixes it. ${(e as Error).message}`,
      );
    }

    const normalized = this.normalize(parsed, brandStyle, hostRef, composedDna, depictedCast);
    const cost = this.calcCost(model, usage);

    if (language === 'te') {
      script.scenesTe = normalized;
      script.scenesTeGeneratedAt = new Date();
      script.scenesTeCostUsd = Number(script.scenesTeCostUsd ?? 0) + cost;
    } else {
      script.scenes = normalized;
      script.scenesGeneratedAt = new Date();
      script.scenesCostUsd = Number(script.scenesCostUsd ?? 0) + cost;
    }
    await this.scriptRepo.save(script);

    this.logger.log(
      `Scenes for ${scriptId} [${language}] — ${normalized.scene_count} scenes / ` +
      `${normalized.total_duration_sec}s · $${cost.toFixed(4)}`,
    );
    return normalized;
  }

  // ── Prompts ────────────────────────────────────────────────────────

  private buildSystemPrompt(
    brandStyle: string,
    hostRef: string | null,
    memoryBlock: string,
    cast: Character[],
    composedDna: string,
    mainChar: Character,
    language: 'en' | 'te',
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
You convert a 30-45 second AI Quick Bytes story script into a SHOT-BY-
SHOT scene plan in the format used by AI filmmakers shipping to VEO 3.1
/ Sora / Gemini / ChatGPT. Each scene is a STRUCTURED JSON OBJECT —
NOT prose — and every consistency marker is repeated INLINE in every
scene so each scene is fully self-contained and paste-ready.

═══════════════════════════════════════
GOAL
═══════════════════════════════════════
A scrolling viewer must stop on ANY single frame as if it were a
magazine cover. Each scene = one frozen cinematic moment. Cut between
shot scales. Vary the framing across consecutive scenes.

═══════════════════════════════════════
PROMPT-QUALITY RULES (Google Flow / VEO / Sora best-practice)
═══════════════════════════════════════
Image generators respond best to POSITIVE, SPECIFIC, CONSISTENT prompts.
Write every per-scene field this way:

- POSITIVE FRAMING ONLY. Say what is IN the frame, never what is
  missing. Replace "no cars" with "empty street". Replace "not
  cluttered" with "minimal props: a single mug on a wood table".
- SPECIFIC DESCRIPTORS, NEVER VAGUE. Replace "beautiful" / "cool" /
  "atmospheric" with measurable language: "golden-hour 4500K key
  light from camera-left", "shallow depth-of-field at f/2.0",
  "marigold-orange sari with kingfisher-blue dupatta".
- ONE FOCAL ENVIRONMENT per scene. Pick a single setting (e.g.
  "kitchen counter near a sunlit window"). Avoid sprawling busy
  backgrounds with multiple competing subjects.
- LEAN IN ON SPECIFICITY. "subject", "shot", "lighting" should each be
  8-15 words with a verb + concrete detail. Do NOT over-condense.
- CONSISTENCY BETWEEN FIELDS. The "subject" + "setting" + "lighting"
  + character_dna must agree (same time-of-day, same character outfit
  across consecutive scenes, same vibe). Contradictions confuse the
  generator and produce inconsistent output.

═══════════════════════════════════════
THE NON-NEGOTIABLE: INLINE EVERYTHING
═══════════════════════════════════════
The blueprint we are following explicitly says:
  "Do not give me a separate master prompt for consistency — include
   that inside all of the prompts already."

Therefore EVERY scene's JSON MUST include, repeated verbatim across
scenes:
  - "style"          — the SAME cinematography line in every scene
  - "character_dna"  — every recurring character described the SAME WAY
                       in every scene they could plausibly appear in

THE BRAND STYLE (paste verbatim into every scene's "style" field):
${brandStyle || '(no brand style configured — invent a coherent cinematic look and reuse it verbatim)'}

═══════════════════════════════════════
CHARACTER RULES (CARTOON CAST — LOCKED DNA)
═══════════════════════════════════════
This story uses an anthropomorphic-cartoon cast — the same cartoon
characters recur across every script that mentions them, so channel
identity compounds. CharacterCastingService already picked this cast:

THE CAST FOR THIS STORY
${cast.map((c) => `  • ${c.slug} (${c.display_name}) — ${c.signature_action ?? ''}`).join('\n')}

MAIN protagonist: ${mainChar.slug} (${mainChar.display_name}). This
character appears in EVERY scene that has any character at all.

PER-SCENE CHARACTER ASSIGNMENT (you decide this)
- For each scene, choose 1-3 character SLUGS from the cast above and
  list them in "characters_in_scene" (e.g. ["${mainChar.slug}"] or
  ["${mainChar.slug}", "${cast[1]?.slug ?? mainChar.slug}"]).
- MAX 3 characters per scene (image gen breaks beyond that and DNA
  consistency suffers).
- The MAIN protagonist appears in every scene with characters.
- SUPPORTING characters join only in scenes where the spoken_text
  references them or their action is relevant.
- Pure still-life / abstract scenes (the QUOTE scene) → empty array [].

CHARACTER_DNA FIELD (every scene — locked, do NOT improvise visuals)
- We will deterministically inject the locked cartoon DNA for the
  chosen characters into the character_dna field after generation, so
  you may emit a placeholder like "(see locked cast DNA)" — it'll be
  replaced. What MATTERS is that you correctly populate
  "characters_in_scene" with the right slugs.

${hostBlock}

═══════════════════════════════════════
SCENE SCHEMA (every scene — same shape)
═══════════════════════════════════════
{
  "scene_id":            "<zero-padded 01, 02, …>",
  "duration_seconds":    <int 2-4>,
  "spoken_text":         "<exact words from the script during this scene; '' for silent scenes>",
  "setting":             "<location + time-of-day + atmosphere>",
  "subject":             "<who/what is the focal subject + action + position in frame>",
  "shot":                "<shot type + lens + aperture/DoF + camera movement>",
  "lighting":            "<key + fill + colour temperature + mood>",
  "mood":                "<one emotional word: frustration | awe | hope | fear | curiosity | quiet>",
  "style":               "<PASTE THE BRAND STYLE VERBATIM>",
  "character_dna":       "(see locked cast DNA — injected post-gen)",
  "characters_in_scene": ["<cast slug>", "..."],
  "reference_image_url": "<URL string or null per host rules>"
}

═══════════════════════════════════════
DURATION + COVERAGE DISCIPLINE
═══════════════════════════════════════
- 10-20 scenes total. Most 2-4 seconds.
- The script's full spoken text MUST be split across scenes in order,
  with no words skipped and no words duplicated. Concatenated
  "spoken_text" fields = original script (ignoring pause markers).
- Total of all "duration_seconds" ≈ script's spoken duration (±3s OK).

═══════════════════════════════════════
SHOT VARIETY (USE A MIX)
═══════════════════════════════════════
- Wide establishing (office at dusk, city window, workspace overhead)
- Medium / three-quarter back of protagonist
- Close-up on hands (typing, holding paper, pouring coffee)
- Over-the-shoulder of a screen (code, chat window, dashboard)
- Environmental detail (lamp, rain on window, empty chair)
- Reaction shot (eyes lit by monitor glow, small smile, sigh)
- Symbolic still life (clock at 2 a.m., closed door, stacked notebooks)

═══════════════════════════════════════
SPECIAL SCENES (REQUIRED)
═══════════════════════════════════════
- QUOTE SCENE: the penultimate beat where the closing motivational
  quote is voiced. Set subject = pure still-life or abstract metaphor
  matched to the quote's tone (single lamp in dark, doorway opening
  to sunrise, ink drying on paper). character_dna = "(no human
  characters in this scene)". reference_image_url = null.
- CTA SCENE: the final scene, host direct-address. Warm natural light,
  subtle smile. Use reference_image_url per host rules above.

═══════════════════════════════════════
VOICEOVER + MUSIC (ONE BLOCK AT END)
═══════════════════════════════════════
After all scenes, emit a single "voiceover" + "music" block so the
host can paste straight into MiniMax / Lyria / Suno.

"voiceover":
  - "full_text": the full spoken script in order, with pause markers
    preserved as " [1 sec pause] " / " [2 sec pause] "
  - "voice_style": e.g. "Calm Indian-English male narrator, mid-30s,
    contemplative pace, warm low chest voice, soft consonants"
  - "pacing_notes": e.g. "1s pause after cold open; 2s pause before
    payoff line; slow down on the quote"

"music":
  - "style": e.g. "Cinematic ambient, minimal piano + sub bass, slow
    build to soft drop at payoff"
  - "tempo": e.g. "60 BPM, slow"
  - "mood": match the script's emotional anchor
  - "minimax_prompt": one ready-to-paste prompt string combining style
    + tempo + mood + structural beats (intro, build, drop, outro)

${memoryBlock ? `═══════════════════════════════════════
WHAT'S WORKED ON THIS CHANNEL (from past winners — bias toward these)
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
    script: ShortScript,
    sourceScript: string,
    language: 'en' | 'te',
  ): string {
    const langLabel = language === 'te' ? 'TELUGU' : 'ENGLISH';
    return [
      `STORY SCRIPT (30-45 sec, AQB story mode) — ${langLabel}`,
      `Day: ${script.dayNumber ?? '?'}`,
      `Avatar slot: ${script.avatarId ?? 'vardhan'}`,
      ``,
      `Full script (${langLabel} — preserve EVERY word in your scenes' "spoken_text" fields, in order; do NOT translate, the script is already in ${langLabel}):`,
      sourceScript,
      ``,
      `Closing motivational quote already inlined above as part of the script — ` +
      `match its tone in the QUOTE scene.`,
      ``,
      `Now emit the JSON object per the system prompt. Start with "{". ` +
      `No preamble. Style + character_dna repeat verbatim in every scene. ` +
      `spoken_text MUST be in ${langLabel} (do not translate).`,
    ].join('\n');
  }

  // ── Normalisation: clamp / repair / enforce inline consistency ─────

  private normalize(
    parsed: AqbScenesPayload,
    brandStyle: string,
    hostRef: string | null,
    composedDna: string,
    depictedCast: Character[],
  ): AqbScenesPayload {
    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];

    // Build a quick lookup so per-scene DNAs can be composed deterministically
    // from the slugs the LLM emitted in characters_in_scene. Anything that
    // isn't in the cast is silently dropped (defends against LLM hallucinations).
    const castBySlug = new Map(depictedCast.map((c) => [c.slug, c]));
    const validSlugs = new Set(castBySlug.keys());

    const scenes: AqbScene[] = rawScenes
      .filter((s) => s && (s.subject ?? '').toString().trim())
      .map((s, i): AqbScene => {
        const dur = Number(s.duration_seconds);
        const showsHost = isHostScene(s);

        // Clamp characters_in_scene to: known slugs only, deduped, max 3.
        // Empty array (silent / still-life scene) is preserved.
        const rawChars = Array.isArray(s.characters_in_scene) ? s.characters_in_scene : [];
        const chars = Array.from(new Set(
          rawChars.map((c) => String(c).toLowerCase().trim())
            .filter((c) => validSlugs.has(c)),
        )).slice(0, 3);

        // Per-scene character_dna composed from the slugs the LLM picked.
        // If the LLM forgot to populate characters (and the scene isn't a
        // pure still-life), we silently fall back to the full composed DNA
        // so the scene still ships with a known cast description.
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
          // Enforce the inline-style rule: every scene gets the brand
          // style verbatim even if the LLM trimmed it on later scenes.
          style:            brandStyle || String(s.style ?? '').trim(),
          // Deterministic — never trust the LLM's character_dna; we always
          // overwrite with the dictionary-composed string for the chosen
          // cast in this scene. Guarantees cross-scene + cross-script DNA
          // consistency.
          character_dna:    characterDna,
          characters_in_scene: chars,
          // Host scenes get the reference URL; non-host scenes are
          // forced to null even if the LLM put a URL on them by mistake.
          reference_image_url: showsHost ? hostRef : null,
        };
      });

    const totalDur = scenes.reduce((sum, s) => sum + s.duration_seconds, 0);

    const voiceover: AqbVoiceoverSpec = {
      full_text:    String(parsed.voiceover?.full_text    ?? '').trim(),
      voice_style:  String(parsed.voiceover?.voice_style  ?? '').trim(),
      pacing_notes: String(parsed.voiceover?.pacing_notes ?? '').trim(),
    };
    const music: AqbMusicSpec = {
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

  private calcCost(
    model: string,
    usage?: { prompt_tokens?: number; completion_tokens?: number },
  ): number {
    const inTok = usage?.prompt_tokens ?? 0;
    const outTok = usage?.completion_tokens ?? 0;
    const rates: Record<string, [number, number]> = {
      'claude-sonnet-4-6':         [3,  15],
      'claude-opus-4-7':           [15, 75],
      'claude-haiku-4-5-20251001': [1,   5],
    };
    const [inRate, outRate] = rates[model] ?? rates['claude-sonnet-4-6'];
    return (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * outRate;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Heuristic: a scene "shows the host" when its subject or
 * character_dna mentions the host by name OR when the LLM tagged
 * reference_image_url. Cheap string check — false positives only
 * inflate the count of scenes that get the reference URL, which is
 * harmless (the image-gen tool only honours it when the prompt
 * actually asks for the host).
 */
function isHostScene(s: Partial<AqbScene>): boolean {
  const blob = [
    s.subject, s.character_dna, s.reference_image_url,
  ].filter(Boolean).join(' ').toLowerCase();
  return /\b(host|vardhan)\b/.test(blob);
}
