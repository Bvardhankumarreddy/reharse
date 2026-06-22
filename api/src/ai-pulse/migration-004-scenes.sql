-- AI Pulse: scenes (cinematic image prompts per scene + voiceover +
-- music spec). Parallel to AQB's migration-009-scenes.sql but on the
-- ai_pulse_scripts table. Story format already lives in the per-vertical
-- script prompts; this layer adds the visual storyboard on top.
--
-- scenes shape (jsonb):
--   {
--     "scenes": [
--       { "scene_id":"01", "duration_seconds":3, "spoken_text":"…",
--         "setting":"…", "subject":"…", "shot":"…", "lighting":"…",
--         "mood":"…", "style":"…", "character_dna":"…",
--         "reference_image_url": "…" | null
--       },
--       …
--     ],
--     "scene_count": <int>,
--     "total_duration_sec": <int>,
--     "voiceover": { "full_text", "voice_style", "pacing_notes" },
--     "music":     { "style", "tempo", "mood", "minimax_prompt" }
--   }
--
-- Additive + idempotent.

ALTER TABLE ai_pulse_scripts
  ADD COLUMN IF NOT EXISTS scenes              JSONB,
  ADD COLUMN IF NOT EXISTS scenes_generated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS scenes_cost_usd     DECIMAL(10, 6) NOT NULL DEFAULT 0;
