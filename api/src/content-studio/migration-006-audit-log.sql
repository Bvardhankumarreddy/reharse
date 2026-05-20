-- Content Studio — Phase C / Slice C2: audit log of admin mutations.
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-006-audit-log.sql
--
-- One row per audit-worthy change. before/after capture only the relevant
-- slice (not full entities) to keep rows compact.

CREATE TABLE IF NOT EXISTS cs_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "entityType" VARCHAR(40) NOT NULL,    -- brand | asset | plan | memory
  "entityId" UUID,
  "userId" VARCHAR(64),                 -- BetterAuth user id (jwt.sub)
  "userEmail" VARCHAR(255),
  action VARCHAR(40) NOT NULL,          -- updated | rolled_back | created | deleted
  before JSONB,
  after JSONB,
  summary TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_audit_entity  ON cs_audit_log("entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_cs_audit_created ON cs_audit_log("createdAt" DESC);
