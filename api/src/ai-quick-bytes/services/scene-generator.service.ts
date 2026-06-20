import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ShortScript } from '../entities/short-script.entity';
import { AnthropicClientService } from './anthropic-client.service';

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
  ) {}

  async generateFor(scriptId: string): Promise<AqbScenesPayload> {
    const script = await this.scriptRepo.findOne({
      where: { id: scriptId },
      relations: ['newsItem'],
    });
    if (!script) throw new NotFoundException('script not found');
    if (!script.fullScript?.trim()) {
      throw new BadRequestException('script has no fullScript to break into scenes');
    }

    const brandStyle =
      this.config.get<string>('aiQuickBytes.scenes.brandVisualStyle') ?? '';
    const hostRef =
      this.config.get<string | null>('aiQuickBytes.scenes.hostReferenceUrl') ?? null;

    const system = this.buildSystemPrompt(brandStyle, hostRef);
    const user   = this.buildUserPrompt(script);

    const { content: raw, usage, model } = await this.anthropic.completeJSON({
      system,
      user,
      temperature: 0.8,
      // Per-scene JSON + voiceover + music + 10-20 scenes — give plenty
      // of headroom; truncated JSON throws below with a clear error.
      maxTokens:   6000,
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

    const normalized = this.normalize(parsed, brandStyle, hostRef);
    const cost = this.calcCost(model, usage);

    script.scenes = normalized;
    script.scenesGeneratedAt = new Date();
    script.scenesCostUsd = Number(script.scenesCostUsd ?? 0) + cost;
    await this.scriptRepo.save(script);

    this.logger.log(
      `Scenes for ${scriptId} — ${normalized.scene_count} scenes / ` +
      `${normalized.total_duration_sec}s · $${cost.toFixed(4)}`,
    );
    return normalized;
  }

  // ── Prompts ────────────────────────────────────────────────────────

  private buildSystemPrompt(brandStyle: string, hostRef: string | null): string {
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
shot scales. Never two adjacent same-frame scenes.

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
CHARACTER RULES (LIKENESS-SAFE)
═══════════════════════════════════════
- The script's protagonist is a generic ROLE (e.g. "an engineer at
  Anthropic"). Pick the description ONCE — age, build, hair, attire —
  and repeat it verbatim in every scene's "character_dna" field.
  Example: "the engineer (early thirties, dark hair, wire-rimmed
  glasses, charcoal sweater)"
- NEVER use a real person's name or recognisable likeness.
${hostBlock}
- For the quote scene (see below), set character_dna to "(no human
  characters in this scene)".

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
  "character_dna":       "<persistent character descriptions, same string every scene>",
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

═══════════════════════════════════════
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

  private buildUserPrompt(script: ShortScript): string {
    return [
      `STORY SCRIPT (30-45 sec, AQB story mode)`,
      `Day: ${script.dayNumber ?? '?'}`,
      `Avatar slot: ${script.avatarId ?? 'vardhan'}`,
      ``,
      `Full script (preserve EVERY word in your scenes' "spoken_text" fields, in order):`,
      script.fullScript,
      ``,
      `Closing motivational quote already inlined above as part of the script — ` +
      `match its tone in the QUOTE scene.`,
      ``,
      `Now emit the JSON object per the system prompt. Start with "{". ` +
      `No preamble. Style + character_dna repeat verbatim in every scene.`,
    ].join('\n');
  }

  // ── Normalisation: clamp / repair / enforce inline consistency ─────

  private normalize(
    parsed: AqbScenesPayload,
    brandStyle: string,
    hostRef: string | null,
  ): AqbScenesPayload {
    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];

    // Discover canonical character_dna — first scene that has one. We
    // repaste it into any later scene that drifted off (Claude does this
    // sometimes after 10+ outputs).
    const canonicalDna =
      rawScenes.find((s) => s?.character_dna?.trim())?.character_dna?.trim() ?? '';

    const scenes: AqbScene[] = rawScenes
      .filter((s) => s && (s.subject ?? '').toString().trim())
      .map((s, i): AqbScene => {
        const dur = Number(s.duration_seconds);
        const showsHost = isHostScene(s);
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
          // Same enforcement for character_dna — use the first scene's
          // dna if a later scene dropped it.
          character_dna:    String(s.character_dna ?? canonicalDna).trim(),
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
