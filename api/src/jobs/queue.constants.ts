// ── Queue names ───────────────────────────────────────────────────────────────

export const QUEUES = {
  FEEDBACK: 'feedback',
  DIGEST:   'digest',
} as const;

export type QueueName = typeof QUEUES[keyof typeof QUEUES];

// ── Job names per queue ───────────────────────────────────────────────────────

export const FEEDBACK_JOBS = {
  /** Run full AI evaluation on a completed session transcript */
  EVALUATE: 'evaluate',
} as const;

export const DIGEST_JOBS = {
  /** Send a single user their weekly progress digest */
  WEEKLY_USER:   'weekly:user',
  /** Fan-out job: find eligible users and enqueue WEEKLY_USER per user */
  WEEKLY_FANOUT: 'weekly:fanout',
} as const;

// ── Retry / backoff config ────────────────────────────────────────────────────

/** Default Bull job options for AI evaluation — expensive, limit retries */
export const EVALUATE_JOB_OPTIONS = {
  attempts:    3,
  backoff:     { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: 50,   // keep last 50 completed
  removeOnFail:     20,
} as const;

/** Digest jobs run once — no retries for fan-out, 2 for individual send */
export const DIGEST_FANOUT_OPTIONS = {
  attempts:    1,
  removeOnComplete: 5,
  removeOnFail:     5,
} as const;

export const DIGEST_SEND_OPTIONS = {
  attempts:    2,
  backoff:     { type: 'fixed' as const, delay: 10_000 },
  removeOnComplete: 100,
  removeOnFail:     20,
} as const;
