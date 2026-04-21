-- Achievements: persist only *earned* rows. Definitions (id, name, threshold)
-- live in code so we can change copy/icons without a migration.
-- earned_at powers notification queues ("You just earned Deep Listener!") and
-- the "NEW" badge in the dashboard UI (earned_at within last 24h).

CREATE TABLE IF NOT EXISTS user_achievements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id  TEXT NOT NULL,
  earned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_achievements_unique UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS user_achievements_user_idx
  ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS user_achievements_earned_at_idx
  ON user_achievements(earned_at DESC);
