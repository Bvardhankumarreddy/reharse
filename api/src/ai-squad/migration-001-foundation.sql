-- AI Squad — Phase 1 foundation schema
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-001-foundation.sql

CREATE TABLE IF NOT EXISTS ai_squad_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  "targetAudience" VARCHAR(100) NOT NULL DEFAULT 'general',
  "estimatedTopicsCount" INT NOT NULL DEFAULT 10,
  "llmGenerated" BOOLEAN NOT NULL DEFAULT true,
  "generationCostUsd" NUMERIC(10, 6) NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asq_themes_status   ON ai_squad_themes(status);
CREATE INDEX IF NOT EXISTS idx_asq_themes_category ON ai_squad_themes(category);

CREATE TABLE IF NOT EXISTS ai_squad_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "themeId" UUID NOT NULL REFERENCES ai_squad_themes(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  angle VARCHAR(255),
  "topicType" VARCHAR(50),
  "recommendedCharacters" JSONB NOT NULL DEFAULT '[]'::jsonb,
  difficulty VARCHAR(50) NOT NULL DEFAULT 'beginner',
  "estimatedDurationMinutes" INT NOT NULL DEFAULT 8,
  format VARCHAR(50) NOT NULL DEFAULT 'long',
  "keyConcepts" JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'planned',
  "scheduledFor" DATE,
  "llmGenerated" BOOLEAN NOT NULL DEFAULT true,
  "generationCostUsd" NUMERIC(10, 6) NOT NULL DEFAULT 0,
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asq_topics_theme  ON ai_squad_topics("themeId");
CREATE INDEX IF NOT EXISTS idx_asq_topics_status ON ai_squad_topics(status);
CREATE INDEX IF NOT EXISTS idx_asq_topics_format ON ai_squad_topics(format);

CREATE TABLE IF NOT EXISTS ai_squad_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "topicId" UUID NOT NULL REFERENCES ai_squad_topics(id) ON DELETE CASCADE,
  "episodeNumber" INT NOT NULL,
  title VARCHAR(500),
  status VARCHAR(50) NOT NULL DEFAULT 'planning',
  "charactersUsed" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "characterCount" INT NOT NULL DEFAULT 2,
  format VARCHAR(50) NOT NULL DEFAULT 'long',
  "fullDialogueText" TEXT,
  "durationEstimateSeconds" INT,
  "totalSegments" INT NOT NULL DEFAULT 0,
  "llmCostUsd" NUMERIC(10, 6) NOT NULL DEFAULT 0,
  "heygenCostCredits" INT NOT NULL DEFAULT 0,
  "thumbnailPrompts" JSONB,
  "selectedThumbnailIndex" INT,
  "thumbnailImageUrl" VARCHAR(2000),
  "distributionPackage" JSONB,
  "distributionCostUsd" NUMERIC(10, 6) NOT NULL DEFAULT 0,
  "approvedBy" VARCHAR(255),
  "approvedAt" TIMESTAMPTZ,
  "publishedYoutubeUrl" VARCHAR(500),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asq_ep_status ON ai_squad_episodes(status);
CREATE INDEX IF NOT EXISTS idx_asq_ep_topic  ON ai_squad_episodes("topicId");
CREATE INDEX IF NOT EXISTS idx_asq_ep_number ON ai_squad_episodes("episodeNumber");

CREATE TABLE IF NOT EXISTS ai_squad_dialogue_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "episodeId" UUID NOT NULL REFERENCES ai_squad_episodes(id) ON DELETE CASCADE,
  "segmentOrder" INT NOT NULL,
  "characterKey" VARCHAR(50) NOT NULL,
  "speakerName" VARCHAR(50) NOT NULL,
  text TEXT NOT NULL,
  "textWithPauses" TEXT,
  "emotionTag" VARCHAR(50),
  "durationEstimateSeconds" NUMERIC(5, 2),
  "heygenVideoId" VARCHAR(255),
  "heygenVideoUrl" VARCHAR(2000),
  "heygenStatus" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "heygenError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asq_seg_episode      ON ai_squad_dialogue_segments("episodeId");
CREATE INDEX IF NOT EXISTS idx_asq_seg_episode_ord  ON ai_squad_dialogue_segments("episodeId", "segmentOrder");
CREATE INDEX IF NOT EXISTS idx_asq_seg_status       ON ai_squad_dialogue_segments("heygenStatus");
CREATE INDEX IF NOT EXISTS idx_asq_seg_character    ON ai_squad_dialogue_segments("characterKey");

CREATE TABLE IF NOT EXISTS ai_squad_episode_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "episodeId" UUID NOT NULL REFERENCES ai_squad_episodes(id) ON DELETE CASCADE,
  "assetType" VARCHAR(50) NOT NULL,
  url VARCHAR(2000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asq_assets_episode ON ai_squad_episode_assets("episodeId");
CREATE INDEX IF NOT EXISTS idx_asq_assets_type    ON ai_squad_episode_assets("assetType");
