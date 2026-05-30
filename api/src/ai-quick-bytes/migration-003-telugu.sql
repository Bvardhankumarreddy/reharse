-- AI Quick Bytes — Telugu auto-translation track.
-- Every English script also gets a Telugu translation (post-save, non-fatal),
-- and on approval BOTH a Telugu and English HeyGen video are queued. Columns
-- mirror the camelCase pattern already used on aqb_short_scripts.
--
-- Apply:
--   ssh -i reharse.pem ubuntu@<HOST> \
--     'kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse' \
--     < api/src/ai-quick-bytes/migration-003-telugu.sql

ALTER TABLE aqb_short_scripts
  ADD COLUMN IF NOT EXISTS "teluguHook"                    text,
  ADD COLUMN IF NOT EXISTS "teluguBody"                    text,
  ADD COLUMN IF NOT EXISTS "teluguCta"                     text,
  ADD COLUMN IF NOT EXISTS "teluguFullScript"              text,
  ADD COLUMN IF NOT EXISTS "teluguTranslationModel"        varchar(80),
  ADD COLUMN IF NOT EXISTS "teluguTranslationCostUsd"      numeric(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "teluguTranslatedAt"            timestamptz,
  ADD COLUMN IF NOT EXISTS "teluguHeygenVideoId"           varchar(255),
  ADD COLUMN IF NOT EXISTS "teluguHeygenVideoUrl"          varchar(2000),
  ADD COLUMN IF NOT EXISTS "teluguHeygenStatus"            varchar(50) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "teluguYoutubeVideoId"          varchar(50),
  ADD COLUMN IF NOT EXISTS "teluguYoutubeUrl"              varchar(500),
  ADD COLUMN IF NOT EXISTS "teluguDistributionPackage"     jsonb;

-- Lookup-by-video-id for the webhook handler (it matches incoming HeyGen
-- callbacks against either heygenVideoId or teluguHeygenVideoId).
CREATE INDEX IF NOT EXISTS idx_aqb_scripts_telugu_heygen_video_id
  ON aqb_short_scripts("teluguHeygenVideoId");

CREATE INDEX IF NOT EXISTS idx_aqb_scripts_telugu_heygen_status
  ON aqb_short_scripts("teluguHeygenStatus");
