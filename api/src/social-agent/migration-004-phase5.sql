-- Social Agent Phase 5 — A/B + Audience + Competitors

-- A/B variants are stored in social_posts.generationContext.experimentId — no schema change

-- Audience demographic snapshots (weekly)
CREATE TABLE IF NOT EXISTS audience_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL,
  "snapshotDate" DATE NOT NULL,
  "totalAudience" INT NOT NULL DEFAULT 0,
  "ageBuckets" JSONB NOT NULL DEFAULT '{}'::jsonb,
  gender JSONB NOT NULL DEFAULT '{}'::jsonb,
  "topCountries" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "topCities" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "rawData" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_audience_per_week UNIQUE (platform, "snapshotDate")
);

CREATE INDEX IF NOT EXISTS idx_audience_platform ON audience_snapshots(platform);

-- Competitor channels (manual entry)
CREATE TABLE IF NOT EXISTS competitor_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL,
  handle VARCHAR(200) NOT NULL,
  "displayName" VARCHAR(200) NOT NULL,
  url TEXT,
  "followerCount" INT,
  "followerCountUpdatedAt" TIMESTAMPTZ,
  description TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_platform ON competitor_channels(platform);

CREATE TABLE IF NOT EXISTS competitor_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "competitorId" UUID NOT NULL REFERENCES competitor_channels(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  "referenceUrl" TEXT,
  "authorEmail" VARCHAR(200),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_notes_competitor ON competitor_notes("competitorId");
