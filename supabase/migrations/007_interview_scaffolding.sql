-- Interview Mode Phase 1: per-question scaffolding (helper probe + 3 example answers)
-- L1 questions are static and seeded from LEVEL_1_SEED in server/routers/interviewMode.ts.
-- L2/L3 questions are Venice-generated and will have NULL for these fields.

ALTER TABLE interview_questions_v2
  ADD COLUMN IF NOT EXISTS helper_text TEXT,
  ADD COLUMN IF NOT EXISTS example_answers JSONB;

-- Backfill for existing users is performed out-of-band by a Node script that
-- matches question text against the seed constant and UPDATEs rows in place.
-- See scripts/backfill-interview-scaffolding.mjs (run once post-deploy).
