import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import { ModelRouterService } from '../services/model-router.service';
import { ImprovementLoopService } from '../services/improvement-loop.service';
import { BrandMemoryService } from '../services/brand-memory.service';
import { ProviderName } from '../services/provider.types';
import { LessonFormat } from '../entities/content-series.entity';

/**
 * 'with_screen_recording' override — used when lesson.explanationMode is
 * set to with_screen_recording. The script comes back as JSON: narration
 * (talking-head body) + a structured screenRecordingCues array. Works on
 * top of any lessonFormat — the format informs tone, the mode adds cues.
 */
const SCREEN_RECORDING_SYSTEM = `
You write AUDIO + SCREEN-RECORDING LESSON SCRIPTS for AetherStackAI (host:
Vardhan). The host narrates a talking-head body AND records 2-5 short
screen clips that are inter-cut at the cue points.

RULES (non-negotiable):
- TARGET LENGTH: 8-10 minutes total spoken delivery (≈ 1100-1500 words
  combined across narration + voice-over). Use heavy [PAUSE] markers.
- HOOK: the very first sentence IS the hook — concrete stakes in the
  first 8 seconds. Open IN the moment.
- 2-5 SCREEN CUES — only when a visual genuinely beats words. Each cue
  has a clear what_to_record (exact actions, paths, commands, URLs) and
  a voice_over_script the host reads OVER the recording.
- PAUSE MARKERS: [PAUSE], [PAUSE 1.5s], [PAUSE 2s] for natural cadence.
- QUIZ TEASE: 1-2 sentences referencing the Saturday quiz scope at the end.
- NO filler intros, NO placeholders, real tools/names/numbers.

OUTPUT STRICT JSON ONLY:
{
  "narration_script": "<full talking-head body with [SCREEN: <slug>]
                       placeholders where the screen cues are inter-cut,
                       1100-1500 words combined>",
  "screen_recording_cues": [
    {
      "slug":              "<matches [SCREEN: <slug>] in the narration>",
      "section_title":     "<short title>",
      "what_to_record":    "<exact screen actions — paths, commands, URLs,
                            buttons to click>",
      "voice_over_script": "<narration the host reads OVER this recording>",
      "estimated_duration_seconds": <int>
    }
  ],
  "key_takeaways": ["<takeaway 1>", "<takeaway 2>", "<takeaway 3>"]
}
Output the JSON object only — no prose, no markdown fences.
`.trim();

/**
 * Format-specific SYSTEM prompts. The `lecture` style is the original
 * 8-12 min audio script. Other formats reshape the output for that
 * delivery medium — same brand voice rules, different structure.
 */
