-- Quiz: support multiple question types (mcq, true_false, multi_select, numeric)

-- Add new columns to quiz_questions
ALTER TABLE quiz_questions
  ADD COLUMN IF NOT EXISTS "questionType" VARCHAR(16) NOT NULL DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS "correctAnswers" TEXT,
  ADD COLUMN IF NOT EXISTS "correctNumber" NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS "numericTolerance" NUMERIC(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "numericUnit" VARCHAR(50);

-- Make existing required columns nullable for non-MCQ types
ALTER TABLE quiz_questions
  ALTER COLUMN "optionA" SET DEFAULT '',
  ALTER COLUMN "optionB" SET DEFAULT '',
  ALTER COLUMN "optionC" SET DEFAULT '',
  ALTER COLUMN "optionD" SET DEFAULT '',
  ALTER COLUMN "correctAnswer" DROP NOT NULL;

-- quiz_submission_answers: widen selectedAnswer column, add selectedNumber
ALTER TABLE quiz_submission_answers
  ALTER COLUMN "selectedAnswer" TYPE VARCHAR(50);

ALTER TABLE quiz_submission_answers
  ADD COLUMN IF NOT EXISTS "selectedNumber" NUMERIC(18,6);
