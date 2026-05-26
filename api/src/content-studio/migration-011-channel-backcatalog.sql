-- Content Studio — own-channel back-catalog ingestion.
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-011-channel-backcatalog.sql
--
-- Lets Content Studio pull the brand's OWN existing YouTube uploads (40+ videos)
-- + stats, so insights / Strategy / Improvement can learn from real performance,
-- not just the lessons it published itself. Additive, idempotent.

ALTER TABLE cs_channels
  ADD COLUMN IF NOT EXISTS "youtubeChannelId" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "youtubeHandle"    VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "lastSyncedAt"     TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS cs_channel_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "brandId"   UUID NOT NULL REFERENCES cs_brands(id) ON DELETE CASCADE,
  "channelId" UUID REFERENCES cs_channels(id) ON DELETE SET NULL,
  "externalId" VARCHAR(64) NOT NULL,          -- YouTube video id
  title VARCHAR(500) NOT NULL,
  description TEXT,
  "publishedAt" TIMESTAMPTZ,
  "viewCount"    BIGINT NOT NULL DEFAULT 0,
  "likeCount"    BIGINT,
  "commentCount" BIGINT,
  "durationSeconds" INT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  "fetchedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_channel_videos_uniq  ON cs_channel_videos("brandId", "externalId");
CREATE INDEX IF NOT EXISTS idx_cs_channel_videos_brand ON cs_channel_videos("brandId");
CREATE INDEX IF NOT EXISTS idx_cs_channel_videos_views ON cs_channel_videos("viewCount" DESC);
