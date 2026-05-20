-- Content Studio — Slice 4: add explanation text to the quiz question pool.
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-002-quiz-explanation.sql

ALTER TABLE cs_question_pools
  ADD COLUMN IF NOT EXISTS explanation TEXT;
