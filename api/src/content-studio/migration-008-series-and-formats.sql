-- Content Studio — Phase E / Slice E1: multi-week series + lesson formats.
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-008-series-and-formats.sql
--
-- Three additive changes (idempotent):
--   1. new cs_content_series table — multi-week curriculum
--   2. cs_weekly_content_plans gets seriesId + seriesWeekNumber (nullable)
--   3. cs_lessons gets lessonFormat (default 'lecture')

CREATE TABLE IF NOT EXISTS cs_content_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "brandId" UUID NOT NULL REFERENCES cs_brands(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  goal TEXT,                                    -- "Teach production-ready RAG from basics to deploy"
  "targetWeeks" INT NOT NULL DEFAULT 4,
  /* topicArc is an array of:
     [{ weekIndex: 1,
        plannedTheme: "RAG fundamentals",
        plannedHook: "Most RAG demos fail in production — here's why",
        plannedFocus: "embeddings + cosine similarity baseline",
        plannedLessonFormats: ["lecture", "live_coding"] }, ...] */
  "topicArc" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "currentWeek" INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'planning', -- planning | active | completed | paused
  "startWeekOf" DATE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_series_brand  ON cs_content_series("brandId");
CREATE INDEX IF NOT EXISTS idx_cs_series_status ON cs_content_series(status);

-- Plans optionally belong to a series.
ALTER TABLE cs_weekly_content_plans
  ADD COLUMN IF NOT EXISTS "seriesId" UUID REFERENCES cs_content_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "seriesWeekNumber" INT;

CREATE INDEX IF NOT EXISTS idx_cs_plans_series ON cs_weekly_content_plans("seriesId");

-- Lesson format — supersedes the implicit "always 8-12min audio script".
ALTER TABLE cs_lessons
  ADD COLUMN IF NOT EXISTS "lessonFormat" VARCHAR(30) NOT NULL DEFAULT 'lecture';
-- Valid values: lecture | live_coding | walkthrough | interview | short
