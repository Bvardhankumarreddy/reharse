-- AI Squad — Phase 2.1: Multi-language (English + Hindi + Telugu)
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-002-multi-language.sql

ALTER TABLE ai_squad_episodes
  ADD COLUMN IF NOT EXISTS languages JSONB NOT NULL DEFAULT '["english"]'::jsonb,
  ADD COLUMN IF NOT EXISTS "primaryLanguage" VARCHAR(20) NOT NULL DEFAULT 'english',
  ADD COLUMN IF NOT EXISTS "translationCostUsd" NUMERIC(10, 6) NOT NULL DEFAULT 0;

ALTER TABLE ai_squad_dialogue_segments
  ADD COLUMN IF NOT EXISTS "languageCode" VARCHAR(20) NOT NULL DEFAULT 'english',
  ADD COLUMN IF NOT EXISTS "originalSegmentId" UUID;
CREATE INDEX IF NOT EXISTS idx_asq_seg_language
  ON ai_squad_dialogue_segments("languageCode");
CREATE INDEX IF NOT EXISTS idx_asq_seg_ep_lang
  ON ai_squad_dialogue_segments("episodeId", "languageCode");

CREATE TABLE IF NOT EXISTS ai_squad_language_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "episodeId" UUID NOT NULL REFERENCES ai_squad_episodes(id) ON DELETE CASCADE,
  "languageCode" VARCHAR(20) NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "translatedDialogue" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "translatedFullText" TEXT,
  "translationCostUsd" NUMERIC(10, 6) NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  "publishedYoutubeUrl" VARCHAR(500),
  "publishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_asq_lang_per_episode UNIQUE ("episodeId", "languageCode")
);
CREATE INDEX IF NOT EXISTS idx_asq_langver_episode ON ai_squad_language_versions("episodeId");
CREATE INDEX IF NOT EXISTS idx_asq_langver_status  ON ai_squad_language_versions(status);
