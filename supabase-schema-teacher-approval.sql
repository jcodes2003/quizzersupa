-- Run in Supabase SQL Editor to add approval workflow for teachers.

ALTER TABLE teachertbl
  ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false;

-- Optional: if you want to track when the admin approved an account
-- ALTER TABLE teachertbl ADD COLUMN IF NOT EXISTS approved_at timestamptz;
