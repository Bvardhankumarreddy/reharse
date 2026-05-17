-- AI Quick Bytes — Phase 1.1: Day Counter
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-002-day-counter.sql
--
-- Adds a sequential "Day N of AI Quick Bytes" counter to scripts. Nullable
-- (pre-feature drafts have none); assigned at generation time.

ALTER TABLE aqb_short_scripts
  ADD COLUMN IF NOT EXISTS "dayNumber" INT;

CREATE INDEX IF NOT EXISTS idx_aqb_scripts_day_number
  ON aqb_short_scripts("dayNumber" DESC);

-- ── OPTIONAL backfill (run manually if you have existing approved scripts) ──
-- WITH numbered AS (
--   SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
--   FROM aqb_short_scripts
--   WHERE status IN ('draft','approved','generating','ready','published')
--     AND "dayNumber" IS NULL
-- )
-- UPDATE aqb_short_scripts s
-- SET "dayNumber" = n.rn
-- FROM numbered n
-- WHERE s.id = n.id;