const SYSTEM_BY_FORMAT: Record<LessonFormat, string> = {
  lecture: `
You write AUDIO SCRIPTS for educational YouTube lessons. The script is READ
ALOUD by a host — write for the ear, not the page.

RULES (non-negotiable):
- TARGET LENGTH: 8–12 minutes spoken (≈ 1100–1700 words at ~140 wpm).
- HOOK: the very first sentence IS the hook — concrete stakes (a number, a
  failure, a "most people get this wrong") in the first 8 seconds. Open IN
  the moment. Never "In this video we'll cover…".
- PAUSE MARKERS: use [PAUSE] for a natural breath, [PAUSE 1.5s] before a
  reveal, [PAUSE 2s] for a dramatic beat. Inline at end of a sentence or on
  their own line.
- VOICE: obey the brand voice/style/do/don't memories provided — verbatim.
- STRUCTURE: hook → why it matters → core concept with one real, named
  example → common mistake → recap → quiz tease.
- QUIZ TEASE: end with 1–2 sentences referencing the brand's Saturday quiz
  on this week's theme (use the quiz scope provided).
- NO filler intros, NO unexplained acronyms, NO "imagine a system" — use
  real companies / tools / numbers.

OUTPUT: the raw script only. No headers, no scene labels, no markdown — just
spoken text with pause markers.
`.trim(),

  live_coding: `
You write LIVE-CODING DEMO SCRIPTS for screen-recorded lessons. The host
narrates over a code/IDE/terminal demo — write a structured demo plan with
narration cues.

RULES (non-negotiable):
- TARGET LENGTH: 12–18 minutes recorded.
- HOOK: open with concrete stakes in the first 8 seconds — what we're
  building and why anyone watching will care (a number, a bug, a real
  outage). Then cut to the screen.
- STRUCTURE: [HOOK] → [SETUP — what we have, what we'll build] →
  [STEP 1] → [STEP 2] → [STEP 3] (more if needed) → [GOTCHA / common
  mistake at this point] → [PAYOFF / it works] → [RECAP] → [QUIZ TEASE].
- SECTION MARKERS: each section starts with a header line in CAPS, e.g.:
    HOOK
    SETUP
    STEP 1 — INSTALL THE LIBRARY
    GOTCHA
    PAYOFF
    RECAP
    QUIZ TEASE
- Under each header, write the NARRATION the host speaks — first person,
  conversational ("Okay, watch this — I'll…"). Then on a new line write
  ON-SCREEN: <what the viewer sees>: the exact command, file path, code
  block, or click. Code blocks go in fenced triple-backtick blocks.
- Use real libraries / package names / commands. No placeholder "your-tool".
- QUIZ TEASE: 1–2 sentences referencing the Saturday quiz scope.

OUTPUT: the demo script only — headers + narration + ON-SCREEN cues.
`.trim(),

  walkthrough: `
You write UI WALKTHROUGH SCRIPTS for screen-recorded product/tool tours.
The host narrates while clicking through a real dashboard, console, or
SaaS UI.

RULES:
- TARGET LENGTH: 6–10 minutes.
- HOOK: first 8 seconds — what the viewer will be able to DO after watching.
- STRUCTURE: [HOOK] → [WHAT THIS TOOL IS] → [STEP-BY-STEP through the
  flow] → [GOTCHA] → [RECAP] → [QUIZ TEASE].
- SECTION MARKERS in CAPS exactly like the live_coding format.
- Under each section: narration in first person, then on a new line
  ON-SCREEN: <what to click / where to look>.
- Use real button labels, menu paths, URL patterns. No placeholders.
- QUIZ TEASE: 1–2 sentences referencing the Saturday quiz scope.

OUTPUT: the walkthrough script only.
`.trim(),

  interview: `
You write TWO-VOICE INTERVIEW SCRIPTS — HOST and GUEST in conversation.

RULES:
- TARGET LENGTH: 10–14 minutes.
- HOOK: HOST opens with one concrete stakes line in the first 8 seconds.
- FORMAT: prefix every line with HOST: or GUEST: (no other speakers).
- STRUCTURE: hook → context question → core question → drill-down on a
  real example → disagreement / nuance moment → recap → quiz tease.
- The GUEST voice should sound expert but human — say "I" and "in our
  team", not "one might consider".
- Use [PAUSE] markers between turns for a natural cadence.
- QUIZ TEASE: HOST closes with 1–2 sentences on the Saturday quiz scope.

OUTPUT: the dialogue only — HOST:/GUEST: lines with [PAUSE] markers.
`.trim(),

  short: `
You write 30–60 SECOND SHORTS — vertical-format teaser/recap scripts.

RULES:
- TARGET LENGTH: 90–160 words (≈ 30–60 seconds at fast pace).
- HOOK: first 5 words MUST make someone stop scrolling. A number, a
  contradiction, or a stakes question.
- STRUCTURE: hook → ONE punchy point → one real example → ONE-line CTA
  pointing at the full lesson on the channel.
- NO PAUSE markers — fast pace, no breath room.
- Voice obeys brand memories verbatim.

OUTPUT: the raw spoken text only. No headers, no markdown.
`.trim(),
};

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Words-per-minute estimate by format (used for duration display). */
const WPM_BY_FORMAT: Record<LessonFormat, number> = {
  lecture: 140,
  live_coding: 120, // slower — explaining + typing
  walkthrough: 130,
  interview: 145,
  short: 170,       // fast-paced
};

@Injectable()
export class ScriptAgent {
  private readonly logger = new Logger(ScriptAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    private readonly router: ModelRouterService,
    private readonly loop: ImprovementLoopService,
    private readonly memories: BrandMemoryService,
  ) {}

  async generateScript(lessonId: string): Promise<ContentAsset> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const fmt: LessonFormat = lesson.lessonFormat ?? 'lecture';
    const mode = lesson.explanationMode ?? 'inline';
    // Screen-recording mode wins — it returns structured JSON regardless
    // of format. Inline mode falls back to the format-specific raw-text prompt.
    const SYSTEM = mode === 'with_screen_recording'
      ? SCREEN_RECORDING_SYSTEM
      : SYSTEM_BY_FORMAT[fmt];

    const memories = await this.memories.semanticRelevantFor(
      brand.id, 'script', `${lesson.title} ${lesson.hook ?? ''}`, 8,
    );
    const memoryBlock = this.memories.format(memories);
    const outlineBlock = (lesson.outline ?? [])
      .map(
        (s, i) =>
          `  ${i + 1}. ${s.heading}\n` +
          (s.points ?? []).map((p) => `     - ${p}`).join('\n'),
      )
      .join('\n');
    const userBase =
      `BRAND: ${brand.name}\n` +
      `Voice/style: ${brand.voiceStyle ?? ''}\n\n` +
      `WEEK THEME: ${plan.theme ?? '(none)'}\n` +
      `QUIZ SCOPE (use for the tease at the end): ${plan.quizScope ?? '(none)'}\n\n` +
      `LESSON ${lesson.lessonNumber}: ${lesson.title}\n` +
      `Format: ${fmt}\n` +
      `Explanation mode: ${mode}\n` +
      `Hook seed: ${lesson.hook ?? '(none)'}\n` +
      `Target duration: ${lesson.targetDurationMinutes} minutes.\n` +
      `Outline:\n${outlineBlock || '  (no outline)'}\n\n` +
      `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n` +
      (mode === 'with_screen_recording'
        ? `Write the script as JSON per the system prompt — narration body ` +
          `with [SCREEN: <slug>] cue points + a screen_recording_cues array.`
        : `Write the full ${fmt} script now per the rules above.`);

