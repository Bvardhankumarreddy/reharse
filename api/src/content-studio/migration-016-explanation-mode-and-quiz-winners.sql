-- Content Studio mega-update (per CONTENT_STUDIO_MEGA_UPDATE.md):
--   1) Explicit explanation_mode on cs_lessons (inline | with_screen_recording)
--      separate from lessonFormat. The script agent branches on this to
--      either produce pure narration or narration + structured screen cues.
--   2) New cs_quiz_winner_announcements — LLM-generated 5-platform winner
--      announcement posts + 3 thumbnail prompts after a quiz wraps.
--
-- Apply:
--   ssh -i reharse.pem ubuntu@<HOST> \
--     'kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse' \
--     < api/src/content-studio/migration-016-explanation-mode-and-quiz-winners.sql

-- ── 1) Lesson: explanation mode ────────────────────────────────────────
ALTER TABLE cs_lessons
  ADD COLUMN IF NOT EXISTS "explanationMode" varchar(40) NOT NULL DEFAULT 'inline';

-- ── 2) Quiz winners ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_quiz_winner_announcements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              uuid NOT NULL REFERENCES cs_weekly_content_plans(id) ON DELETE CASCADE,
  brand_id             uuid NOT NULL,
  quiz_number          int  NOT NULL,
  quiz_topic           text,
  total_participants   int,
  speed_highlight      text,

  -- [{rank, name, score, maxScore, timeSeconds, prizeInr}]
  winners              jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- { youtube_community, instagram, linkedin, whatsapp_channel, whatsapp_status }
  posts                jsonb,
  -- [{style, headline, prompt, reasoning, estimatedCtrScore}]
  thumbnail_prompts    jsonb,

  posts_model          varchar(80),
  thumbnails_model     varchar(80),
  posts_cost_usd       numeric(10,6) NOT NULL DEFAULT 0,
  thumbnails_cost_usd  numeric(10,6) NOT NULL DEFAULT 0,
  status               varchar(40) NOT NULL DEFAULT 'generated',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_quiz_winners_plan
  ON cs_quiz_winner_announcements(plan_id);

CREATE INDEX IF NOT EXISTS idx_cs_quiz_winners_quiz_number
  ON cs_quiz_winner_announcements(quiz_number);
