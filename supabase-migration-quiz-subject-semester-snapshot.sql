-- Run in Supabase SQL Editor
-- Store a snapshot of the subject's semester/year on each quiz so when the subject semester changes,
-- previous-semester quizzes can be hidden for students (fresh start).

ALTER TABLE quiztbl
  ADD COLUMN IF NOT EXISTS subject_semester text;

ALTER TABLE quiztbl
  ADD COLUMN IF NOT EXISTS subject_year_level int;

CREATE INDEX IF NOT EXISTS idx_quiztbl_subject_semester ON quiztbl(subjectid, subject_semester);

UPDATE quiztbl q
SET
  subject_semester = COALESCE(q.subject_semester, s.semester),
  subject_year_level = COALESCE(q.subject_year_level, s.year_level)
FROM subjecttbl s
WHERE q.subjectid = s.id
  AND (q.subject_semester IS NULL OR q.subject_year_level IS NULL);

