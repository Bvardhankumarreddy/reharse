-- AI Quick Bytes — Phase 1 foundation schema
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-001-foundation.sql
--
-- REQUIRES the postgres image to be pgvector/pgvector:pg16 (the `vector`
-- extension is created below). If the image is still postgres:16-alpine this
-- script will fail on CREATE EXTENSION.

CREATE EXTENSION IF NOT EXISTS vector;

-- ── news_sources ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aqb_news_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  "sourceType" VARCHAR(50) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  "fetchIntervalMinutes" INT NOT NULL DEFAULT 60,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastFetchedAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "errorCount" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aqb_sources_active ON aqb_news_sources("isActive");

-- ── news_items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aqb_news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sourceId" UUID REFERENCES aqb_news_sources(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  url VARCHAR(2000) NOT NULL,
  content TEXT,
  summary TEXT,
  author VARCHAR(255),
  "publishedAt" TIMESTAMPTZ,
  "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "contentHash" VARCHAR(64) NOT NULL UNIQUE,
  embedding vector(1536),
  status VARCHAR(50) NOT NULL DEFAULT 'raw',
  "topicTags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aqb_items_status    ON aqb_news_items(status);
CREATE INDEX IF NOT EXISTS idx_aqb_items_published ON aqb_news_items("publishedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_aqb_items_source    ON aqb_news_items("sourceId");
CREATE INDEX IF NOT EXISTS idx_aqb_items_hash      ON aqb_news_items("contentHash");
-- Approximate nearest-neighbour index for semantic dedup (cosine distance).
CREATE INDEX IF NOT EXISTS idx_aqb_items_embedding
  ON aqb_news_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── news_scores ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aqb_news_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "newsItemId" UUID NOT NULL UNIQUE REFERENCES aqb_news_items(id) ON DELETE CASCADE,
  "importanceScore" INT NOT NULL CHECK ("importanceScore" BETWEEN 1 AND 100),
  "noveltyScore" INT NOT NULL CHECK ("noveltyScore" BETWEEN 1 AND 100),
  "viralPotential" INT NOT NULL CHECK ("viralPotential" BETWEEN 1 AND 100),
  "compositeScore" INT GENERATED ALWAYS AS (
    (("importanceScore" * 0.5 + "noveltyScore" * 0.3 + "viralPotential" * 0.2))::INT
  ) STORED,
  reasoning TEXT,
  "modelUsed" VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
  "costUsd" NUMERIC(10, 6),
  "scoredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aqb_scores_composite ON aqb_news_scores("compositeScore" DESC);

-- ── short_scripts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aqb_short_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "newsItemId" UUID NOT NULL REFERENCES aqb_news_items(id) ON DELETE CASCADE,
  hook TEXT NOT NULL,
  body TEXT NOT NULL,
  cta TEXT NOT NULL,
  "fullScript" TEXT NOT NULL,
  "durationEstimateSeconds" INT,
  "avatarId" VARCHAR(100),
  "voiceId" VARCHAR(100),
  "brandVoiceScore" INT,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  "rejectionReason" TEXT,
  "approvedBy" VARCHAR(255),
  "approvedAt" TIMESTAMPTZ,
  "heygenVideoId" VARCHAR(255),
  "heygenVideoUrl" VARCHAR(2000),
  "youtubeVideoId" VARCHAR(50),
  "youtubeUrl" VARCHAR(500),
  "costUsd" NUMERIC(10, 6),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aqb_scripts_status    ON aqb_short_scripts(status);
CREATE INDEX IF NOT EXISTS idx_aqb_scripts_news_item ON aqb_short_scripts("newsItemId");
CREATE INDEX IF NOT EXISTS idx_aqb_scripts_heygen    ON aqb_short_scripts("heygenVideoId");

-- ── publishing_log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aqb_publishing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "scriptId" UUID NOT NULL REFERENCES aqb_short_scripts(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  "externalId" VARCHAR(255),
  "externalUrl" VARCHAR(500),
  "errorMessage" TEXT,
  "scheduledFor" TIMESTAMPTZ,
  "publishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aqb_pub_log_script    ON aqb_publishing_log("scriptId");
CREATE INDEX IF NOT EXISTS idx_aqb_pub_log_scheduled ON aqb_publishing_log("scheduledFor");

-- ── Seed the 8 news sources ────────────────────────────────────────────
INSERT INTO aqb_news_sources (name, "sourceType", url, "fetchIntervalMinutes")
SELECT * FROM (VALUES
  ('OpenAI Blog',    'rss',    'https://openai.com/blog/rss.xml', 60),
  ('Google AI Blog', 'rss',    'https://blog.google/technology/ai/rss/', 60),
  ('Anthropic News', 'scrape', 'https://www.anthropic.com/news', 60),
  ('The Batch',      'rss',    'https://www.deeplearning.ai/the-batch/feed/', 360),
  ('TechCrunch AI',  'rss',    'https://techcrunch.com/category/artificial-intelligence/feed/', 30),
  ('VentureBeat AI', 'rss',    'https://venturebeat.com/category/ai/feed/', 30),
  ('ArXiv cs.AI',    'api',    'http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending', 360),
  ('Hacker News AI', 'api',    'https://hn.algolia.com/api/v1/search', 30)
) AS v(name, "sourceType", url, "fetchIntervalMinutes")
WHERE NOT EXISTS (SELECT 1 FROM aqb_news_sources);
