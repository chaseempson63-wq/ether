-- Interview Mode Phase 2: persist every L2/L3 Venice generation for auditing.
-- Forensic debugging (as we had to do post-L2-launch) is no longer acceptable.

CREATE TABLE IF NOT EXISTS interview_generation_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level           INTEGER NOT NULL,
  prompt          TEXT NOT NULL,
  response        TEXT,
  valid_count     INTEGER NOT NULL DEFAULT 0,
  rejected_count  INTEGER NOT NULL DEFAULT 0,
  rejection_notes JSONB,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interview_generation_logs_user_level_idx
  ON interview_generation_logs(user_id, level);
CREATE INDEX IF NOT EXISTS interview_generation_logs_created_at_idx
  ON interview_generation_logs(created_at DESC);
