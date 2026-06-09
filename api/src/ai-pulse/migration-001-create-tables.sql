-- AI Pulse: multi-vertical AI news pipeline (5 verticals, day-of-week rotation).
-- Additive + idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS ai_pulse_news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical VARCHAR(50) NOT NULL,
    -- ai_business | tech_industry | ai_science | ai_education | ai_society
  source_name VARCHAR(100) NOT NULL,
  source_url VARCHAR(2000) NOT NULL,
  source_type VARCHAR(50),
  external_id VARCHAR(500),

  headline TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  author VARCHAR(255),
  published_at TIMESTAMP,

  thumbnail_url VARCHAR(2000),
  entities JSONB DEFAULT '[]'::jsonb,

  relevance_score          DECIMAL(3,2),
  freshness_score          DECIMAL(3,2),
  india_relevance_score    DECIMAL(3,2),
  total_score              DECIMAL(3,2),

  status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- pending | scored | selected | rejected | processed

  duplicate_of UUID REFERENCES ai_pulse_news_items(id),
  ingested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_pulse_news_source_extid UNIQUE (source_name, external_id)
);
CREATE INDEX IF NOT EXISTS idx_pulse_vertical  ON ai_pulse_news_items(vertical);
CREATE INDEX IF NOT EXISTS idx_pulse_status    ON ai_pulse_news_items(status);
CREATE INDEX IF NOT EXISTS idx_pulse_score     ON ai_pulse_news_items(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_published ON ai_pulse_news_items(published_at DESC);

CREATE TABLE IF NOT EXISTS ai_pulse_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_item_id UUID NOT NULL REFERENCES ai_pulse_news_items(id) ON DELETE CASCADE,
  vertical VARCHAR(50) NOT NULL,

  english_title       VARCHAR(500),
  english_hook        TEXT,
  english_full_script TEXT,
  english_word_count  INT,

  telugu_title       VARCHAR(500),
  telugu_hook        TEXT,
  telugu_full_script TEXT,
  telugu_word_count  INT,

  llm_model    VARCHAR(100),
  llm_cost_usd DECIMAL(10,6) DEFAULT 0,

  english_avatar_id    VARCHAR(100),
  english_voice_id     VARCHAR(100),
  english_video_id     VARCHAR(255),
  english_video_url    VARCHAR(2000),
  english_video_status VARCHAR(50) DEFAULT 'pending',

  telugu_avatar_id     VARCHAR(100),
  telugu_voice_id      VARCHAR(100),
  telugu_video_id      VARCHAR(255),
  telugu_video_url     VARCHAR(2000),
  telugu_video_status  VARCHAR(50) DEFAULT 'pending',

  thumbnail_prompts JSONB DEFAULT '[]'::jsonb,
  thumbnail_urls    JSONB DEFAULT '[]'::jsonb,

  distribution_package JSONB,

  approval_status VARCHAR(50) NOT NULL DEFAULT 'pending_review',
    -- pending_review | approved | rejected | published
  approved_by      VARCHAR(255),
  approved_at      TIMESTAMP,
  rejection_reason TEXT,

  scheduled_publish_at TIMESTAMP,
  published_at         TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scripts_vertical  ON ai_pulse_scripts(vertical);
CREATE INDEX IF NOT EXISTS idx_scripts_status    ON ai_pulse_scripts(approval_status);
CREATE INDEX IF NOT EXISTS idx_scripts_scheduled ON ai_pulse_scripts(scheduled_publish_at);

CREATE TABLE IF NOT EXISTS ai_pulse_vertical_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  description  TEXT,

  day_of_week INT,
  publish_time TIME,

  avatar_id_english VARCHAR(100),
  avatar_id_telugu  VARCHAR(100),
  voice_id_english  VARCHAR(100),
  voice_id_telugu   VARCHAR(100),

  brand_color   VARCHAR(20),
  accent_color  VARCHAR(20),
  tone_keywords JSONB,

  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed all 5 verticals with enabled=FALSE except tech_industry (phased rollout).
INSERT INTO ai_pulse_vertical_config (vertical, display_name, description, enabled)
VALUES
  ('ai_business',   'AI Business',     'Global + Indian AI startups, funding, launches',                 FALSE),
  ('tech_industry', 'Tech Industry',   'Tech jobs, hiring, layoffs — Big Tech + Indian IT (active)',     TRUE),
  ('ai_science',    'AI Science',      'Global AI research + Indian science (ISRO, IIT, AIIMS)',         FALSE),
  ('ai_education',  'AI Education',    'Global AI edu tools + how Indian students use them',             FALSE),
  ('ai_society',    'AI Society',      'Global AI ethics + Indian impact (IT Rules, scams, regs)',      FALSE)
ON CONFLICT (vertical) DO NOTHING;
