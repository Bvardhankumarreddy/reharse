-- Quiz: per-week configurable difficulty mix percentages

ALTER TABLE quiz_configs
  ADD COLUMN IF NOT EXISTS "easyPercent" INT NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS "mediumPercent" INT NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS "hardPercent" INT NOT NULL DEFAULT 20;

-- Verify the constraint (commented-out check; run if you want assurance):
-- SELECT "quizWeek", "easyPercent" + "mediumPercent" + "hardPercent" AS total
-- FROM quiz_configs;
