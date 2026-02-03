-- Run this in Supabase SQL Editor to create tables for admin/teacher and dynamic quiz.

-- Sections (e.g. 01-P, 02-P)
CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Subjects (e.g. HCI, CP2, Living in IT Era)
CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Teachers (created by admin; login to create questions)
CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Questions (created by teachers; types: multiple_choice, identification, enumeration, long_answer)
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('multiple_choice', 'identification', 'enumeration', 'long_answer')),
  question_text text NOT NULL,
  correct_answer text,
  options jsonb,
  enum_items jsonb,
  order_index int DEFAULT 0,
  created_by uuid REFERENCES teachers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Long answer responses (linked to student_quiz attempt)
CREATE TABLE IF NOT EXISTS student_long_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_quiz_id uuid NOT NULL REFERENCES student_quiz(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(subject_id, type);
CREATE INDEX IF NOT EXISTS idx_student_long_answers_quiz ON student_long_answers(student_quiz_id);

-- RLS: enable if you use Row Level Security (optional)
-- ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE student_long_answers ENABLE ROW LEVEL SECURITY;
-- Then add policies to allow anon/service role to read sections, subjects, questions; and to insert/update with service role or your auth.
