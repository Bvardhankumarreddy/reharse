-- Quiz subscribers — users who opted in for "notify me when quiz starts".
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS quiz_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) NOT NULL,
  name VARCHAR(200),
  youtube_handle VARCHAR(100),

  -- Unique random token used to build the one-click unsubscribe link.
  unsubscribe_token VARCHAR(64) NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Which quiz weeks we've already emailed this subscriber about,
  -- so the cron doesn't double-send if the window overlaps.
  notified_weeks JSONB NOT NULL DEFAULT '[]'::jsonb,

  subscribed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMP,

  CONSTRAINT uq_quiz_sub_email UNIQUE (email),
  CONSTRAINT uq_quiz_sub_token UNIQUE (unsubscribe_token)
);

CREATE INDEX IF NOT EXISTS idx_quiz_subs_active
  ON quiz_subscribers(is_active);
