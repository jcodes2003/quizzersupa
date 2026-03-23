create table if not exists student_attempt_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  attempt_log_id uuid not null references student_attempts_log(id) on delete cascade,
  quizid uuid not null references quiztbl(id) on delete cascade,
  teacherid uuid not null references teachertbl(id) on delete cascade,
  student_db_id uuid,
  student_id text,
  studentname text,
  subjectid uuid null references subjecttbl(id) on delete set null,
  sectionid uuid null references sections(id) on delete set null,
  submission_source text,
  status text not null default 'pending',
  reviewed_by uuid null references teachertbl(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_attempt_recovery_teacher on student_attempt_recovery_requests(teacherid, status, created_at desc);
create index if not exists idx_attempt_recovery_attempt on student_attempt_recovery_requests(attempt_log_id, created_at desc);
