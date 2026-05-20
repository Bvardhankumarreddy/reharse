import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelRouterService } from './model-router.service';
import { ProviderName } from './provider.types';
import { AgentType } from '../entities/agent-run.entity';

export type SelfCritiqueMode = 'always' | 'smart' | 'premium-only' | 'manual';

export interface GradeResult {
  /** 0–100 (the raw quality score). */
  score: number;
  /** Concrete, actionable problems. Empty if the asset passed cleanly. */
  issues: string[];
  /** True iff score ≥ threshold. */
  pass: boolean;
  /** Threshold the grader was told to use. */
  threshold: number;
  /** Model used by the grader (for the audit trail). */
  model: string;
  provider: string;
  costUsd: number;
}

const RUBRIC_BY_AGENT: Record<AgentType, string> = {
  strategy:
    'Plan covers exactly 2 lessons, a coherent week theme, and a quiz_scope that ties them together. Each lesson has a concrete hook (not "we will discuss…") and a real outline of 4–6 sections with multiple teaching points each.',
  script:
    'The first sentence IS the hook with concrete stakes in the first ~8 seconds. [PAUSE] / [PAUSE 1.5s] / [PAUSE 2s] markers used naturally. Real names / tools / numbers appear (no "imagine a system"). Structure: hook → why → real example → common mistake → recap → quiz tease. Brand voice obeyed.',
  ppt:
    'Exactly 13 slides in the fixed order: title, hook, why, agenda, definition, detail, real_example, step1, step2, mistake, recap, quiz_tease, end_card. Each title ≤ 60 chars; bullets ≤ 90 chars and stand alone. Slide 7 (real_example) names a real company/tool with a number.',
  seo:
    '8 distinct title variants, the chosen one is genuinely the strongest. Description 600–1200 chars, first 2 sentences stand alone (above-the-fold), includes timestamps. 12–20 lowercase tags, no duplicates. 3 end-screen cards.',
  thumbnail:
    'main_prompt is one visually specific paragraph (subject, composition, lighting, colour, style). face_position is one of left/right/center/none. text_overlay ≤ 8 words and punchy. 3 distinct alternates.',
  promo:
    'LinkedIn has hook + 3–5-paragraph body + cta + 3–6 hashtags. Instagram caption 80–220 chars, 8–15 hashtags. WhatsApp Status ≤ 700 chars AND ≤ 10 lines. Each platform respects its norms; promo mines the script rather than rephrasing the title.',
  quiz:
    'Each MCQ has exactly 4 distinct options with one correctIndex. No "all of the above". Distractors plausible but verifiably wrong. Difficulty label realistic.',
};

const SYSTEM = `
You are a strict quality grader for one piece of content produced by a
content-studio agent. Read the rubric and the content; score from 0 to 100;
return the few concrete, actionable issues that would raise the score.

Be honest — a passing grade should be earned, not given. If the rubric
isn't met, score below the threshold and list specific fixes.

Return STRICT JSON ONLY:
{"score": <int 0-100>, "issues": ["<one concrete fix>", "..."], "pass": <bool>}
`.trim();

@Injectable()
export class GraderService {
  private readonly logger = new Logger(GraderService.name);

  constructor(
    private readonly router: ModelRouterService,
    private readonly config: ConfigService,
  ) {}

  get threshold(): number {
    return this.config.get<number>('contentStudio.grader.threshold') ?? 70;
  }
  get maxRevisions(): number {
    return this.config.get<number>('contentStudio.grader.maxRevisions') ?? 2;
  }
  get mode(): SelfCritiqueMode {
    return (
      (this.config.get<SelfCritiqueMode>('contentStudio.grader.selfCritiqueMode')) ??
      'smart'
    );
  }

  /** Decide whether the configured `selfCritiqueMode` allows grading this agent. */
  shouldGrade(agentType: AgentType): boolean {
    switch (this.mode) {
      case 'always':       return true;
      case 'smart':        return ['script', 'ppt', 'quiz'].includes(agentType);
      case 'premium-only': return agentType === 'script';
      case 'manual':       return false;
    }
  }

  async grade(opts: {
    agentType: AgentType;
    planId?: string | null;
    lessonId?: string | null;
    /** Already-stringified content to audit (script text or JSON.stringify). */
    rawContent: string;
    /** Provider that produced the content — graded on a different provider. */
    writerProvider?: ProviderName;
    /** Compact context to anchor the grader (title, hook, brand voice). */
    context: string;
    /** Per-brand grader model override (Phase C). */
    modelOverride?: string;
  }): Promise<GradeResult> {
    const threshold = this.threshold;
    const rubric = RUBRIC_BY_AGENT[opts.agentType] ??
      'Score on clarity, concreteness, and brand-voice fit.';
    const res = await this.router.run({
      task: 'grader',
      agentType: opts.agentType,
      planId: opts.planId ?? null,
      lessonId: opts.lessonId ?? null,
      excludeProvider: opts.writerProvider, // cross-provider when known
      modelOverride: opts.modelOverride,
      jsonOutput: true,
      maxTokens: 800,
      temperature: 0.1,
      system: SYSTEM,
      user:
        `AGENT TYPE: ${opts.agentType}\n` +
        `THRESHOLD: ${threshold}\n` +
        `RUBRIC:\n${rubric}\n\n` +
        `CONTEXT:\n${opts.context}\n\n` +
        `CONTENT TO GRADE:\n${opts.rawContent.slice(0, 14_000)}\n\n` +
        `Output the JSON object only.`,
    });

    let score = 0; let issues: string[] = []; let pass = false;
    try {
      const j = JSON.parse(res.text || '{}') as {
        score?: number; issues?: string[]; pass?: boolean;
      };
      score = Math.max(0, Math.min(100, Math.round(Number(j.score ?? 0))));
      issues = Array.isArray(j.issues) ? j.issues.map(String).slice(0, 10) : [];
      pass = typeof j.pass === 'boolean' ? j.pass : score >= threshold;
    } catch (e) {
      this.logger.warn(
        `Grader returned non-JSON for ${opts.agentType}: ${(e as Error).message}`,
      );
    }
    return {
      score,
      issues,
      pass: pass && score >= threshold, // belt-and-braces
      threshold,
      model: res.model,
      provider: res.provider,
      costUsd: res.costUsd,
    };
  }
}
