-- Content Studio: cinematic scenes per lesson. Mirrors AQB / AI Pulse
-- scenes shape but adapted for 8-10 min lessons (chapter-grouped, ~20-30
-- scenes per lesson; each scene tagged with chapter_id linking back to the
-- lesson's outline section).
--
-- scenes shape (jsonb):
--   {
--     "scenes": [
--       { "scene_id":"01", "chapter_id":"intro", "duration_seconds":4,
--         "spoken_text":"…", "setting":"…", "subject":"…", "shot":"…",
--         "lighting":"…", "mood":"…", "style":"…", "character_dna":"…",
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

ALTER TABLE cs_lessons
  ADD COLUMN IF NOT EXISTS scenes              JSONB,
  ADD COLUMN IF NOT EXISTS scenes_generated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS scenes_cost_usd     DECIMAL(10, 6) NOT NULL DEFAULT 0;
