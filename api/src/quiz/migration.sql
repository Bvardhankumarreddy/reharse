-- Quiz feature migration — run on production DB

CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "questionText" TEXT NOT NULL,
  "optionA" TEXT NOT NULL,
  "optionB" TEXT NOT NULL,
  "optionC" TEXT NOT NULL,
  "optionD" TEXT NOT NULL,
  "correctAnswer" VARCHAR(1) NOT NULL CHECK ("correctAnswer" IN ('A','B','C','D')),
  points INT NOT NULL DEFAULT 1 CHECK (points IN (1,2,3)),
  difficulty VARCHAR(8) NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  category VARCHAR(200) NOT NULL,
  "quizWeek" INT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_difficulty ON quiz_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quizweek ON quiz_questions("quizWeek");

CREATE TABLE IF NOT EXISTS quiz_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "fullName" VARCHAR(200) NOT NULL,
  email VARCHAR(200) NOT NULL,
  "upiId" VARCHAR(200) NOT NULL,
  "youtubeHandle" VARCHAR(100),
  "quizWeek" INT NOT NULL,
  "totalScore" INT NOT NULL DEFAULT 0,
  "totalTimeSeconds" INT NOT NULL DEFAULT 0,
  "tiebreakerAnswer" BIGINT,
  "winnerRank" INT,
  "ipAddress" VARCHAR(64),
  "userAgent" TEXT,
  "submittedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_email_per_week UNIQUE (email, "quizWeek")
);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_email ON quiz_submissions(email);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_week ON quiz_submissions("quizWeek");

CREATE TABLE IF NOT EXISTS quiz_submission_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "submissionId" UUID NOT NULL REFERENCES quiz_submissions(id) ON DELETE CASCADE,
  "questionId" UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  "selectedAnswer" VARCHAR(1) NOT NULL,
  "isCorrect" BOOLEAN NOT NULL,
  "pointsEarned" INT NOT NULL DEFAULT 0,
  "timeTakenSeconds" INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "fullName" VARCHAR(200) NOT NULL,
  email VARCHAR(200) NOT NULL,
  "upiId" VARCHAR(200) NOT NULL,
  "youtubeHandle" VARCHAR(100),
  "quizWeek" INT NOT NULL,
  "questionIds" JSONB NOT NULL,
  "currentIndex" INT NOT NULL DEFAULT 0,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  "startedAt" TIMESTAMP NOT NULL,
  "questionStartedAt" TIMESTAMP,
  completed BOOLEAN NOT NULL DEFAULT false,
  "submissionId" UUID,
  "ipAddress" VARCHAR(64),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_email ON quiz_sessions(email);
