-- Run in Supabase SQL Editor. Adds period and quiz name to quiztbl for teacher-created quizzes.
ALTER TABLE quiztbl ADD COLUMN IF NOT EXISTS period text DEFAULT '';
ALTER TABLE quiztbl ADD COLUMN IF NOT EXISTS quizname text DEFAULT '';
