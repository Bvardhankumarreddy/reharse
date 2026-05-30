-- Explicit lesson linkage on bundle questions. Enables per-lesson
-- regeneration: the agent can swap out just one lesson's questions and
-- leave the rest of the bundle untouched. Existing rows stay NULL until
-- the next regeneration backfills them.

ALTER TABLE cs_quiz_bundle_questions
  ADD COLUMN IF NOT EXISTS lesson_number int;

CREATE INDEX IF NOT EXISTS idx_cs_quiz_bundle_questions_lesson
  ON cs_quiz_bundle_questions(bundle_id, lesson_number);
