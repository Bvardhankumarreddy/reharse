import { registerAs } from '@nestjs/config';

/**
 * Trust & Safety configuration namespace. Access via
 * `config.get('trustSafety.<path>')`.
 *
 * The two main runtime gates:
 *   - captureFingerprints: write rows to ts_submission_fingerprints
 *     on every quiz start + submit. Defaults ON — pure observability.
 *   - filterQuestions: when true, the quiz START selects questions to
 *     give nearby submitters ≥80% non-overlapping question sets. Defaults
 *     OFF so the rollout is staged: ship capture first, watch metrics,
 *     then flip the flag once the data looks clean.
 */
export default registerAs('trustSafety', () => ({
  captureFingerprints:
    (process.env.TRUST_SAFETY_CAPTURE_FINGERPRINTS ?? 'true').toLowerCase() === 'true',
  filterQuestions:
    (process.env.TRUST_SAFETY_FILTER_QUESTIONS ?? 'false').toLowerCase() === 'true',

  geo: {
    /** Free-tier ip-api.com — 45 lookups/minute, no key. */
    provider:
      (process.env.TRUST_SAFETY_GEO_PROVIDER ?? 'ip-api') as 'ip-api' | 'none',
    /** Cache IP→geo lookups for this many minutes to stay under the rate limit. */
    cacheMinutes: Number(process.env.TRUST_SAFETY_GEO_CACHE_MIN ?? 60),
    timeoutMs: Number(process.env.TRUST_SAFETY_GEO_TIMEOUT_MS ?? 5000),
  },

  nearby: {
    /** "Same area" radius for the geo-based nearby check (km). */
    radiusKm: Number(process.env.TRUST_SAFETY_NEARBY_RADIUS_KM ?? 10),
    /** How far back to look for nearby submissions (hours). */
    lookbackHours: Number(process.env.TRUST_SAFETY_LOOKBACK_HOURS ?? 24),
  },

  selection: {
    /** Minimum nearby count before the filter kicks in. */
    minNearbyThreshold: Number(process.env.TRUST_SAFETY_MIN_NEARBY ?? 2),
    /** Target % of questions that must NOT overlap with nearby selections. */
    targetNonOverlapPercent: Number(process.env.TRUST_SAFETY_NON_OVERLAP_PCT ?? 80),
    /** Hard cap on overlap for any single quiz (will fall back to random when exhausted). */
    maxOverlapAllowed: Number(process.env.TRUST_SAFETY_MAX_OVERLAP ?? 2),
    /** Warn when this much of the pool is taken by nearby submitters. */
    poolExhaustionWarningPercent: Number(process.env.TRUST_SAFETY_POOL_WARN_PCT ?? 70),
  },
}));
