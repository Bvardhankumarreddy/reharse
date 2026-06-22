import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Brand } from '../entities/brand.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import { ModelRouterService } from '../services/model-router.service';
import { BrandMemoryService } from '../services/brand-memory.service';
import { ProviderName } from '../services/provider.types';

// ── Types (parallel to AQB/AI Pulse scenes; same blueprint shape) ────────

export interface CsScene {
  scene_id:             string;
  /** Slug of the lesson outline section this scene belongs to. Lets the
   *  admin see chapter breakdown and lets the postmortem reason about
   *  which chapter's scenes worked best. */
  chapter_id:           string;
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

export interface CsVoiceoverSpec {
  full_text:    string;
  voice_style:  string;
  pacing_notes: string;
}

export interface CsMusicSpec {
  style:          string;
  tempo:          string;
  mood:           string;
  minimax_prompt: string;
}

export interface CsScenesPayload {
  scenes:             CsScene[];
  scene_count:        number;
  total_duration_sec: number;
  voiceover:          CsVoiceoverSpec;
  music:              CsMusicSpec;
}

/**
 * Content Studio scene agent — chapter-grouped cinematic storyboard for
 * 8-10 min lessons. Mirrors AQB / AI Pulse scene generators but:
 *
 *   - Density: 20-30 scenes per lesson (chapter-grouped, ~3-5 hero
 *     scenes per outline section), NOT one scene per 2-4 sec of audio.
 *     Per-second density would explode at this duration (100+ scenes).
 *
 *   - Visual identity: per-BRAND, not per-vertical. Brand voice/style
 *     fields plus 'style' / 'voice' brand memories are baked into every
 *     scene's "style" field inline.
 *
 *   - Format hint: lesson.lessonFormat (lecture / live_coding /
 *     walkthrough / interview / short) shapes scene composition. A
 *     live_coding lesson leans on screen-recording cutaways; a lecture
 *     leans on talking-head + B-roll.
 */
@Injectable()
export class SceneAgent {
  private readonly logger = new Logger(SceneAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    private readonly router: ModelRouterService,
    private readonly memories: BrandMemoryService,
    private readonly config: ConfigService,
  ) {}

  async generateForLesson(lessonId: string): Promise<CsScenesPayload> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    // Lesson script content — required to break into scenes.
    const scriptAsset = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
    const scriptText =
      (scriptAsset?.content as { fullScript?: string } | null | undefined)?.fullScript ?? '';
    if (!scriptText.trim()) {
      throw new BadRequestException(
        'Lesson has no script yet — generate the script first via the script agent.',
      );
    }

    // Per-brand visual memory — scene_pattern + voice + style memories
    // bias the LLM toward this brand's house look.
    const sceneMemories = await this.memories.semanticRelevantFor(
      brand.id, 'scene', `${lesson.title} ${lesson.hook ?? ''}`, 8,
    );
    const memoryBlock = this.memories.format(sceneMemories);

    const hostRef = this.config.get<string>('CS_HOST_REFERENCE_URL') ?? null;
    const baseStyle =
      this.config.get<string>('CS_BRAND_VISUAL_STYLE') ??
      'Documentary realism. Cinematic editorial film aesthetic. ARRI Alexa 65. ' +
      '85mm lens. Extremely shallow depth of field. Rich shadows. Premium ' +
      'architectural interior or environmental setting. 16:9 horizontal, ' +
      '1920x1080. Award-winning still photograph quality — every frame a ' +
      'magazine cover. Long-form lecture pacing, not short-form rapid cut.';

    const outlineBlock = (lesson.outline ?? [])
      .map(
        (s, i) =>
          `  ${i + 1}. [chapter_id="${slugify(s.heading)}"] ${s.heading}\n` +
          (s.points ?? []).map((p) => `       - ${p}`).join('\n'),
      )
      .join('\n');

    const system = this.buildSystem(brand, lesson, baseStyle, hostRef, memoryBlock);
    const user =
      `BRAND: ${brand.name}\nBrand voice/style: ${brand.voiceStyle ?? '(none)'}\n\n` +
      `LESSON ${lesson.lessonNumber}: ${lesson.title}\n` +
      `Format: ${lesson.lessonFormat ?? 'lecture'} · Explanation mode: ${lesson.explanationMode}\n` +
      `Target duration: ${lesson.targetDurationMinutes} min\n` +
      `Hook: ${lesson.hook ?? '(none)'}\n\n` +
      `OUTLINE (chapter_ids — tag every scene with one of these):\n` +
      `${outlineBlock || '  (no outline; infer chapters from the script)'}\n\n` +
      `FULL SCRIPT (preserve every word across scenes' spoken_text fields, in order):\n` +
      scriptText.slice(0, 12000) + `\n\n` +
      `Emit the JSON object per the system prompt. Start with "{". No preamble. ` +
      `Style + character_dna repeat verbatim in every scene.`;

