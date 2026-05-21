-- Content Studio — curator approval gate.
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-010-plan-approval.sql
--
-- A plan must be APPROVED by a human before the pipeline can run, so a bad
-- theme can't silently cascade through 7 stages and burn cost. Additive,
-- idempotent. Existing plans default to 'pending'.

ALTER TABLE cs_weekly_content_plans
  ADD COLUMN IF NOT EXISTS "approvalStatus" VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  ADD COLUMN IF NOT EXISTS "approvedBy" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "approvalNote" TEXT;
