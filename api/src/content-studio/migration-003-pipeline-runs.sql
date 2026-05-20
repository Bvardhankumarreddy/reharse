-- Content Studio — Slice 5: end-to-end pipeline runs (orchestrator).
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-003-pipeline-runs.sql

CREATE TABLE IF NOT EXISTS cs_pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "planId" UUID NOT NULL REFERENCES cs_weekly_content_plans(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued | running | completed | failed | cancelled
  "currentStage" VARCHAR(20),
  "stagesCompleted" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "stagesFailed" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "resumableFrom" VARCHAR(20),
  "costAtStart" NUMERIC(10,6) NOT NULL DEFAULT 0,
  "costDelta" NUMERIC(10,6) NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMPTZ,
  "finishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_runs_plan   ON cs_pipeline_runs("planId");
CREATE INDEX IF NOT EXISTS idx_cs_runs_status ON cs_pipeline_runs(status);
