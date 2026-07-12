-- Apply BEFORE deploying the code that ships SystemModule / CronGateService.
-- Skipping this migration will make CronGateService fail open on boot
-- (all crons keep running) and the admin UI toggle will error on save.

CREATE TABLE IF NOT EXISTS system_settings (
  key         varchar(100) PRIMARY KEY,
  value       jsonb        NOT NULL,
  updated_by  varchar(255),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Cleanup: the very first version of this migration seeded a single
-- global 'crons.paused' key. That semantics has been replaced by
-- per-cron keys ('cron.aqb.ingestion' etc.), so this row is now dead.
-- Safe to delete on re-apply; harmless if it was never seeded.
DELETE FROM system_settings WHERE key = 'crons.paused';

-- No per-cron rows are seeded — the absence of a row means "not paused",
-- so the untouched-crons-run default is enforced without seeding.
