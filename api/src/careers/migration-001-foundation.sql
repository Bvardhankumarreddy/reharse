-- Careers (Job Matches) — Phase 1 foundation schema
-- Apply with:
--   kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse < migration-001-foundation.sql
--
-- REQUIRES the postgres image to be pgvector/pgvector:pg16 (already true in
-- prod for AI Quick Bytes). CREATE EXTENSION below is a no-op if present.

CREATE EXTENSION IF NOT EXISTS vector;

-- ── career_companies ───────────────────────────────────────────────────
-- Curated ATS boards we poll. "boardToken" is the slug in the ATS public
-- job-board URL. Tokens are editable — a wrong one only logs a per-company
-- error and the rest of the run continues. Arbitrary companies a user
-- targets are covered by the Adzuna aggregator (by name + role), not here.
CREATE TABLE IF NOT EXISTS career_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  "atsPlatform" VARCHAR(20) NOT NULL,           -- greenhouse | lever | ashby
  "boardToken" VARCHAR(255) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  source VARCHAR(20) NOT NULL DEFAULT 'seed',   -- seed | user_target
  "lastFetchedAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "errorCount" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_companies_active ON career_companies("isActive");

-- ── career_job_listings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS career_job_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" UUID REFERENCES career_companies(id) ON DELETE SET NULL,
  "sourceType" VARCHAR(20) NOT NULL,            -- ats | aggregator
  source VARCHAR(40) NOT NULL,                  -- greenhouse | lever | ashby | adzuna
  "externalId" VARCHAR(255),
  title VARCHAR(500) NOT NULL,
  company VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  remote BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  embedding vector(1536),
  seniority VARCHAR(50),
  "employmentType" VARCHAR(50),
  "applyUrl" VARCHAR(2000) NOT NULL,
  "postedAt" TIMESTAMPTZ,
  "contentHash" VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active | expired
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_career_jobs_status   ON career_job_listings(status);
CREATE INDEX IF NOT EXISTS idx_career_jobs_posted   ON career_job_listings("postedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_career_jobs_hash     ON career_job_listings("contentHash");
CREATE INDEX IF NOT EXISTS idx_career_jobs_company  ON career_job_listings("companyId");
-- Approximate nearest-neighbour index for semantic match (cosine distance).
CREATE INDEX IF NOT EXISTS idx_career_jobs_embedding
  ON career_job_listings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── career_job_matches ─────────────────────────────────────────────────
-- One row per (user, job). User-set status (saved/dismissed/applied) is
-- preserved across re-matching; only score/rationale refresh.
CREATE TABLE IF NOT EXISTS career_job_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "jobListingId" UUID NOT NULL REFERENCES career_job_listings(id) ON DELETE CASCADE,
  "matchScore" NUMERIC(5,2) NOT NULL DEFAULT 0,
  similarity NUMERIC(6,4),
  rationale TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'matched', -- matched | saved | dismissed | applied
  "computedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("userId", "jobListingId")
);
CREATE INDEX IF NOT EXISTS idx_career_matches_user   ON career_job_matches("userId");
CREATE INDEX IF NOT EXISTS idx_career_matches_status ON career_job_matches("userId", status);
CREATE INDEX IF NOT EXISTS idx_career_matches_score  ON career_job_matches("matchScore" DESC);

-- ── Seed curated ATS boards (mostly Greenhouse — most reliable) ─────────
INSERT INTO career_companies (name, "atsPlatform", "boardToken")
SELECT * FROM (VALUES
  ('Stripe',     'greenhouse', 'stripe'),
  ('Airbnb',     'greenhouse', 'airbnb'),
  ('Databricks', 'greenhouse', 'databricks'),
  ('Coinbase',   'greenhouse', 'coinbase'),
  ('Dropbox',    'greenhouse', 'dropbox'),
  ('Lyft',       'greenhouse', 'lyft'),
  ('Pinterest',  'greenhouse', 'pinterest'),
  ('Reddit',     'greenhouse', 'reddit'),
  ('Robinhood',  'greenhouse', 'robinhood'),
  ('Asana',      'greenhouse', 'asana'),
  ('GitLab',     'greenhouse', 'gitlab'),
  ('Figma',      'greenhouse', 'figma'),
  ('Brex',       'greenhouse', 'brex'),
  ('Plaid',      'greenhouse', 'plaid'),
  ('Spotify',    'lever',      'spotify'),
  ('Ashby',      'ashby',      'Ashby')
) AS v(name, "atsPlatform", "boardToken")
WHERE NOT EXISTS (SELECT 1 FROM career_companies);
