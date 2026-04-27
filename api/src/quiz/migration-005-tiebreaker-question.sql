-- Quiz: configurable tiebreaker question text per week

ALTER TABLE quiz_configs
  ADD COLUMN IF NOT EXISTS "tiebreakerQuestion" TEXT NOT NULL DEFAULT '';
