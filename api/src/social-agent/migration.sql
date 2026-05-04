-- Social Agent — Phase 1 schema
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL,
  "contentType" VARCHAR(30) NOT NULL,
  "textContent" TEXT NOT NULL,
  "imageUrl" TEXT,
  "linkUrl" TEXT,
  "scheduledAt" TIMESTAMPTZ NOT NULL,
  "publishedAt" TIMESTAMPTZ,
  "externalUrl" TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending_approval',
  "generatedBy" VARCHAR(20) NOT NULL DEFAULT 'manual',
  "generationContext" JSONB,
  "approvedAt" TIMESTAMPTZ,
  "approvedBy" VARCHAR(255),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_status     ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled  ON social_posts("scheduledAt");
CREATE INDEX IF NOT EXISTS idx_social_posts_platform   ON social_posts(platform);
