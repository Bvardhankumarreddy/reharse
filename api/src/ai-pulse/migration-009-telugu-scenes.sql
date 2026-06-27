-- AI Pulse: persist Telugu scene blueprints alongside English. Mirror of
-- AQB migration-012-telugu-scenes.sql. Same shape as the `scenes`
-- jsonb column; only spoken_text + voiceover full_text differ.
-- Generated via POST /scenes/generate?language=te.
--
-- Additive + idempotent.

ALTER TABLE ai_pulse_scripts
  ADD COLUMN IF NOT EXISTS scenes_te               jsonb,
  ADD COLUMN IF NOT EXISTS scenes_te_generated_at  timestamp,
  ADD COLUMN IF NOT EXISTS scenes_te_cost_usd      numeric(10, 6) DEFAULT 0;
