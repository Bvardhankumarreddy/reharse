-- AQB: persist the cartoon cast a script stars (see CharacterCastingService).
--
-- jsonb shape:
--   { "main": "<slug>", "supporting": ["<slug>", ...], "cameo": ["<slug>", ...], "reasoning": "..." }
--
-- Column named "characterCast" rather than "cast" because cast is a
-- SQL reserved word — unquoted use breaks ALTER TABLE and would also
-- break TypeORM auto-generated INSERTs.
--
-- Scene generation REQUIRES characterCast to be present — existing
-- scripts must be regenerated before their scenes can be regenerated
-- with the per-character DNA system.
--
-- Additive + idempotent.

ALTER TABLE aqb_short_scripts
  ADD COLUMN IF NOT EXISTS "characterCast" jsonb;
