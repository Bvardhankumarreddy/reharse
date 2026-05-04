-- Social Agent Phase 4 — engagement tracking + AI insights

-- Engagement snapshots (one row per post per day)
CREATE TABLE IF NOT EXISTS post_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "socialPostId" UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  likes INT NOT NULL DEFAULT 0,
  comments INT NOT NULL DEFAULT 0,
  shares INT NOT NULL DEFAULT 0,
  saves INT NOT NULL DEFAULT 0,
  impressions INT NOT NULL DEFAULT 0,
  reach INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  "engagementRate" NUMERIC(6,2) NOT NULL DEFAULT 0,
  "syncedDate" DATE NOT NULL,
  "syncSource" VARCHAR(50),
  "rawData" JSONB,
  "syncedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_post_engagement_per_day UNIQUE ("socialPostId", "syncedDate")
);

CREATE INDEX IF NOT EXISTS idx_engagement_post   ON post_engagement("socialPostId");
CREATE INDEX IF NOT EXISTS idx_engagement_synced ON post_engagement("syncedAt");

-- Claude-generated insights cache
CREATE TABLE IF NOT EXISTS social_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "insightType" VARCHAR(50) NOT NULL,
  platform VARCHAR(50),
  "insightData" JSONB NOT NULL,
  "confidenceScore" NUMERIC(3,2) NOT NULL DEFAULT 0,
  "generatedBy" VARCHAR(20) NOT NULL DEFAULT 'claude',
  "dataPeriodStart" TIMESTAMPTZ NOT NULL,
  "dataPeriodEnd" TIMESTAMPTZ NOT NULL,
  "isActionable" BOOLEAN NOT NULL DEFAULT true,
  "appliedAt" TIMESTAMPTZ,
  "generatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_type     ON social_insights("insightType");
CREATE INDEX IF NOT EXISTS idx_insights_active   ON social_insights("isActionable", "generatedAt");
