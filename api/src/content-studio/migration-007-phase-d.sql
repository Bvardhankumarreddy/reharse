-- Content Studio — Phase D: intelligence layer + auto-publish scaffolding.
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-007-phase-d.sql

CREATE EXTENSION IF NOT EXISTS vector;

-- ── cs_competitor_channels ─────────────────────────────────────────────
-- Manually approved competitor channels per brand. YouTube Data API only
-- (public data); auto-scraping is against ToS, so we never crawl HTML.
CREATE TABLE IF NOT EXISTS cs_competitor_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "brandId" UUID NOT NULL REFERENCES cs_brands(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  "channelHandle" VARCHAR(255),          -- e.g. "@aetherstackai"
  "youtubeChannelId" VARCHAR(64),        -- e.g. "UCxxx" — preferred, resolved
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  "lastFetchedAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "errorCount" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_competitors_brand ON cs_competitor_channels("brandId");

-- ── cs_competitor_videos ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_competitor_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "competitorChannelId" UUID NOT NULL REFERENCES cs_competitor_channels(id) ON DELETE CASCADE,
  "externalId" VARCHAR(64) NOT NULL,     -- YouTube videoId
  title VARCHAR(500) NOT NULL,
  description TEXT,
  "publishedAt" TIMESTAMPTZ,
  "viewCount" BIGINT NOT NULL DEFAULT 0,
  "likeCount" BIGINT,
  "commentCount" BIGINT,
  "durationSeconds" INT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("competitorChannelId", "externalId")
);
CREATE INDEX IF NOT EXISTS idx_cs_compvids_channel  ON cs_competitor_videos("competitorChannelId");
CREATE INDEX IF NOT EXISTS idx_cs_compvids_views    ON cs_competitor_videos("viewCount" DESC);
CREATE INDEX IF NOT EXISTS idx_cs_compvids_pub      ON cs_competitor_videos("publishedAt" DESC);

-- ── cs_published_videos ────────────────────────────────────────────────
-- One row per lesson actually pushed to YouTube. Persists the link, the
-- thumbnail image (base64 — kept small via DALL-E size limits), and the
-- publish lifecycle status.
CREATE TABLE IF NOT EXISTS cs_published_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "lessonId" UUID NOT NULL REFERENCES cs_lessons(id) ON DELETE CASCADE,
  "youtubeVideoId" VARCHAR(64),
  "youtubeUrl" VARCHAR(500),
  "publishedAt" TIMESTAMPTZ,
  "thumbnailB64" TEXT,                    -- generated PNG, data:image/png;base64
  "thumbnailPrompt" TEXT,                 -- the prompt actually sent to the image model
  "thumbnailModel" VARCHAR(60),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | uploaded | live | failed
  error TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("lessonId")
);

-- ── cs_lesson_metrics ──────────────────────────────────────────────────
-- Time series of YouTube performance per published lesson. Public counts
-- come from the Data API (no OAuth); ctr / avgViewDurationSec / retention /
-- subscribersGained require Analytics API + OAuth (dormant by default).
CREATE TABLE IF NOT EXISTS cs_lesson_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "lessonId" UUID NOT NULL REFERENCES cs_lessons(id) ON DELETE CASCADE,
  "youtubeVideoId" VARCHAR(64) NOT NULL,
  views BIGINT NOT NULL DEFAULT 0,
  likes BIGINT,
  comments BIGINT,
  ctr NUMERIC(6,4),                       -- Analytics API
  "avgViewDurationSec" INT,               -- Analytics API
  "retentionPct" NUMERIC(5,2),            -- Analytics API
  "subscribersGained" INT,                -- Analytics API
  "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_cs_metrics_lesson  ON cs_lesson_metrics("lessonId");
CREATE INDEX IF NOT EXISTS idx_cs_metrics_fetched ON cs_lesson_metrics("fetchedAt" DESC);

-- ── cs_lesson_postmortems ──────────────────────────────────────────────
-- LLM critique of one lesson after a metrics window. content = JSON:
--   { worked: [...], didntWork: [...], next: [...] }
CREATE TABLE IF NOT EXISTS cs_lesson_postmortems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "lessonId" UUID NOT NULL REFERENCES cs_lessons(id) ON DELETE CASCADE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  "modelUsed" VARCHAR(100),
  "costUsd" NUMERIC(10,6) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_postmortems_lesson ON cs_lesson_postmortems("lessonId");

-- ── cs_brand_memories: pgvector retrieval ──────────────────────────────
-- Embed each memory's `content` once on save; semantic top-K replaces the
-- "all memories applicable to this agent type" lookup when the pool is large.
ALTER TABLE cs_brand_memories
  ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS idx_cs_memories_embedding
  ON cs_brand_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
