import { Injectable, Logger } from '@nestjs/common';
import { GraderService } from './grader.service';
import { AgentType } from '../entities/agent-run.entity';
import { ProviderName } from './provider.types';

export interface DraftResult<TParsed> {
  parsed: TParsed;
  /** Serialised content for the grader to read (script text or JSON string). */
  rawForGrader: string;
  model: string;
  provider: ProviderName;
  costUsd: number;
}

export interface ImprovedResult<TParsed> {
  parsed: TParsed;
  revisions: number;
  qualityScore: number | null;
  critique: string | null;
  confidence: number | null;
  /** Sum of draft costs + grader costs across the whole loop. */
  totalCostUsd: number;
  /** The final draft's model + provider (what produced the kept content). */
  model: string;
  provider: ProviderName;
}

/**
 * Phase B Improvement Loop. Given a draft generator and a serialised
 * representation for the grader, runs draft → grade → revise up to
 * `maxRevisions` passes (per the spec: "up to 2 revision passes per asset").
 * Returns the kept draft plus quality metadata for persistence.
 *
 * Skips grading entirely when `selfCritiqueMode` excludes this agent type
 * (returns the first draft unchanged with `qualityScore=null`).
 */
@Injectable()
export class ImprovementLoopService {
  private readonly logger = new Logger(ImprovementLoopService.name);

  constructor(private readonly grader: GraderService) {}

  async run<TParsed>(opts: {
    agentType: AgentType;
    planId?: string | null;
    lessonId?: string | null;
    /** Compact human-readable context for the grader (title, hook, brand voice). */
    context: string;
    /** How many *applicable* memories were injected — feeds the confidence score. */
    memoryCount: number;
    /** Produces a draft. Called with the previous critique on revise passes. */
    draftFn: (critique: string | null) => Promise<DraftResult<TParsed>>;
  }): Promise<ImprovedResult<TParsed>> {
    const skipGrading = !this.grader.shouldGrade(opts.agentType);

    // Always at least one draft.
    const firstDraft = await opts.draftFn(null);
    let totalCost = firstDraft.costUsd;

    if (skipGrading) {
      this.logger.log(
        `${opts.agentType}: grading skipped (selfCritiqueMode=${this.grader.mode})`,
      );
      return {
        parsed: firstDraft.parsed,
        revisions: 0,
        qualityScore: null,
        critique: null,
        confidence: null,
        totalCostUsd: totalCost,
        model: firstDraft.model,
        provider: firstDraft.provider,
      };
    }

    let current = firstDraft;
    let revisions = 0;
    const maxRevisions = this.grader.maxRevisions;

    // Grade the first draft.
    let grade = await this.grader.grade({
      agentType: opts.agentType,
      planId: opts.planId,
      lessonId: opts.lessonId,
      rawContent: current.rawForGrader,
      writerProvider: current.provider,
      context: opts.context,
    });
    totalCost += grade.costUsd;

    while (!grade.pass && revisions < maxRevisions) {
      const critique = grade.issues.join('; ');
      this.logger.log(
        `${opts.agentType}: score ${grade.score} < ${grade.threshold} — ` +
        `revising (pass ${revisions + 1}/${maxRevisions})`,
      );
      const next = await opts.draftFn(critique || 'Quality below threshold; tighten.');
      totalCost += next.costUsd;
      current = next;
      revisions++;

      grade = await this.grader.grade({
        agentType: opts.agentType,
        planId: opts.planId,
        lessonId: opts.lessonId,
        rawContent: current.rawForGrader,
        writerProvider: current.provider,
        context: opts.context,
      });
      totalCost += grade.costUsd;
    }

    const critique = grade.pass ? null : grade.issues.join('; ') || null;
    const confidence = computeConfidence({
      score: grade.score,
      memoryCount: opts.memoryCount,
      revisions,
      maxRevisions,
    });
    this.logger.log(
      `${opts.agentType}: final score ${grade.score} after ${revisions} ` +
      `revision(s) — confidence ${confidence.toFixed(2)}`,
    );

    return {
      parsed: current.parsed,
      revisions,
      qualityScore: grade.score,
      critique,
      confidence,
      totalCostUsd: totalCost,
      model: current.model,
      provider: current.provider,
    };
  }
}

/**
 * Confidence ∈ [0, 1]:
 *   70%  grader signal      (score / 100)
 *   20%  memory-match signal (min(1, used/3) — 3+ targeted memories = max)
 *   10%  revision parsimony  (fewer revisions = higher)
 */
function computeConfidence(p: {
  score: number;
  memoryCount: number;
  revisions: number;
  maxRevisions: number;
}): number {
  const grader = Math.max(0, Math.min(1, p.score / 100));
  const memory = Math.min(1, p.memoryCount / 3);
  const rev = p.maxRevisions <= 0 ? 1 : 1 - p.revisions / p.maxRevisions;
  return Math.max(0, Math.min(1, grader * 0.7 + memory * 0.2 + rev * 0.1));
}
