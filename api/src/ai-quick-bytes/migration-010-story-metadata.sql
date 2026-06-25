-- AQB story-mode upgrade: persist the script-level decisions the LLM
-- now emits (protagonist, emotional arc, core message). Used by:
--   - Anti-repetition rule: scene generator queries the last N scripts'
--     protagonist + emotionalProgression to inject an "avoid these"
--     block into the next script generation prompt.
--   - Downstream agents (thumbnail, scene, distribution) reading
--     coreMessage as a clean north star.
--
-- Additive + idempotent.

ALTER TABLE aqb_short_scripts
  ADD COLUMN IF NOT EXISTS "protagonist"           VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "emotionalProgression"  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "coreMessage"           TEXT;
