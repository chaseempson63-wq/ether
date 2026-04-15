-- Interview Mode: progressive leveling system (3 levels)

CREATE TYPE interview_level_status AS ENUM ('locked', 'in_progress', 'completed');

CREATE TABLE interview_levels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level       INTEGER NOT NULL,
  status      interview_level_status NOT NULL DEFAULT 'locked',
  started_at  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, level)
);

CREATE INDEX interview_levels_user_id_idx ON interview_levels(user_id);

CREATE TABLE interview_questions_v2 (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level       INTEGER NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT,
  layer       halliday_layer NOT NULL,
  order_index INTEGER NOT NULL,
  answered_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX interview_questions_v2_user_level_idx ON interview_questions_v2(user_id, level);
