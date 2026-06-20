-- AQB scene generator: cinematic image prompts for ChatGPT, broken down
-- per ~2-4 sec scene of the spoken script. Story-mode feature — sits
-- alongside the existing flow without changing it (HeyGen avatar still
-- works, Telugu still works, etc.). New Admin tab "🎬 Scenes" reads
-- these columns.
--
-- scenes shape:
--   {
--     "scenes": [
--       { "scene":"01", "duration":"3s", "spoken_text":"…", "prompt":"…" },
--       …
--     ],
--     "scene_count": <int>,
--     "total_duration_sec": <int>
--   }
--
-- Additive + idempotent.

ALTER TABLE aqb_short_scripts
  ADD COLUMN IF NOT EXISTS "scenes"             JSONB,
  ADD COLUMN IF NOT EXISTS "scenesGeneratedAt"  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "scenesCostUsd"      DECIMAL(10, 6) NOT NULL DEFAULT 0;
