-- AQB Quote Bank: curated motivational quotes injected at the closing of
-- each short (just before the CTA). The bank is admin-curated — quotes
-- are either typed in manually OR drafted by Claude (the "Suggest"
-- endpoint) then human-approved before being persisted. There is NO
-- auto-ingest path on purpose: misattribution risk is too high.
--
-- Rotation logic (in QuoteBankService.pickFor):
--   1. Filter active + same language + not used in last 30 days
--   2. If eligible pool < 5, drop the 30-day rule
--   3. LLM picks the best fit from a shortlist of N for this story's theme
--
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS aqb_quotes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language      VARCHAR(8) NOT NULL DEFAULT 'en',          -- 'en' | 'te' (te seeded later)
  text          TEXT NOT NULL,
  author        VARCHAR(255) NOT NULL,
  source        VARCHAR(255),                              -- book / speech / film, nullable
  themes        TEXT[] NOT NULL DEFAULT '{}',              -- ['perseverance','learning','innovation']
  times_used    INT NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMP,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Picker filters by (language, is_active) and orders by last_used_at NULLS FIRST.
CREATE INDEX IF NOT EXISTS idx_aqb_quotes_lang_active
  ON aqb_quotes (language, is_active);

CREATE INDEX IF NOT EXISTS idx_aqb_quotes_last_used
  ON aqb_quotes (last_used_at NULLS FIRST);

-- Persist the picked quote ON the script row so admin can see / edit /
-- swap from the approval UI without re-running the picker. Nullable
-- because old rows + non-coding question types won't have one.
ALTER TABLE aqb_short_scripts
  ADD COLUMN IF NOT EXISTS "closingQuoteId"     UUID,
  ADD COLUMN IF NOT EXISTS "closingQuoteText"   TEXT,
  ADD COLUMN IF NOT EXISTS "closingQuoteAuthor" VARCHAR(255);
