import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubmissionFingerprint } from '../entities/submission-fingerprint.entity';

export interface QuestionCandidate {
  id: string;
  difficulty: 'easy' | 'medium' | 'hard';
  isMandatory?: boolean;
}

export type SelectionStrategy =
  | 'random'           // not enough nearby submitters → standard random
  | 'unique_overlap'   // nearby exists → pick fresh first, fill with used
  | 'pool_exhausted';  // not enough fresh → falls back to random + warns

export interface SelectionResult {
  selected: string[];
  strategy: SelectionStrategy;
  overlapCount: number;
  nearbyCount: number;
  freshAvailable: number;
}

/**
 * IP-aware question selection. When ≥ minNearbyThreshold nearby
 * submitters exist, the picker prefers questions THEY DIDN'T see —
 * giving each person in a household / office a different set without
 * any user-visible UX change.
 */
@Injectable()
export class UniqueQuestionService {
  private readonly logger = new Logger(UniqueQuestionService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Pick `targetCount` question ids from `pool`, biasing AWAY from any
   * question id that appears in `nearby[].questionIds`. Mandatory
   * questions in the pool are always included (and don't count toward
   * the overlap cap).
   */
  select(
    pool: QuestionCandidate[],
    targetCount: number,
    nearby: SubmissionFingerprint[],
  ): SelectionResult {
    const minNearby = Number(this.config.get('trustSafety.selection.minNearbyThreshold') ?? 2);
    const maxOverlap = Number(this.config.get('trustSafety.selection.maxOverlapAllowed') ?? 2);
    const warnPct = Number(this.config.get('trustSafety.selection.poolExhaustionWarningPercent') ?? 70);

    // Mandatory questions are always in.
    const mandatory = pool.filter((q) => q.isMandatory);
    const optional  = pool.filter((q) => !q.isMandatory);
    const mandatoryIds = mandatory.map((q) => q.id);
    const optionalQuota = Math.max(0, targetCount - mandatoryIds.length);

    // No filter needed.
    if (nearby.length < minNearby || optionalQuota === 0) {
      const picked = this.randomTake(optional, optionalQuota);
      return {
        selected: [...mandatoryIds, ...picked.map((q) => q.id)],
        strategy: 'random',
        overlapCount: 0,
        nearbyCount: nearby.length,
        freshAvailable: optional.length,
      };
    }

    // Build the "already used" set across nearby submitters.
    const used = new Set<string>();
    for (const fp of nearby) {
      for (const id of (fp.questionIds ?? [])) used.add(id);
    }

    const fresh = optional.filter((q) => !used.has(q.id));
    const overlap = optional.filter((q) =>  used.has(q.id));
    const freshAvailable = fresh.length;

    if (optional.length > 0) {
      const usedPct = ((optional.length - freshAvailable) / optional.length) * 100;
      if (usedPct >= warnPct) {
        this.logger.warn(
          `[unique-select] pool ${usedPct.toFixed(0)}% taken — ${freshAvailable}/${optional.length} fresh left`,
        );
      }
    }

    const minFresh = optionalQuota - maxOverlap;

    if (freshAvailable >= minFresh) {
      // Healthy pool — take fresh up to the quota, fill any gap with used.
      const takeFresh = Math.min(freshAvailable, optionalQuota);
      const pickedFresh = this.randomTake(fresh, takeFresh);
      const remaining = optionalQuota - pickedFresh.length;
      const pickedOverlap = remaining > 0 ? this.randomTake(overlap, remaining) : [];
      return {
        selected: [...mandatoryIds, ...pickedFresh.map((q) => q.id), ...pickedOverlap.map((q) => q.id)],
        strategy: 'unique_overlap',
        overlapCount: pickedOverlap.length,
        nearbyCount: nearby.length,
        freshAvailable,
      };
    }

    // Not enough fresh — log loud, fall back to random.
    this.logger.error(
      `[unique-select] pool exhausted for nearby cohort — ` +
      `${freshAvailable} fresh, need ${minFresh}. Falling back to random.`,
    );
    const picked = this.randomTake(optional, optionalQuota);
    return {
      selected: [...mandatoryIds, ...picked.map((q) => q.id)],
      strategy: 'pool_exhausted',
      overlapCount: optionalQuota - freshAvailable,
      nearbyCount: nearby.length,
      freshAvailable,
    };
  }

  /**
   * Difficulty-balanced variant. Honours an explicit easy/medium/hard split.
   * The mandatory cap is applied across the whole result, NOT per bucket.
   */
  selectBalanced(
    pool: QuestionCandidate[],
    split: { easy: number; medium: number; hard: number },
    nearby: SubmissionFingerprint[],
  ): SelectionResult {
    const buckets: Record<'easy' | 'medium' | 'hard', QuestionCandidate[]> = {
      easy:   pool.filter((q) => q.difficulty === 'easy'  && !q.isMandatory),
      medium: pool.filter((q) => q.difficulty === 'medium' && !q.isMandatory),
      hard:   pool.filter((q) => q.difficulty === 'hard'  && !q.isMandatory),
    };
    const mandatory = pool.filter((q) => q.isMandatory);

    const r1 = this.select(buckets.easy,   split.easy,   nearby);
    const r2 = this.select(buckets.medium, split.medium, nearby);
    const r3 = this.select(buckets.hard,   split.hard,   nearby);

    const selected = [
      ...mandatory.map((q) => q.id),
      ...r1.selected, ...r2.selected, ...r3.selected,
    ];
    // Deduplicate (mandatory rows may already appear in one bucket).
    const seen = new Set<string>();
    const dedup = selected.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));

    // Worst-case strategy across buckets wins (most pessimistic).
    const strategy: SelectionStrategy =
      [r1, r2, r3].some((r) => r.strategy === 'pool_exhausted')
        ? 'pool_exhausted'
        : [r1, r2, r3].some((r) => r.strategy === 'unique_overlap')
        ? 'unique_overlap'
        : 'random';

    return {
      selected: dedup,
      strategy,
      overlapCount: r1.overlapCount + r2.overlapCount + r3.overlapCount,
      nearbyCount: nearby.length,
      freshAvailable: r1.freshAvailable + r2.freshAvailable + r3.freshAvailable,
    };
  }

  private randomTake<T>(items: T[], n: number): T[] {
    if (n <= 0 || items.length === 0) return [];
    if (n >= items.length) return [...items].sort(() => Math.random() - 0.5);
    // Fisher-Yates partial shuffle for the first n.
    const a = [...items];
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(Math.random() * (a.length - i));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  }
}
