-- GyanGo site + feedback: full schema (idempotent).
-- Apply manually with psql, or let the Node app run this on boot from sql/.

CREATE TABLE IF NOT EXISTS feedback (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  name text,
  email text,
  message text NOT NULL,
  source text NOT NULL DEFAULT 'contact_page',
  user_agent text,
  ip text,
  archived boolean NOT NULL DEFAULT false,
  admin_notes text
);

CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_archived_created_idx ON feedback (archived, created_at DESC);

-- Safe upgrades when table already existed without newer columns:
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS admin_notes text;