    interface ScreenRecordingCue {
      slug?: string;
      section_title?: string;
      what_to_record?: string;
      voice_over_script?: string;
      estimated_duration_seconds?: number;
    }
    interface ScriptDraft {
      script: string;
      screenRecordingCues?: ScreenRecordingCue[];
      keyTakeaways?: string[];
    }

    const result = await this.loop.run<ScriptDraft>({
      agentType: 'script',
      planId: plan.id,
      lessonId: lesson.id,
      memoryCount: memories.length,
      graderModelOverride: brand.modelOverrides?.grader,
      context:
        `Lesson: ${lesson.title} (${lesson.targetDurationMinutes} min, ${fmt}, ${mode}) · ` +
        `Brand: ${brand.name} · Voice: ${(brand.voiceStyle ?? '').slice(0, 200)}`,
      draftFn: async (critique) => {
        const user = critique
          ? `${userBase}\n\nREVISION REQUESTED — your previous draft scored below the quality bar. Fix these:\n${critique}\nRewrite the FULL script now.`
          : userBase;
        const r = await this.router.run({
          task: 'script',
          agentType: 'script',
          planId: plan.id,
          lessonId: lesson.id,
          modelOverride: brand.modelOverrides?.script,
          // Shorts are tiny; everything else fits in 6k. JSON mode for screen-rec.
          maxTokens: fmt === 'short' ? 800 : 6000,
          temperature: 0.75,
          jsonOutput: mode === 'with_screen_recording',
          system: SYSTEM,
          user,
        });
        const raw = (r.text ?? '').trim();
        // Screen-recording mode returns JSON; inline mode returns plain text.
        let parsed: ScriptDraft;
        if (mode === 'with_screen_recording') {
          try {
            const j = JSON.parse(raw || '{}') as {
              narration_script?: string;
              full_script?: string;
              screen_recording_cues?: ScreenRecordingCue[];
              key_takeaways?: string[];
            };
            parsed = {
              script: String(j.narration_script ?? j.full_script ?? '').trim(),
              screenRecordingCues: Array.isArray(j.screen_recording_cues)
                ? j.screen_recording_cues : [],
              keyTakeaways: Array.isArray(j.key_takeaways) ? j.key_takeaways : [],
            };
          } catch (e) {
            this.logger.warn(
              `Screen-rec JSON parse failed (${(e as Error).message}); ` +
              `falling back to raw text — cues lost`,
            );
            parsed = { script: raw, screenRecordingCues: [] };
          }
        } else {
          parsed = { script: raw };
        }
        return {
          parsed,
          rawForGrader: parsed.script,
          model: r.model,
          provider: r.provider as ProviderName,
          costUsd: r.costUsd,
        };
      },
    });

    const script = result.parsed.script;
    const screenRecordingCues = result.parsed.screenRecordingCues ?? [];
    const keyTakeaways = result.parsed.keyTakeaways ?? [];
    const words = wordCount(script);
    const wpm = WPM_BY_FORMAT[fmt];
    // Add the screen-cue voice-overs into the duration estimate when present.
    const cueSeconds = screenRecordingCues.reduce(
      (s, c) => s + Math.max(0, Math.round(c.estimated_duration_seconds ?? 0)),
      0,
    );
    const durationSec = Math.round((words / wpm) * 60) + cueSeconds;

    const latest = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
    const asset = await this.assetRepo.save(
      this.assetRepo.create({
        planId: plan.id,
        lessonId: lesson.id,
        assetType: 'script',
        version: (latest?.version ?? 0) + 1,
        content: {
          fullScript: script,
          wordCount: words,
          durationEstimateSeconds: durationSec,
          lessonFormat: fmt,
          explanationMode: mode,
          screenRecordingCues,
          keyTakeaways,
          model: result.model,
          provider: result.provider,
          costUsd: result.totalCostUsd,
        },
        qualityScore: result.qualityScore,
        revisions: result.revisions,
        critique: result.critique,
        confidence: result.confidence,
        status: 'draft',
      }),
    );

    await this.lessonRepo.update(lesson.id, { status: 'scripted' });
    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + result.totalCostUsd,
    });
    this.logger.log(
      `Script v${asset.version} (${fmt}) for "${lesson.title}" — ${words} words, ` +
      `${result.revisions} revision(s), score ${result.qualityScore ?? 'n/a'} ` +
      `($${result.totalCostUsd.toFixed(4)})`,
    );
    return asset;
  }

  async latestScript(lessonId: string): Promise<ContentAsset | null> {
    return this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
  }
}
