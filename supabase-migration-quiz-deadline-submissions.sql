-- Run in Supabase SQL Editor to add submission availability controls per quiz.

ALTER TABLE quiztbl
  ADD COLUMN IF NOT EXISTS submission_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS submissions_open boolean DEFAULT true;

UPDATE quiztbl
SET submissions_open = true
WHERE submissions_open IS NULL;
