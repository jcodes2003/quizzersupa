-- Run in Supabase SQL Editor to create student attempts tracking table
-- Tracks individual student submissions for each quiz

CREATE TABLE IF NOT EXISTS student_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quizid uuid NOT NULL REFERENCES quiztbl(id) ON DELETE CASCADE,
  studentname text NOT NULL,
  student_id text,
  score numeric NOT NULL,
  attempt_number integer NOT NULL,
  max_score integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_student_attempts_quiz ON student_attempts(quizid);
CREATE INDEX IF NOT EXISTS idx_student_attempts_student ON student_attempts(quizid, studentname);
CREATE INDEX IF NOT EXISTS idx_student_attempts_student_id ON student_attempts(quizid, student_id);
CREATE INDEX IF NOT EXISTS idx_student_attempts_created ON student_attempts(created_at);

-- If table already exists, add student_id column (run separately if needed):
-- ALTER TABLE student_attempts ADD COLUMN IF NOT EXISTS student_id text;
