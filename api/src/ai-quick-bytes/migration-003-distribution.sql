-- AI Quick Bytes — Phase 1.2: Thumbnail prompt + Distribution package
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-003-distribution.sql

ALTER TABLE aqb_short_scripts
  ADD COLUMN IF NOT EXISTS "thumbnailPrompt"          JSONB,
  ADD COLUMN IF NOT EXISTS "thumbnailCostUsd"         NUMERIC(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "thumbnailGeneratedAt"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "distributionPackage"      JSONB,
  ADD COLUMN IF NOT EXISTS "distributionCostUsd"      NUMERIC(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "distributionGeneratedAt"  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_aqb_scripts_distribution_generated
  ON aqb_short_scripts("distributionGeneratedAt")
  WHERE "distributionGeneratedAt" IS NOT NULL;
