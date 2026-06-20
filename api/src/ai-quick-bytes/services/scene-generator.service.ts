import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ShortScript } from '../entities/short-script.entity';
import { AnthropicClientService } from './anthropic-client.service';

export interface AqbScene {
  scene:       string;   // "01" zero-padded
  duration:    string;   // "3s"
  spoken_text: string;   // exact words spoken during this scene
  prompt:      string;   // full cinematic prompt, ready to paste into ChatGPT
}

export interface AqbScenesPayload {
  scenes:             AqbScene[];
  scene_count:        number;
  total_duration_sec: number;
}

/**
 * Breaks a story-mode AQB script into 12-18 cinematic image prompts —
 * one per scene of 2-4 seconds. Designed for ChatGPT (DALL·E / GPT
 * Image 1) where the host pastes one prompt at a time, with the
 * configured reference image attached when the host appears in the
 * frame.
 *
 * Architectural insight (the bit that makes this work):
 * We separate WHAT each scene shows (subject + emotion + composition —
 * the LLM varies these per scene) from HOW each scene is shot (lens,
 * grade, aspect ratio — fixed across all scenes, appended automatically).
 * The LLM doesn't have to remember the brand cinematography on every
 * scene; we guarantee consistency by post-processing.
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
    const user = this.buildUserPrompt(script);

    const { content: raw, usage, model } = await this.anthropic.completeJSON({
      system,
      user,
      temperature: 0.8,    // high — we want creative scene variety
      maxTokens:   4000,   // ~20 scenes × ~80 words/prompt fits comfortably
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
      ? `When the HOST appears in frame, end that scene's prompt with this ` +
        `EXACT line on its own:\n` +
        `  Reference image (use this person's face and build for likeness): ${hostRef}\n` +
        `Use this ONLY for scenes 01 (cold open if the host appears) and ` +
        `the final CTA scene. Most scenes have NO host — they show the ` +
        `story's protagonist or environmental detail.`
      : `(No host reference image is configured. When the host appears, ` +
        `describe him generically: "young Indian male, late 20s, glasses, ` +
        `navy hoodie or blazer, calm direct gaze". Use this ONLY for the ` +
        `final CTA scene.)`;

    return `
You break a 30-45 second AI Quick Bytes story script into a sequence
of cinematic IMAGE prompts (not video clips — still frames). Each
scene = one frozen moment. A scrolling viewer must stop on ANY single
frame as if it were a magazine cover.

═══════════════════════════════════════
THE CORE DISCIPLINE
═══════════════════════════════════════
Every scene prompt is a CINEMATIC POSTER:
- ONE subject (a person OR hands OR object OR environment — never crowded)
- ONE emotion / atmosphere (frustration, awe, hope, fear, curiosity)
- ONE light source (key light direction + colour)
- ONE focal point (where the eye lands in 0.3 sec)

You describe WHAT the scene shows — we automatically append the HOW
(lens, grade, aspect ratio, aesthetic). Don't repeat the cinematography
block in your prompts; just describe the moment in vivid prose.

═══════════════════════════════════════
SHOT VARIETY (USE A MIX — DON'T REPEAT)
═══════════════════════════════════════
- Wide establishing shot (a room, a city window, a workspace at dusk)
- Medium shot of the protagonist (back-three-quarter, side profile)
- Close-up on hands (typing, holding a notebook, gripping a coffee cup)
- Over-the-shoulder of a screen (code, a chat window, a dashboard)
- Environmental detail (a desk lamp, rain on the window, an empty chair)
- Reaction shot (eyes lit by monitor glow, a sigh, a small smile)
- Symbolic still life (a clock at 2 a.m., a stack of paper, a closed door)

Aim for variety — never two adjacent scenes of "protagonist sitting
at desk staring at screen". Cut between scales (wide → close-up →
detail → reaction).

═══════════════════════════════════════
CHARACTER RULES (NON-NEGOTIABLE)
═══════════════════════════════════════
- The script's "protagonist" field tells you the role (e.g. "an
  engineer at Anthropic"). Describe them by ARCHETYPE + age range +
  attire — NEVER as a named or recognisable person.
- The same archetype is described the SAME WAY in every scene that
  shows them (continuity). Pick once at scene 02 and reuse: e.g.,
  "the engineer (early thirties, dark hair, wire-rimmed glasses,
  charcoal sweater)".
- The HOST is a SEPARATE character from the story protagonist.
${hostBlock}

═══════════════════════════════════════
QUOTE SCENE (SPECIAL — IT WILL BE IN THE SCRIPT)
═══════════════════════════════════════
The script's penultimate beat contains a closing motivational quote
("And to leave you with this — '…' — Author."). Generate ONE scene
for this — but the visual rules are different:
- NO host in the frame
- NO story protagonist in the frame
- It is a STILL-LIFE or ABSTRACT METAPHOR shot — let the words breathe
- Match the quote's TONE (stoic / hopeful / hungry / quiet) to the
  visual: e.g., a single lamp in a dark room, a doorway opening to
  sunrise, ink drying on paper, an empty stage with light spilling in
- Pure environment / object. No people.

═══════════════════════════════════════
CTA SCENE (FINAL)
═══════════════════════════════════════
The very last scene shows the HOST in a direct-address moment:
warm natural light, subtle smile, looking just past camera or
straight to lens. Include the host reference image line if configured.

═══════════════════════════════════════
DURATION DISCIPLINE
═══════════════════════════════════════
- Use 10-20 scenes total. Most should be 2-4 seconds.
- Total duration of all scenes ≈ script's spoken duration (±3 sec OK).
- Match scene boundaries to natural sentence / clause breaks in the
  script — every word of the script must appear in some scene's
  "spoken_text", in order, with NO words skipped and NO words
  duplicated across scenes.

═══════════════════════════════════════
WRITING THE PROMPT (60-110 words per scene)
═══════════════════════════════════════
Start with the SETTING (where + when + light), then the SUBJECT (who
or what), then the ACTION FROZEN (one specific moment), then the
EMOTION conveyed. Use concrete sensory detail — never adjectives like
"beautiful" or "amazing". Specifics over abstractions.

Example of GOOD (note: no cinematography descriptors — those auto-append):
  "Interior of a quiet open-plan office in San Francisco, 9:47 p.m.
  Most desks empty, half the overhead lights off. A single workstation
  glows blue with a code editor open on a vertical monitor. The
  engineer (early thirties, dark hair, wire-rimmed glasses, charcoal
  sweater) is seated three-quarter back to camera, head bowed,
  fingers paused mid-type. Quiet fatigue."

Example of BAD:
  "An engineer working hard on a problem. Looks frustrated. Modern
  office. Dramatic." (vague, no sensory detail, no specific moment)

═══════════════════════════════════════
OUTPUT (STRICT JSON ONLY — no preamble, no markdown fences)
═══════════════════════════════════════
{
  "scenes": [
    {
      "scene": "01",
      "duration": "3s",
      "spoken_text": "<exact words from the script, in order>",
      "prompt": "<60-110 word cinematic description per the rules above; for host scenes only, end with the reference image line>"
    },
    …
  ],
  "scene_count": <int>,
  "total_duration_sec": <int>
}
`.trim();
  }

  private buildUserPrompt(script: ShortScript): string {
    return [
      `STORY SCRIPT (45 sec, story mode)`,
      `Protagonist: (extract from script, e.g. "an engineer at Anthropic")`,
      ``,
      `Full script (preserve every word in your scenes' spoken_text fields):`,
      script.fullScript,
      ``,
      `Generate the scene JSON now. Distribute the words across 10-20 scenes; ` +
      `each scene 2-4 seconds. Cut between shot scales. Reserve one scene for ` +
      `the closing quote (no people) and the final scene for the host CTA.`,
    ].join('\n');
  }

  // ── Normalisation: append brand cinematography to every prompt ─────

  private normalize(
    parsed: AqbScenesPayload,
    brandStyle: string,
    hostRef: string | null,
  ): AqbScenesPayload {
    const scenes = (parsed.scenes ?? [])
      .filter((s) => s && s.prompt?.trim())
      .map((s, i): AqbScene => {
        const sceneNum = String(s.scene ?? String(i + 1).padStart(2, '0'));
        const duration = String(s.duration ?? '3s');
        const spokenText = String(s.spoken_text ?? '').trim();
        const promptCore = String(s.prompt ?? '').trim();

        // Append the brand cinematography block ONCE — single source of
        // truth, so changing AQB_BRAND_VISUAL_STYLE in env updates every
        // future scene without re-prompting the LLM.
        const promptWithStyle = brandStyle
          ? `${promptCore}\n\n${brandStyle}`
          : promptCore;

        // Safety net: if the LLM mentioned the host but forgot the
        // reference-image line, append it. (Detected via keywords —
        // imperfect but better than silently dropping it.)
        const mentionsHost = /\b(host|vardhan)\b/i.test(promptCore);
        const refLine = hostRef
          ? `\n\nReference image (use this person's face and build for likeness): ${hostRef}`
          : '';
        const finalPrompt =
          mentionsHost && refLine && !promptCore.includes(hostRef ?? '___')
            ? `${promptWithStyle}${refLine}`
            : promptWithStyle;

        return {
          scene:       sceneNum,
          duration,
          spoken_text: spokenText,
          prompt:      finalPrompt,
        };
      });

    const totalDur = scenes.reduce(
      (sum, s) => sum + (parseInt(s.duration, 10) || 3),
      0,
    );
    return {
      scenes,
      scene_count:        scenes.length,
      total_duration_sec: totalDur,
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
