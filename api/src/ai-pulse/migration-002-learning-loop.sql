-- AI Pulse learning loop: metrics + postmortems + memories.
-- Parallel to AQB's aqb_short_metrics / aqb_short_postmortems / aqb_memories.
-- Additive + idempotent.

-- Time-series YouTube stats per script per language.
CREATE TABLE IF NOT EXISTS ai_pulse_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES ai_pulse_scripts(id) ON DELETE CASCADE,
  youtube_video_id VARCHAR(50) NOT NULL,
  language VARCHAR(8) NOT NULL DEFAULT 'en',   -- 'en' | 'te'
  views INT NOT NULL DEFAULT 0,
  likes INT,
  comments INT,
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pulse_metrics_script_lang
  ON ai_pulse_metrics(script_id, language, fetched_at DESC);

-- Per-script postmortem written ≥3 days after publish.
CREATE TABLE IF NOT EXISTS ai_pulse_postmortems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES ai_pulse_scripts(id) ON DELETE CASCADE,
  vertical VARCHAR(50) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_used VARCHAR(100),
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_pulse_postmortem_script UNIQUE (script_id)
);
CREATE INDEX IF NOT EXISTS idx_pulse_postmortem_vertical
  ON ai_pulse_postmortems(vertical);

-- Promoted winning patterns per vertical, injected into next script-gen.
CREATE TABLE IF NOT EXISTS ai_pulse_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical VARCHAR(50) NOT NULL,
  memory_type VARCHAR(50) NOT NULL,
    -- hook_pattern | topic_signal | hashtag | thumbnail_style | dont
  content TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  applies_to JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- which agents read this memory: ['script'], ['thumbnail'], ['distribution']
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pulse_memory_vertical_type
  ON ai_pulse_memories(vertical, memory_type, is_active);

-- Live YouTube snippet columns on the script row — captures curator's
-- manual edits on YouTube Studio so the learning loop sees them.
-- Plus explicit YouTube video IDs (extracted from URLs on mark-published).
ALTER TABLE ai_pulse_scripts
  ADD COLUMN IF NOT EXISTS english_youtube_video_id        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS telugu_youtube_video_id         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS live_youtube_title              TEXT,
  ADD COLUMN IF NOT EXISTS live_youtube_description        TEXT,
  ADD COLUMN IF NOT EXISTS live_youtube_fetched_at         TIMESTAMP,
  ADD COLUMN IF NOT EXISTS live_telugu_youtube_title       TEXT,
  ADD COLUMN IF NOT EXISTS live_telugu_youtube_description TEXT,
  ADD COLUMN IF NOT EXISTS live_telugu_youtube_fetched_at  TIMESTAMP;
