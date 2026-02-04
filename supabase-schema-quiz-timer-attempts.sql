-- Run in Supabase SQL Editor to add quiz timer + attempts settings
-- and to log per-student attempts with answers.

-- Quiz settings
ALTER TABLE quiztbl
  ADD COLUMN IF NOT EXISTS time_limit_minutes integer,
  ADD COLUMN IF NOT EXISTS allow_retake boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_attempts integer DEFAULT 2;

-- Log every attempt (one row per attempt)
CREATE TABLE IF NOT EXISTS student_attempts_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quizid uuid NOT NULL REFERENCES quiztbl(id) ON DELETE CASCADE,
  studentname text NOT NULL,
  student_id text NOT NULL,
  attempt_number integer NOT NULL,
  score numeric,
  max_score integer,
  answers jsonb,
  started_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  is_submitted boolean DEFAULT false,
  subjectid uuid,
  sectionid uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempts_log_quiz ON student_attempts_log(quizid);
CREATE INDEX IF NOT EXISTS idx_attempts_log_student ON student_attempts_log(quizid, student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_log_created ON student_attempts_log(created_at);
