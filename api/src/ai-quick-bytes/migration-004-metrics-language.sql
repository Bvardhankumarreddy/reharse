-- AQB learning loop now covers Telugu shorts too. Adds a `language` column
-- to aqb_short_metrics so we keep a separate time series per language per
-- short (one English row + one Telugu row per fetch). Backfills existing
-- rows as 'en' so historical metrics stay intact.

ALTER TABLE aqb_short_metrics
  ADD COLUMN IF NOT EXISTS language varchar(8) NOT NULL DEFAULT 'en';

CREATE INDEX IF NOT EXISTS idx_aqb_metrics_script_lang
  ON aqb_short_metrics("scriptId", language, "fetchedAt" DESC);
