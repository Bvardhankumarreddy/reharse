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
  'Pixar-DreamWorks stylized 3D animation rendering. Full volumetric ' +
  'character animation with subsurface skin shading, soft ambient occlusion, ' +
  'shallow cinematic depth-of-field, golden-hour key lighting at 4500K, ' +
  'gentle rim light camera-left. Friendly Pixar character proportions: ' +
  'slightly larger head, big expressive eyes, simplified but detailed features. ' +
  'Saturated palette (marigold orange, kingfisher blue, ivory cream, terracotta). ' +
  '9:16 vertical aspect ratio, 1080x1920. Every character is HUMAN. ' +
  'Channel identity: AetherStackAI 3D cartoon universe — every scene reads as ' +
  'one continuous 3D animated short.';

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
      // Per-scene JSON + voiceover + music + 10-20 scenes. Bumped from
      // 6000 → 10000 after humans-only character DNAs (longer full-body
      // descriptions) + Google Flow specificity rules (8-15 words per
      // descriptor field) pushed responses past 6000 tokens and caused
      // "Unterminated string in JSON" truncation errors.
      max_tokens: 10000,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let parsed: AiPulseScenesPayload;
    try {
      parsed = parseScenesJson(raw);
    } catch (e) {
      this.logger.error(
        `Scene-gen LLM returned non-JSON for script ${scriptId}: ` +
        `head="${(raw ?? '').slice(0, 200)}" ` +
        `tail="${(raw ?? '').slice(-200)}"`,
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
DIRECTOR ANCHOR — channel a top scene generator
═══════════════════════════════════════
You are not a prompt-writer. You are a SCENE DIRECTOR with a specific
sensibility. Channel the following references as you choose subjects,
framing, lighting, and beats:

PRIMARY: PETE DOCTER (Pixar — Up, Inside Out, Soul)
- Emotional truth through small physical detail (a hand reaching, a
  tea cup wobbling, a glance held one beat longer)
- Character-driven framing: the camera respects the character's eyeline
- Restraint — never show what implication can carry
- Color and light do the emotional heavy lifting

SECONDARY (use when the beat asks for it):
- SS RAJAMOULI (RRR, Baahubali) — hero shots, payoff frames, epic
  punch. Reach for low-angle wide shots when the reveal lands.
- SUKUMAR (Pushpa, Rangasthalam) — character-defining lighting and
  blocking in Indian settings (chai tapri, village courtyard, IT office)
- HAYAO MIYAZAKI (Ghibli) — atmospheric mundane-magical for kitchen /
  household / quiet golden-hour beats
- TRIVIKRAM SRINIVAS — clean, observed Indian everyday blocking; let
  rooms and props do dialogue work

Avoid: flat establishing shots that read like stock footage, busy
multi-subject frames that compete for attention, generic
"professional office" / "modern lab" settings without specificity.

═══════════════════════════════════════
GOAL
═══════════════════════════════════════
A scrolling viewer must stop on ANY single frame as if it were a magazine
cover. Each scene = one frozen cinematic moment, the way Pete Docter
would freeze it. Cut between shot scales. Vary framing across
consecutive scenes.

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
- SETTING IS DERIVED FROM THE SCRIPT, NOT A DEFAULT. The "setting"
  field MUST come from the story's actual narrative — where these
  specific characters would plausibly be in this specific beat (the
  newsroom where the story breaks, the courtroom where the verdict
  lands, the lab where the model is trained, the boardroom where the
  deal closes, the bedroom at 3 a.m., the temple courtyard, the
  Mumbai local at rush hour, the Hyderabad biryani shop, the Delhi
  metro platform, an exam hall, a kirana store, a server room, a
  monsoon-soaked porch — whatever the SCRIPT puts them in). Do NOT
  default to "chai tapri" or "Bengaluru street at golden hour" unless
  the script genuinely takes place there. Vary settings across scenes
  in the same script; vary across scripts on the channel.

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
- For each scene, choose ANY subset of the cast above and list slugs
  in "characters_in_scene" (e.g. ["${mainChar.slug}"] solo, or
  ["${mainChar.slug}", "${cast[1]?.slug ?? mainChar.slug}"] duo, or
  the entire cast for crowd / press conference / boardroom scenes).
- NO HARD CAP — pick what the story needs. Trade-off: image gen
  renders 1-3 characters with strong DNA fidelity; 4+ shares detail
  budget so each face/outfit gets less attention. Use larger groups
  only when the scene truly benefits (cast reveal, ensemble payoff).
- MAIN appears in every scene with characters; SUPPORTING joins when
  the spoken_text references them or their action matters to the beat.
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
SCENE BOUNDARY RULE — first word of every scene matters
═══════════════════════════════════════
HOW you split decides retention. Each scene's "spoken_text" MUST start
with a HIGH-IMPACT word — a named character, a concrete noun, a strong
verb, a number, or a question word. Never start a scene on a
connector or filler that the viewer can't anchor on.

WEAK first words to AVOID at the start of any scene's spoken_text:
  And, But, So, Then, Now, Also, However, Because, While, When, If,
  As, Or, Yet, Plus, Actually, Basically, Essentially, Anyway, Well,
  You see, You know

If a natural sentence break in the script puts a connector at the
start of the next chunk, MOVE that connector to the END of the
previous scene's spoken_text. Example:

  WRONG:
    Scene 4 spoken_text: "Pichai unveils Gemini 3."
    Scene 5 spoken_text: "And it changes the API race."

  RIGHT (connector moved to end of previous chunk):
    Scene 4 spoken_text: "Pichai unveils Gemini 3. And…"
    Scene 5 spoken_text: "it changes the API race."

Never invent words to recompose a slice — only reshuffle script words
that already exist. Concatenated spoken_text must still equal the
original script (ignoring pause markers).

Hook discipline: scene 1's first word is the channel's first impression.
Pick the scene boundary that lands a name, a number, a vivid verb, or
a sharp image on word #1.

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

JSON-SAFETY RULES (parser will reject otherwise):
- Every double-quote that appears INSIDE a string value MUST be escaped
  as \\". A Telugu spoken_text containing the dialogue మీకు తెలుసా?
  must be written without internal double-quotes, or every such quote
  MUST be backslash-escaped.
- Prefer using SINGLE quotes inside string values when you need to
  show speech ('మీకు తెలుసా?' instead of "మీకు తెలుసా?").
- No trailing commas after the last element of any array or object.
- No comments (// or /* */) anywhere in the output.
- No markdown fences, no preamble — start the response with "{".
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

        // Clamp characters_in_scene to known slugs, deduped — no per-scene
        // cap, LLM decides based on narrative need (crowds, press
        // conferences, ensemble payoffs are all valid).
        const rawChars = Array.isArray(s.characters_in_scene) ? s.characters_in_scene : [];
        const chars = Array.from(new Set(
          rawChars.map((c) => String(c).toLowerCase().trim())
            .filter((c) => validSlugs.has(c)),
        ));

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

/**
 * Defensive scene JSON parser — mirror of the AQB version. Recovery:
 *   1. Plain JSON.parse fast path
 *   2. Strip ```json fences
 *   3. Extract between first '{' and last '}' (handles trailing prose)
 *   4. Repair unescaped quotes inside string values (most common
 *      failure when Telugu spoken_text contains dialogue marks like
 *      "మీకు తెలుసా?")
 */
function parseScenesJson(raw: string): AiPulseScenesPayload {
  const tryParse = (s: string): AiPulseScenesPayload | null => {
    try { return JSON.parse(s) as AiPulseScenesPayload; } catch { return null; }
  };
  let parsed = tryParse(raw);
  if (parsed) return parsed;

  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  parsed = tryParse(cleaned);
  if (parsed) return parsed;

  const first = cleaned.indexOf('{');
  const last  = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const slice = cleaned.slice(first, last + 1);
    parsed = tryParse(slice);
    if (parsed) return parsed;

    const repaired = repairUnescapedQuotes(slice);
    parsed = tryParse(repaired);
    if (parsed) return parsed;
  }
  return JSON.parse(raw) as AiPulseScenesPayload;
}

function repairUnescapedQuotes(s: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') {
      out += ch + (s[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '"') {
      if (!inString) { inString = true; out += ch; continue; }
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      const next = s[j];
      if (next === ',' || next === '}' || next === ']' || next === ':' || next === undefined) {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}
