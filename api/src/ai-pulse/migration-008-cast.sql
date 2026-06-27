-- AI Pulse: persist the cartoon cast a script stars (mirror of AQB).
-- See api/src/characters/services/character-casting.service.ts.
--
-- jsonb shape:
--   { "main": "<slug>", "supporting": ["<slug>", ...], "cameo": ["<slug>", ...], "reasoning": "..." }
--
-- Scene generation REQUIRES cast to be present — existing scripts must
-- be regenerated before their scenes can be regenerated with the
-- per-character DNA system.
--
-- Additive + idempotent.

ALTER TABLE ai_pulse_scripts
  ADD COLUMN IF NOT EXISTS cast jsonb;
