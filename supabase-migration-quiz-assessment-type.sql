-- Run in Supabase SQL Editor.
-- Adds assessment_type so quizzes can be categorized as quiz or exam.

ALTER TABLE quiztbl
ADD COLUMN IF NOT EXISTS assessment_type text NOT NULL DEFAULT 'quiz';

-- Normalize existing values (if any custom values were previously inserted).
UPDATE quiztbl
SET assessment_type = CASE
  WHEN lower(trim(assessment_type)) IN ('exam', 'examination') THEN 'exam'
  ELSE 'quiz'
END;

-- Optional hardening: keep only allowed values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quiztbl_assessment_type_check'
  ) THEN
    ALTER TABLE quiztbl
    ADD CONSTRAINT quiztbl_assessment_type_check
    CHECK (assessment_type IN ('quiz', 'exam'));
  END IF;
END $$;
