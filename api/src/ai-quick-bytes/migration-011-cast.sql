-- AQB: persist the cartoon cast a script stars (see CharacterCastingService).
-- jsonb shape:
--   { "main": "<slug>", "supporting": ["<slug>", ...], "cameo": ["<slug>", ...], "reasoning": "..." }
--
-- Scene generation REQUIRES cast to be present — existing scripts must
-- be regenerated before their scenes can be regenerated with the
-- per-character DNA system.
--
-- Additive + idempotent.

ALTER TABLE aqb_short_scripts
  ADD COLUMN IF NOT EXISTS cast jsonb;
