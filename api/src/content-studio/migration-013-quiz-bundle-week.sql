-- Adds an explicit quiz_week to each bundle. The UI lets the user pick the
-- week number that will be written into every row's `quiz_week` column when
-- the CSV is downloaded — so they can target a different week of the admin
-- Quiz Module without renaming columns by hand.
--
-- Backfilled NULL when no explicit week was set at generate time; the
-- download endpoint then falls back to plan.seriesWeekNumber or 1.

ALTER TABLE cs_quiz_bundles
  ADD COLUMN IF NOT EXISTS quiz_week int;
