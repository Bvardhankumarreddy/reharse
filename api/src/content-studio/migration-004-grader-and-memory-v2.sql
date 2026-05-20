-- Content Studio — Phase B / Slice B2: Grader + auto-revise + memory v2.
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-004-grader-and-memory-v2.sql

-- Per-asset quality metadata (Grader + Improvement Loop).
-- `qualityScore INT` already exists from migration-001.
ALTER TABLE cs_content_assets
  ADD COLUMN IF NOT EXISTS revisions  INT           NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS critique   TEXT,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2);

-- Memory injection v2: each memory can be scoped to specific agent types.
-- Empty array (the default) means "applies to all" — backward compatible.
ALTER TABLE cs_brand_memories
  ADD COLUMN IF NOT EXISTS "appliesTo" JSONB NOT NULL DEFAULT '[]'::jsonb;
