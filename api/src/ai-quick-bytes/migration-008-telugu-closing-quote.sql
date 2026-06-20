-- AQB: Telugu closing-quote columns parallel to the English ones.
--
-- Before this change the English quote got injected into fullScript and
-- then the Telugu translator translated the whole thing — so the Telugu
-- video ended with a translated English quote. That defeats the point of
-- the cultural anchor. Now each language picks its own quote from the
-- bank's language='en' / language='te' rows independently.
--
-- Additive + idempotent.

ALTER TABLE aqb_short_scripts
  ADD COLUMN IF NOT EXISTS "teluguClosingQuoteId"     UUID,
  ADD COLUMN IF NOT EXISTS "teluguClosingQuoteText"   TEXT,
  ADD COLUMN IF NOT EXISTS "teluguClosingQuoteAuthor" VARCHAR(255);
