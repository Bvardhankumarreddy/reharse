-- AI Pulse: persist the cartoon cast a script stars (mirror of AQB).
-- See api/src/characters/services/character-casting.service.ts.
--
-- jsonb shape:
--   { "main": "<slug>", "supporting": ["<slug>", ...], "cameo": ["<slug>", ...], "reasoning": "..." }
--
-- Column named character_cast (not cast) because cast is a SQL
-- reserved word — unquoted use breaks ALTER TABLE / INSERT statements.
--
-- Scene generation REQUIRES character_cast to be present — existing
-- scripts must be regenerated before their scenes can be regenerated
-- with the per-character DNA system.
--
-- Additive + idempotent.

ALTER TABLE ai_pulse_scripts
  ADD COLUMN IF NOT EXISTS character_cast jsonb;