    const r = await this.router.run({
      task: 'scene',
      agentType: 'scene',
      planId: plan.id,
      lessonId: lesson.id,
      modelOverride: brand.modelOverrides?.scene,
      jsonOutput: true,
      // Lessons are ~1500 words → ~2000 input tokens for script alone,
      // plus brand memory + system prompt. Output: 20-30 scenes ×
      // ~150 tokens (inline style + character_dna) + VO/music block ≈
      // 4500 tokens. 8000 max gives comfortable headroom.
      maxTokens: 8000,
      temperature: 0.8,
      system,
      user,
    });

    let parsed: CsScenesPayload;
    try {
      parsed = JSON.parse(r.text || '{}') as CsScenesPayload;
    } catch (e) {
      this.logger.error(
        `Scene-gen LLM returned non-JSON for lesson ${lessonId}: ` +
        `head="${(r.text ?? '').slice(0, 200)}"`,
      );
      throw new BadRequestException(
        `Scene generator returned malformed JSON. Retry usually fixes it. ${(e as Error).message}`,
      );
    }

    const combinedStyle =
      `${baseStyle} Brand voice/style: ${brand.voiceStyle ?? '(neutral)'}.`;
    const normalized = this.normalize(parsed, combinedStyle, hostRef, lesson);

    lesson.scenes = normalized;
    lesson.scenesGeneratedAt = new Date();
    lesson.scenesCostUsd = Number(lesson.scenesCostUsd ?? 0) + r.costUsd;
    await this.lessonRepo.save(lesson);

