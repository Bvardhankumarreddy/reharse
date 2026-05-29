-- Content Studio → Admin Quiz Module bundle.
-- Generates a CSV ready to upload into the admin Quiz Module (mixed-type
-- questions + title + description + tie-breaker). Lives parallel to the
-- existing 50-pool / 9-draw Saturday-quiz XLSX flow — neither touches the
-- other. The UI panel's count/toughness selector drives bundle size.

CREATE TABLE IF NOT EXISTS cs_quiz_bundles (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                 uuid NOT NULL REFERENCES cs_weekly_content_plans(id) ON DELETE CASCADE,
  brand_id                uuid NOT NULL,
  week_of                 date NOT NULL,

  -- LLM-generated metadata (filled in the admin Quiz Module's UI fields).
  title                   text NOT NULL,
  description             text NOT NULL,

  -- Numeric tie-breaker — exact match (tolerance 0 = closest-guess wins).
  tie_breaker_question    text NOT NULL,
  tie_breaker_answer      numeric NOT NULL,
  tie_breaker_tolerance   numeric NOT NULL DEFAULT 0,
  tie_breaker_unit        varchar(60),

  -- Knobs the bundle was generated with — mirrored from the UI panel.
  question_count          int  NOT NULL,
  toughness               int  NOT NULL,

  generator_model         varchar(80),
  cost_usd                numeric(10,6) NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_quiz_bundles_plan
  ON cs_quiz_bundles(plan_id);

-- One row per question in the bundle. Mixed types — shape mirrors the admin
-- Quiz Module importer CSV columns exactly so we can stream straight to CSV.
CREATE TABLE IF NOT EXISTS cs_quiz_bundle_questions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id           uuid NOT NULL REFERENCES cs_quiz_bundles(id) ON DELETE CASCADE,
  position            int  NOT NULL,

  question_type       varchar(20) NOT NULL,  -- mcq | true_false | multi_select | numeric
  question_text       text NOT NULL,

  option_a            text,
  option_b            text,
  option_c            text,
  option_d            text,

  correct_answer      varchar(1),            -- mcq | true_false  (A-D)
  correct_answers     text,                  -- multi_select      (e.g. "A,C,D")
  correct_number      numeric,               -- numeric
  numeric_tolerance   numeric,               -- numeric
  numeric_unit        varchar(60),           -- numeric

  points              int  NOT NULL DEFAULT 1,
  difficulty          varchar(10) NOT NULL,  -- easy | medium | hard
  category            text,
  is_mandatory        boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_quiz_bundle_questions_bundle
  ON cs_quiz_bundle_questions(bundle_id);
