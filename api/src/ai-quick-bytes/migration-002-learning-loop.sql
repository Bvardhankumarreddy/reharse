-- AI Quick Bytes — learning loop (mirrors Content Studio's improvement chain).
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-002-learning-loop.sql
--
-- Strictly additive. Existing AQB tables (aqb_news_items, aqb_news_scores,
-- aqb_short_scripts, aqb_publishing_log) are untouched. The new tables let
-- the system learn from real post-publish performance and feed winning
-- patterns back into scoring / script / thumbnail / distribution prompts.

-- Per-short YouTube performance (hourly upserts).
CREATE TABLE IF NOT EXISTS aqb_short_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "scriptId"       UUID NOT NULL REFERENCES aqb_short_scripts(id) ON DELETE CASCADE,
  "youtubeVideoId" VARCHAR(64) NOT NULL,
  views    BIGINT NOT NULL DEFAULT 0,
  likes    BIGINT,
  comments BIGINT,
  "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aqb_metrics_script  ON aqb_short_metrics("scriptId");
CREATE INDEX IF NOT EXISTS idx_aqb_metrics_fetched ON aqb_short_metrics("fetchedAt" DESC);

-- One postmortem per script (LLM-analyzed when the short matures).
CREATE TABLE IF NOT EXISTS aqb_short_postmortems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "scriptId" UUID NOT NULL UNIQUE REFERENCES aqb_short_scripts(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  -- shape: { worked: string[], didntWork: string[], next: string[],
  --         reusableHookPattern: string, winningThumbnailStyle: string,
  --         topicSignal: string }
  "modelUsed" VARCHAR(100),
  "costUsd"   NUMERIC(10,6),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Learned patterns promoted from postmortems / improvement sweeps.
-- appliesTo tags route a memory to one or more task types in the prompts.
CREATE TABLE IF NOT EXISTS aqb_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "memoryType" VARCHAR(40) NOT NULL,
  -- 'hook' | 'style' | 'thumbnail_style' | 'topic' | 'hashtag' | 'do' | 'dont'
  content TEXT NOT NULL,
  weight  INT NOT NULL DEFAULT 1,
  "appliesTo" JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- ['scoring','script','thumbnail','distribution']
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aqb_mem_type   ON aqb_memories("memoryType");
CREATE INDEX IF NOT EXISTS idx_aqb_mem_active ON aqb_memories("isActive");
