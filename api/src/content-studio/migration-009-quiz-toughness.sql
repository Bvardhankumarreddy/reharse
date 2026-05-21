-- Content Studio — quiz toughness escalation.
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-009-quiz-toughness.sql
--
-- Tracks the last toughness level (1-5) used when generating a plan's quiz
-- pool, so each regeneration can default to one notch harder than the last.
-- 0 = never generated yet (first run defaults to level 1).

ALTER TABLE cs_weekly_content_plans
  ADD COLUMN IF NOT EXISTS "quizToughness" INT NOT NULL DEFAULT 0;
