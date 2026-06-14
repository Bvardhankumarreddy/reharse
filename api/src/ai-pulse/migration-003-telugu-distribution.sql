-- AI Pulse: add Telugu distribution package column.
-- The script already has telugu_title / telugu_hook / telugu_full_script
-- but the distribution package (YouTube title + description + hashtags,
-- Instagram caption, LinkedIn body, WhatsApp copy) was English-only —
-- nothing to publish on the Telugu video. This adds a parallel column
-- so the Telugu Short can be uploaded with native Telugu copy.
-- Additive + idempotent.

ALTER TABLE ai_pulse_scripts
  ADD COLUMN IF NOT EXISTS telugu_distribution_package JSONB;
