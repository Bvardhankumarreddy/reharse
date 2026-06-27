-- AQB: persist Telugu scene blueprints alongside English. Same payload
-- shape as the `scenes` jsonb column; only spoken_text + voiceover
-- full_text differ (Telugu instead of English). Generated on demand
-- via POST /approval/:id/scenes/generate?language=te.
--
-- Additive + idempotent.

ALTER TABLE aqb_short_scripts
  ADD COLUMN IF NOT EXISTS scenes_te               jsonb,
  ADD COLUMN IF NOT EXISTS scenes_te_generated_at  timestamp,
  ADD COLUMN IF NOT EXISTS scenes_te_cost_usd      numeric(10, 6) DEFAULT 0;
