-- Track how an attempt was submitted.
ALTER TABLE student_attempts_log
ADD COLUMN IF NOT EXISTS submission_source text;

-- Optional: normalize existing rows to manual submit.
UPDATE student_attempts_log
SET submission_source = 'manual_submit'
WHERE submission_source IS NULL;
