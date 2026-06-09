-- Capture the LIVE YouTube title + description so the learning loop sees
-- your manual edits on YouTube Studio. Additive + idempotent.
-- Populated by aqb-metrics-fetcher every hour for every published short
-- that has a youtubeVideoId (and/or teluguYoutubeVideoId).

ALTER TABLE aqb_short_scripts
  ADD COLUMN IF NOT EXISTS "liveYoutubeTitle"            text,
  ADD COLUMN IF NOT EXISTS "liveYoutubeDescription"      text,
  ADD COLUMN IF NOT EXISTS "liveYoutubeFetchedAt"        timestamp,

  ADD COLUMN IF NOT EXISTS "liveTeluguYoutubeTitle"          text,
  ADD COLUMN IF NOT EXISTS "liveTeluguYoutubeDescription"    text,
  ADD COLUMN IF NOT EXISTS "liveTeluguYoutubeFetchedAt"      timestamp;
