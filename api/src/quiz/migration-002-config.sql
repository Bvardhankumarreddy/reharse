-- Quiz: add scheduled time windows + session timer
-- Run after migration.sql

CREATE TABLE IF NOT EXISTS quiz_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "quizWeek" INT NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL DEFAULT 'Weekly AI Quiz',
  description TEXT NOT NULL DEFAULT '',
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "durationMinutes" INT NOT NULL DEFAULT 5,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- Add expiresAt to sessions (existing sessions will be NULL — they predate the timer feature)
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP;
