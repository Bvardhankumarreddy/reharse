-- Stricter quiz: option randomization + disqualification + suspicion scoring
-- All additive + idempotent. Safe to run multiple times. No data mutation.

-- ── Per-entrant option order ─────────────────────────────────────────
-- One key per question in this session, value is a 4-letter visible→source
-- shuffle (e.g. ["C","A","D","B"] means visible A = source C).
ALTER TABLE quiz_sessions
  ADD COLUMN IF NOT EXISTS "optionShuffles" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── Disqualification (admin-driven, recoverable) ─────────────────────
ALTER TABLE quiz_submissions
  ADD COLUMN IF NOT EXISTS "disqualified"        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "disqualifiedReason"  TEXT,
  ADD COLUMN IF NOT EXISTS "disqualifiedAt"      TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "disqualifiedBy"      TEXT;

-- ── Suspicion scoring (auto-computed at submit) ──────────────────────
-- score 0-100; flags is array of { code, reason, points }
ALTER TABLE quiz_submissions
  ADD COLUMN IF NOT EXISTS "suspicionScore"  INT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "suspicionFlags"  JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Admin queue sorts: (week, suspicion DESC) and (week, disqualified, score DESC).
CREATE INDEX IF NOT EXISTS idx_quiz_subs_week_suspicion
  ON quiz_submissions("quizWeek", "suspicionScore" DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_subs_week_disqualified
  ON quiz_submissions("quizWeek", "disqualified", "totalScore" DESC);
