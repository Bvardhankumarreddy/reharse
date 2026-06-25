-- Content Studio: capture the LIVE YouTube title + description per
-- lesson so the edit-pattern miner (mirror of AQB / AI Pulse) can diff
-- what was published vs what the LLM drafted.
--
-- The metrics fetcher already calls videos.list with part=snippet,
-- statistics — snippet data was just being discarded. This migration
-- adds the columns; the fetcher commit alongside this writes to them.
--
-- Additive + idempotent.

ALTER TABLE cs_lessons
  ADD COLUMN IF NOT EXISTS "liveYoutubeTitle"        TEXT,
  ADD COLUMN IF NOT EXISTS "liveYoutubeDescription"  TEXT,
  ADD COLUMN IF NOT EXISTS "liveYoutubeFetchedAt"    TIMESTAMP;
