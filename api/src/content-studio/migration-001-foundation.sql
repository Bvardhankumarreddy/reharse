-- Content Studio — Phase A foundation schema (Slice 1 uses brands/channels/
-- plans/lessons/agent_runs/brand_memories; the rest are created now so later
-- slices need no extra migration).
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-001-foundation.sql

-- ── cs_brands ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  "voiceStyle" TEXT,
  "colorPrimary" VARCHAR(20),
  "colorSecondary" VARCHAR(20),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── cs_channels ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "brandId" UUID NOT NULL REFERENCES cs_brands(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL DEFAULT 'youtube',
  "channelUrl" VARCHAR(500),
  cadence VARCHAR(255),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_channels_brand ON cs_channels("brandId");

-- ── cs_weekly_content_plans ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_weekly_content_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "brandId" UUID NOT NULL REFERENCES cs_brands(id) ON DELETE CASCADE,
  "channelId" UUID REFERENCES cs_channels(id) ON DELETE SET NULL,
  "weekOf" DATE NOT NULL,
  theme VARCHAR(500),
  "quizScope" TEXT,
  notes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'planned', -- planned|generating|ready|failed
  "totalCostUsd" NUMERIC(10,6) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_plans_brand ON cs_weekly_content_plans("brandId");
CREATE INDEX IF NOT EXISTS idx_cs_plans_week  ON cs_weekly_content_plans("weekOf" DESC);

-- ── cs_lessons ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "planId" UUID NOT NULL REFERENCES cs_weekly_content_plans(id) ON DELETE CASCADE,
  "lessonNumber" INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  hook TEXT,
  outline JSONB NOT NULL DEFAULT '[]'::jsonb,
  "targetDurationMinutes" INT NOT NULL DEFAULT 10,
  status VARCHAR(30) NOT NULL DEFAULT 'planned',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_lessons_plan ON cs_lessons("planId");

-- ── cs_content_assets (used from Slice 2+) ─────────────────────────────
CREATE TABLE IF NOT EXISTS cs_content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "planId" UUID REFERENCES cs_weekly_content_plans(id) ON DELETE CASCADE,
  "lessonId" UUID REFERENCES cs_lessons(id) ON DELETE CASCADE,
  "assetType" VARCHAR(40) NOT NULL,  -- script|ppt|seo|promo|thumbnail_prompt|quiz_pool
  version INT NOT NULL DEFAULT 1,
  content JSONB,
  "storageKey" VARCHAR(1000),
  "qualityScore" INT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_assets_lesson ON cs_content_assets("lessonId");
CREATE INDEX IF NOT EXISTS idx_cs_assets_plan   ON cs_content_assets("planId");

-- ── cs_agent_runs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "planId" UUID REFERENCES cs_weekly_content_plans(id) ON DELETE CASCADE,
  "lessonId" UUID REFERENCES cs_lessons(id) ON DELETE CASCADE,
  "agentType" VARCHAR(40) NOT NULL,  -- strategy|script|ppt|quiz|seo|promo|thumbnail
  provider VARCHAR(30),
  model VARCHAR(100),
  "promptTokens" INT NOT NULL DEFAULT 0,
  "completionTokens" INT NOT NULL DEFAULT 0,
  "costUsd" NUMERIC(10,6) NOT NULL DEFAULT 0,
  "durationMs" INT,
  status VARCHAR(20) NOT NULL DEFAULT 'success', -- success|failed
  error TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_runs_plan ON cs_agent_runs("planId");

-- ── cs_brand_memories ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_brand_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "brandId" UUID NOT NULL REFERENCES cs_brands(id) ON DELETE CASCADE,
  "memoryType" VARCHAR(30) NOT NULL,  -- voice|style|hook|structure|do|dont
  content TEXT NOT NULL,
  weight NUMERIC(4,2) NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_memories_brand ON cs_brand_memories("brandId");

-- ── cs_question_pools (Slice 4) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_question_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "planId" UUID REFERENCES cs_weekly_content_plans(id) ON DELETE CASCADE,
  "brandId" UUID NOT NULL REFERENCES cs_brands(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  "correctIndex" INT,
  difficulty VARCHAR(10),  -- easy|medium|hard
  "validatedBy" VARCHAR(30),
  "validationPassed" BOOLEAN,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_qpool_plan ON cs_question_pools("planId");

-- ── cs_delivered_quizzes (Slice 4) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_delivered_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "planId" UUID REFERENCES cs_weekly_content_plans(id) ON DELETE SET NULL,
  "brandId" UUID NOT NULL REFERENCES cs_brands(id) ON DELETE CASCADE,
  "weekOf" DATE NOT NULL,
  "questionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "publicXlsxKey" VARCHAR(1000),
  "privateXlsxKey" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── cs_dead_letter_jobs (Slice 6) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_dead_letter_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobType" VARCHAR(60) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed: AetherStackAI brand + channel + 5 voice/style memories ────────
WITH b AS (
  INSERT INTO cs_brands (name, slug, description, "voiceStyle", "colorPrimary", "colorSecondary")
  SELECT 'AetherStackAI', 'aetherstackai',
         'Educational AI/ML YouTube channel — practical, no-fluff lessons for builders.',
         'Confident, energetic, plain-spoken. Real examples and numbers. Hook in the first 8 seconds. Teacher-friend tone, never lecture-y.',
         '#00D4FF', '#FFB800'
  WHERE NOT EXISTS (SELECT 1 FROM cs_brands WHERE slug = 'aetherstackai')
  RETURNING id
)
INSERT INTO cs_channels ("brandId", name, platform, cadence)
SELECT b.id, 'AetherStackAI YouTube', 'youtube', '2 lessons + 1 Saturday quiz per week'
FROM b;

INSERT INTO cs_brand_memories ("brandId", "memoryType", content, weight)
SELECT br.id, m."memoryType", m.content, m.weight
FROM cs_brands br
CROSS JOIN (VALUES
  ('voice',     'Speak like a sharp senior engineer mentoring a junior — direct, warm, zero jargon-for-jargon.', 1.5),
  ('hook',      'Open every lesson with a concrete stakes line in the first 8 seconds (a number, a failure, or a "most people get this wrong").', 1.5),
  ('structure', 'Lesson arc: hook → why it matters → core concept with one real example → common mistake → recap + quiz tease.', 1.2),
  ('style',     'Use real companies/tools/numbers. No hypothetical "imagine a system". Short sentences. One idea per breath.', 1.2),
  ('dont',      'Never pad with filler intros ("In this video we will..."). Never use unexplained acronyms. Never moralize about AI.', 1.0)
) AS m("memoryType", content, weight)
WHERE br.slug = 'aetherstackai'
  AND NOT EXISTS (SELECT 1 FROM cs_brand_memories x WHERE x."brandId" = br.id);
