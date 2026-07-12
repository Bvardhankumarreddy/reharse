-- Apply BEFORE deploying the code that ships SystemModule / CronGateService.
-- Skipping this migration will make CronGateService fail open on boot (crons
-- keep running) and the admin UI toggle will error on save.

CREATE TABLE IF NOT EXISTS system_settings (
  key         varchar(100) PRIMARY KEY,
  value       jsonb        NOT NULL,
  updated_by  varchar(255),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Seed the crons.paused key to false so isPaused() returns a clean value
-- from the very first read (avoids a "row not found → default false" branch
-- that would otherwise fire on every uncached read until the operator
-- clicks the toggle for the first time).
INSERT INTO system_settings (key, value, updated_by)
VALUES ('crons.paused', 'false'::jsonb, 'system-init')
ON CONFLICT (key) DO NOTHING;
