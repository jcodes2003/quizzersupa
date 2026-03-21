-- Student ↔ Section membership (persists joined section(s) across logout/login)
-- Run this in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS student_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Prevent duplicates: one student can join a section only once
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_sections_student_section
  ON student_sections(student_id, section_id);

CREATE INDEX IF NOT EXISTS idx_student_sections_student ON student_sections(student_id);
CREATE INDEX IF NOT EXISTS idx_student_sections_section ON student_sections(section_id);

