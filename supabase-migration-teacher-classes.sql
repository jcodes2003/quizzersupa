-- Run in Supabase SQL Editor.
-- Lets teachers create their own classes inside the existing `sections` table.

ALTER TABLE sections
ADD COLUMN IF NOT EXISTS teacherid uuid REFERENCES teachertbl(id) ON DELETE SET NULL;

ALTER TABLE sections
ADD COLUMN IF NOT EXISTS section_code text;

CREATE INDEX IF NOT EXISTS idx_sections_teacherid ON sections(teacherid);
CREATE INDEX IF NOT EXISTS idx_sections_section_code ON sections(section_code);

-- Optional:
-- If your existing data already has unique class codes, you can enforce uniqueness later with:
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_sections_section_code ON sections(upper(section_code));
