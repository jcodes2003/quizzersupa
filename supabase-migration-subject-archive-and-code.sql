-- Run in Supabase SQL Editor
-- Adds subject lifecycle controls + a subject-level code.

ALTER TABLE subjecttbl
  ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

ALTER TABLE subjecttbl
  ADD COLUMN IF NOT EXISTS year_level int;

ALTER TABLE subjecttbl
  ADD COLUMN IF NOT EXISTS semester text;

ALTER TABLE subjecttbl
  ADD COLUMN IF NOT EXISTS subject_code text;

CREATE INDEX IF NOT EXISTS idx_subjecttbl_archived ON subjecttbl(archived);
CREATE INDEX IF NOT EXISTS idx_subjecttbl_year_sem ON subjecttbl(year_level, semester);
