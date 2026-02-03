-- Run in Supabase SQL Editor. Adds quiztbl and questiontbl for teacher-created quizzes and questions.
-- Requires: teachertbl(id), subjecttbl(id), sections(id).

-- Quiz: belongs to teacher, subject, section; has a code; score and studentname store latest submission
CREATE TABLE IF NOT EXISTS quiztbl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacherid uuid NOT NULL REFERENCES teachertbl(id) ON DELETE CASCADE,
  subjectid uuid NOT NULL REFERENCES subjecttbl(id) ON DELETE CASCADE,
  quizcode text NOT NULL,
  sectionid uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  score numeric,
  studentname text,
  period text DEFAULT '',
  quizname text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
-- If quiztbl already exists, add columns (run separately if needed):
-- ALTER TABLE quiztbl ADD COLUMN IF NOT EXISTS score numeric;
-- ALTER TABLE quiztbl ADD COLUMN IF NOT EXISTS studentname text;
-- ALTER TABLE quiztbl ADD COLUMN IF NOT EXISTS period text DEFAULT '';
-- ALTER TABLE quiztbl ADD COLUMN IF NOT EXISTS quizname text DEFAULT '';

-- Question: belongs to a quiz; has question text, type, and for multiple_choice: options (JSON array) and answerkey
CREATE TABLE IF NOT EXISTS questiontbl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quizid uuid NOT NULL REFERENCES quiztbl(id) ON DELETE CASCADE,
  question text NOT NULL,
  quiztype text NOT NULL,
  answerkey text,
  options text,
  created_at timestamptz DEFAULT now()
);
-- If table already exists, add columns (run separately if needed):
-- ALTER TABLE questiontbl ADD COLUMN IF NOT EXISTS answerkey text;
-- ALTER TABLE questiontbl ADD COLUMN IF NOT EXISTS options text;

CREATE INDEX IF NOT EXISTS idx_quiztbl_teacher ON quiztbl(teacherid);
CREATE INDEX IF NOT EXISTS idx_questiontbl_quiz ON questiontbl(quizid);

-- Link student_quiz responses to a quiz (for teacher filtering). Run if student_quiz exists:
-- ALTER TABLE student_quiz ADD COLUMN IF NOT EXISTS quizid uuid REFERENCES quiztbl(id) ON DELETE SET NULL;
-- CREATE INDEX IF NOT EXISTS idx_student_quiz_quizid ON student_quiz(quizid);
