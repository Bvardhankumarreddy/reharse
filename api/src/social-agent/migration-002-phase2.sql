-- Social Agent — Phase 2: LinkedIn auto-publish

-- Connections table — one per platform, encrypted tokens
CREATE TABLE IF NOT EXISTS social_platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL UNIQUE,
  "accountId" TEXT NOT NULL,
  "accountName" TEXT,
  "encryptedAccessToken" TEXT NOT NULL,
  "encryptedRefreshToken" TEXT,
  "tokenExpiresAt" TIMESTAMPTZ NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Extend social_posts with publish-tracking columns
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS "externalPostId" TEXT,
  ADD COLUMN IF NOT EXISTS "publishAttempts" INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastPublishAttemptAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
