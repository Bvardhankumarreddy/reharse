-- Quiz: configurable question count + mandatory questions + uncapped points

-- Add questionsPerQuiz to config
ALTER TABLE quiz_configs
  ADD COLUMN IF NOT EXISTS "questionsPerQuiz" INT NOT NULL DEFAULT 5;

-- Add isMandatory flag to questions
ALTER TABLE quiz_questions
  ADD COLUMN IF NOT EXISTS "isMandatory" BOOLEAN NOT NULL DEFAULT false;

-- (Points column was already INT; no change needed — restriction was app-level only)