    // Track on the plan's running LLM total (consistent with other agents).
    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + r.costUsd,
    });

    this.logger.log(
      `CS scenes for lesson ${lessonId} (${brand.name}) — ` +
      `${normalized.scene_count} scenes / ${normalized.total_duration_sec}s · ` +
      `model=${r.model} (${r.provider as ProviderName}) · $${r.costUsd.toFixed(4)}`,
    );
    return normalized;
  }

  // ── Prompts ────────────────────────────────────────────────────────

  private buildSystem(
    brand: Brand,
    lesson: Lesson,
    baseStyle: string,
    hostRef: string | null,
    memoryBlock: string,
  ): string {
    const fmt = lesson.lessonFormat ?? 'lecture';
    const formatHint = LESSON_FORMAT_HINTS[fmt] ?? LESSON_FORMAT_HINTS.lecture;
    const hostBlock = hostRef
      ? `When the HOST appears, set "reference_image_url" EXACTLY to: ${hostRef}\n` +
        `Use ONLY for the intro chapter (opening direct-address moment) and ` +
        `the outro chapter (CTA / sign-off). For ALL other scenes, set ` +
        `"reference_image_url" to null.`
      : `(No host reference image configured. For host scenes, set ` +
        `"reference_image_url" to null and describe the host generically.)`;

    return `
You convert an 8-10 minute Content Studio lesson script into a CHAPTER-
GROUPED cinematic scene plan in the format used by AI filmmakers shipping
to VEO 3.1 / Sora / Gemini / ChatGPT. Each scene is a STRUCTURED JSON
OBJECT — NOT prose — and every consistency marker is repeated INLINE in
every scene so each scene is paste-ready.

═══════════════════════════════════════
GOAL
═══════════════════════════════════════
Cinematic storyboard for a long-form lesson. The viewer should be drawn
in by the visuals as much as the explanation. Each scene is a single
frozen frame designed to stop a scroll AND illustrate a concept.

═══════════════════════════════════════
DENSITY — CHAPTER-GROUPED, NOT PER-SECOND
═══════════════════════════════════════
- Total: 20-30 scenes per lesson (NOT 100+; this is long-form, not Reels).
- Each chapter (outline section) → 3-5 scenes:
    * 1 chapter opener / hero shot
    * 1-3 demonstration / B-roll cutaway scenes
    * Optionally 1 chapter transition
- Scene duration: 4-12 seconds each (lesson pacing — not 2-4 sec shorts).
- Total scene durations should approximately equal lesson runtime (±60s).
- EVERY scene must have a valid chapter_id matching one of the lesson's
  outline section slugs (provided in the user prompt). If outline is
  empty, infer chapter ids from the script's natural sections and
  reuse the same slug across scenes in that chapter.

═══════════════════════════════════════
THE NON-NEGOTIABLE: INLINE EVERYTHING
═══════════════════════════════════════
Per the AI filmmaker blueprint:
  "Do not give me a separate master prompt for consistency — include
   that inside all of the prompts already."

EVERY scene's JSON MUST include, verbatim across scenes:
  - "style"          — same cinematography + brand line every scene
  - "character_dna"  — same person descriptions every scene they appear in

THE STYLE TO PASTE VERBATIM into every scene's "style" field:
${baseStyle}
Brand voice/style note: ${brand.voiceStyle ?? '(neutral)'}.

═══════════════════════════════════════
LESSON FORMAT — "${fmt}"
═══════════════════════════════════════
${formatHint}

═══════════════════════════════════════
CHARACTER RULES (LIKENESS-SAFE)
═══════════════════════════════════════
- The protagonist is a generic role (e.g. "the instructor", "the student",
  "the engineer") — pick the description ONCE — age range, attire,
  posture — and repeat it verbatim in every scene's "character_dna" field.
- NEVER use a real person's name or recognisable likeness.
${hostBlock}

═══════════════════════════════════════
SCENE SCHEMA (every scene — same shape)
═══════════════════════════════════════
{
  "scene_id":            "<zero-padded 01, 02, …>",
  "chapter_id":          "<slug matching one of the outline headings>",
  "duration_seconds":    <int 4-12>,
  "spoken_text":         "<exact words from the script during this scene>",
  "setting":             "<location + time-of-day + atmosphere>",
  "subject":             "<who/what is the focal subject + action + position>",
  "shot":                "<shot type + lens + DoF + camera movement>",
  "lighting":            "<key + fill + colour temperature + mood>",
  "mood":                "<one emotional word>",
  "style":               "<PASTE THE STYLE STRING ABOVE VERBATIM>",
  "character_dna":       "<persistent character descriptions, identical every scene>",
  "reference_image_url": "<URL or null per host rules>"
}

═══════════════════════════════════════
SHOT VARIETY (USE A MIX PER CHAPTER)
═══════════════════════════════════════
Mix shot scales WITHIN each chapter, not just across chapters:
- Wide establishing  · Over-the-shoulder of screen / whiteboard
- Medium of host / instructor  · Close-up on hands writing / typing
- Detail (book, screen UI element, tool)  · Reaction shot
- Diagram / illustration cutaway (concept-level B-roll)
- Symbolic still life (clock, closed book, packed bag — emotional beats)

═══════════════════════════════════════
VOICEOVER + MUSIC (ONE BLOCK AT END)
═══════════════════════════════════════
"voiceover":
  - "full_text": full spoken script in order, pause markers preserved
  - "voice_style": calm, lesson-appropriate, NOT shorts-energy
  - "pacing_notes": where to slow down / breathe / land the key concepts

"music":
  - "style": underscore-bed appropriate to ${brand.voiceStyle ?? 'the brand'}
  - "tempo": e.g. "70 BPM, slow build, no drops"
  - "mood": studious / focused / inspiring (no club / EDM)
  - "minimax_prompt": ready-to-paste prompt for MiniMax / Lyria

${memoryBlock ? `═══════════════════════════════════════
WHAT'S WORKED ON THIS BRAND (from past winners — bias toward these)
═══════════════════════════════════════
${memoryBlock}

` : ''}═══════════════════════════════════════
OUTPUT (STRICT JSON — NO PREAMBLE, NO MARKDOWN FENCES)
═══════════════════════════════════════
Start with "{" and emit ONLY:
{
  "scenes": [ <20-30 scene objects in order, chapter-grouped> ],
  "scene_count":        <int>,
  "total_duration_sec": <int>,
  "voiceover": { "full_text": "…", "voice_style": "…", "pacing_notes": "…" },
  "music":     { "style": "…", "tempo": "…", "mood": "…", "minimax_prompt": "…" }
}
`.trim();
  }

  // ── Normalisation: enforce inline consistency + clamp ──────────────

  private normalize(
    parsed: CsScenesPayload,
    combinedStyle: string,
    hostRef: string | null,
    lesson: Lesson,
  ): CsScenesPayload {
    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];

    // Canonical character_dna — repaste any later scene that drifted off.
    const canonicalDna =
      rawScenes.find((s) => s?.character_dna?.trim())?.character_dna?.trim() ?? '';

    // Set of valid chapter ids from the outline; if a scene's chapter_id
    // doesn't match, we keep what the LLM emitted (no over-correction)
    // but log unknown ones for visibility.
    const validChapters = new Set(
      (lesson.outline ?? []).map((s) => slugify(s.heading)),
    );

    const scenes: CsScene[] = rawScenes
      .filter((s) => s && (s.subject ?? '').toString().trim())
      .map((s, i): CsScene => {
        const dur = Number(s.duration_seconds);
        const showsHost = isHostScene(s);
        const chapterId = String(s.chapter_id ?? 'intro').trim() || 'intro';
        return {
          scene_id:         String(s.scene_id ?? String(i + 1).padStart(2, '0')),
          chapter_id:       chapterId,
          duration_seconds: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 6,
          spoken_text:      String(s.spoken_text ?? '').trim(),
          setting:          String(s.setting ?? '').trim(),
          subject:          String(s.subject ?? '').trim(),
          shot:             String(s.shot ?? '').trim(),
          lighting:         String(s.lighting ?? '').trim(),
          mood:             String(s.mood ?? '').trim(),
          style:            combinedStyle,
          character_dna:    String(s.character_dna ?? canonicalDna).trim(),
          reference_image_url: showsHost ? hostRef : null,
        };
      });

    // Surface chapter_ids that didn't match the outline so the admin
    // notices if the LLM invented a chapter slug.
    const unknownChapters = new Set(
      scenes.map((s) => s.chapter_id).filter((c) => validChapters.size > 0 && !validChapters.has(c)),
    );
    if (unknownChapters.size > 0) {
      this.logger.warn(
        `Scenes for lesson ${lesson.id} have ${unknownChapters.size} ` +
        `chapter_id(s) not in outline: ${Array.from(unknownChapters).join(', ')}`,
      );
    }

    const totalDur = scenes.reduce((sum, s) => sum + s.duration_seconds, 0);

    return {
      scenes,
      scene_count:        scenes.length,
      total_duration_sec: totalDur,
      voiceover: {
        full_text:    String(parsed.voiceover?.full_text    ?? '').trim(),
        voice_style:  String(parsed.voiceover?.voice_style  ?? '').trim(),
        pacing_notes: String(parsed.voiceover?.pacing_notes ?? '').trim(),
      },
      music: {
        style:          String(parsed.music?.style          ?? '').trim(),
        tempo:          String(parsed.music?.tempo          ?? '').trim(),
        mood:           String(parsed.music?.mood           ?? '').trim(),
        minimax_prompt: String(parsed.music?.minimax_prompt ?? '').trim(),
      },
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function isHostScene(s: Partial<CsScene>): boolean {
  const blob = [
    s.subject, s.character_dna, s.reference_image_url,
  ].filter(Boolean).join(' ').toLowerCase();
  return /\b(host|instructor|vardhan)\b/.test(blob);
}

/** Match the chapter_id format used in the outline block (lowercase, dashes). */
function slugify(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'untitled';
}

/** Visual treatment hints per lesson format — biases scene composition. */
const LESSON_FORMAT_HINTS: Record<string, string> = {
  lecture:
    'Mostly instructor-led narration. Wider mix of B-roll cutaways, ' +
    'diagrams, screen captures, and reaction shots. Cut to instructor ' +
    'for emphasis, then immediately to a visual that illustrates the ' +
    'concept being explained. Avoid 14+ consecutive scenes of the ' +
    'instructor at a desk — vary scale and subject ruthlessly.',
  live_coding:
    'Heavy emphasis on over-the-shoulder screen shots showing real ' +
    'code being typed. Use close-ups on hands at the keyboard, screen ' +
    'detail of terminal output, IDE syntax highlights. Instructor face ' +
    'appears sparingly (intro / key insight / outro). Frame screens ' +
    'crisp — letters readable.',
  walkthrough:
    'Demonstration-led. Cut between the thing being demoed (a tool UI, ' +
    'a product surface, a workflow) and the instructor briefly framing ' +
    'each step. Heavy use of UI close-ups and pointer / hand interactions.',
  interview:
    'Two-character scenes (host + guest). Both should appear in ' +
    'character_dna as distinct archetypes. Use over-shoulder, two-shot, ' +
    'and reaction-shot variety. Setting consistent across most scenes ' +
    '(same room).',
  short:
    'Tighter pacing closer to AQB. 6-10 scenes only at 3-5s each.',
};
