-- Trust & Safety phase 1 — fingerprints, blocklist, audit log.
-- Quiz keys are quizWeek (int) and email (varchar) — matches the existing
-- quiz_submissions / quiz_sessions shape. Question IDs stay UUID since they
-- come from quiz_questions.
--
-- Apply:
--   ssh -i reharse.pem ubuntu@<HOST> \
--     'kubectl exec -i -n rehearse postgres-0 -- psql -U rehearse -d rehearse' \
--     < api/src/trust-safety/migration-001-foundation.sql

-- ── Submission fingerprints ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ts_submission_fingerprints (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Submission may be NULL on capture-at-start (no submission row yet).
  submission_id                   uuid,
  session_id                      uuid,
  quiz_week                       int NOT NULL,
  user_email                      varchar(255) NOT NULL,
  user_name                       varchar(255),

  -- Network signals
  ip_address                      inet NOT NULL,
  ip_country                      varchar(80),
  ip_region                       varchar(120),
  ip_city                         varchar(120),
  ip_latitude                     numeric(10, 7),
  ip_longitude                    numeric(10, 7),
  is_vpn                          boolean NOT NULL DEFAULT false,

  -- Device signals (sent from FingerprintJS on the client)
  user_agent                      text,
  device_fingerprint              varchar(255),
  browser_id                      varchar(255),
  screen_resolution               varchar(60),

  -- Behavioral signals (captured client-side, posted on submit)
  total_time_seconds              int,
  score                           int,
  question_ids                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  avg_time_per_question_seconds   numeric(6, 2),
  fastest_answer_seconds          int,
  tab_switch_count                int NOT NULL DEFAULT 0,
  copy_paste_detected             boolean NOT NULL DEFAULT false,

  -- Phase = 'start' (created on session create) or 'submit' (final row).
  phase                           varchar(20) NOT NULL DEFAULT 'submit',

  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_fp_ip          ON ts_submission_fingerprints(ip_address);
CREATE INDEX IF NOT EXISTS idx_ts_fp_device      ON ts_submission_fingerprints(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_ts_fp_quiz_week   ON ts_submission_fingerprints(quiz_week);
CREATE INDEX IF NOT EXISTS idx_ts_fp_email       ON ts_submission_fingerprints(user_email);
CREATE INDEX IF NOT EXISTS idx_ts_fp_geo         ON ts_submission_fingerprints(ip_latitude, ip_longitude);
CREATE INDEX IF NOT EXISTS idx_ts_fp_created     ON ts_submission_fingerprints(created_at);
CREATE INDEX IF NOT EXISTS idx_ts_fp_submission  ON ts_submission_fingerprints(submission_id);

-- ── Blocklist ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ts_blocklist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_type      varchar(40) NOT NULL,   -- email | ip | device
  block_value     varchar(500) NOT NULL,
  reason          text,
  blocked_by      varchar(255),
  blocked_at      timestamptz NOT NULL DEFAULT now(),
  permanent       boolean NOT NULL DEFAULT false,
  expires_at      timestamptz,
  UNIQUE (block_type, block_value)
);

CREATE INDEX IF NOT EXISTS idx_ts_blocklist_value ON ts_blocklist(block_value);
CREATE INDEX IF NOT EXISTS idx_ts_blocklist_type  ON ts_blocklist(block_type);

-- ── Audit log (separate from cs_audit_log — different volume, different shape) ─
CREATE TABLE IF NOT EXISTS ts_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action          varchar(100) NOT NULL,
  actor           varchar(255),
  target_type     varchar(60),
  target_id       uuid,
  details         jsonb,
  ip_address      inet,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_audit_action   ON ts_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_ts_audit_target   ON ts_audit_log(target_id);
CREATE INDEX IF NOT EXISTS idx_ts_audit_created  ON ts_audit_log(created_at);
