-- Shared character dictionary. One row per recurring cartoon character
-- the scene generator can pull from. Used by both AI Quick Bytes and
-- AI Pulse (and any future module that wants visual character continuity).
--
-- Seeded from api/src/characters/data/seed.ts on boot — the service
-- upserts seed rows (source='seed') but never overwrites manually-edited
-- or auto-generated rows.
--
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS characters (
  slug              VARCHAR(80)  PRIMARY KEY,
  category          VARCHAR(30)  NOT NULL,
  display_name      VARCHAR(200) NOT NULL,
  visual_dna        TEXT         NOT NULL,
  signature_action  TEXT,
  personality       TEXT,
  mood_palette      VARCHAR(200),
  source            VARCHAR(20)  NOT NULL DEFAULT 'auto_generated',
  "createdAt"       TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_characters_category ON characters (category);
CREATE INDEX IF NOT EXISTS idx_characters_source   ON characters (source);
