-- Content Studio — Phase C / Slice C1: per-brand model overrides.
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-005-brand-overrides.sql
--
-- modelOverrides is a map { task → modelId }. Examples of valid keys:
--   strategy, script, ppt, seo, thumbnail, promo, quiz, quiz_validator, grader.
-- Empty object = no overrides; falls back to env / tier defaults.

ALTER TABLE cs_brands
  ADD COLUMN IF NOT EXISTS "modelOverrides" JSONB NOT NULL DEFAULT '{}'::jsonb;
