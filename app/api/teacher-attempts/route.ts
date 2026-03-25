import { noStoreJson } from "../../lib/no-store";
import { getTeacherId } from "../../lib/teacher-db-auth";
import { getSupabase } from "../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AssessmentType = "quiz" | "exam";
type QuizSummaryRow = { id: string; period?: string | null; quizname?: string | null; assessment_type?: string | null };
type AttemptRow = {
  id?: string | number | null;
  quizid: string;
  studentname?: string | null;
  student_id?: string | null;
  score?: number | null;
  max_score?: number | null;
  attempt_number?: number | null;
  submitted_at?: string | null;
  created_at?: string | null;
  subjectid?: string | number | null;
  sectionid?: string | number | null;
  answers?: Record<string, unknown> | null;
  submission_source?: string | null;
};
type SectionLookupRow = { id: string | number; sectionname?: string | null };
type SubjectLookupRow = { id: string | number; subjectname?: string | null };

function normalizeAssessmentType(value: unknown): AssessmentType {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "exam" || raw === "examination" ? "exam" : "quiz";
}

export async function GET() {
  const teacherId = await getTeacherId();
  if (!teacherId) return noStoreJson({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();

  // Get all quizzes created by this teacher
  let quizzes: QuizSummaryRow[] | null = null;
  let quizError: { message: string } | null = null;

  const fullQuizzes = await supabase
    .from("quiztbl")
    .select("id, period, quizname, assessment_type")
    .eq("teacherid", teacherId);
  quizzes = (fullQuizzes.data ?? null) as QuizSummaryRow[] | null;
  quizError = (fullQuizzes.error ?? null) as { message: string } | null;

  // Backward compatibility if assessment_type column hasn't been added yet.
  if (quizError?.message?.toLowerCase().includes("assessment_type")) {
    const fallbackQuizzes = await supabase
      .from("quiztbl")
      .select("id, period, quizname")
      .eq("teacherid", teacherId);
    quizzes = (fallbackQuizzes.data ?? null) as QuizSummaryRow[] | null;
    quizError = (fallbackQuizzes.error ?? null) as { message: string } | null;
  }

  if (quizError) return noStoreJson({ error: quizError.message }, { status: 500 });

  const quizRows: QuizSummaryRow[] = quizzes ?? [];
  const quizIds = quizRows.map((q) => q.id);
  if (quizIds.length === 0) {
    return noStoreJson({ rows: [] });
  }

  const quizPeriodNameMap = new Map(
    quizRows.map((q) => [
      q.id,
      {
        period: q.period ?? "",
        quizname: q.quizname ?? "",
        assessmentType: normalizeAssessmentType(q.assessment_type),
      },
    ])
  );

  // Get all student attempts (log) for these quizzes with sectionid and subjectid
  let attempts: AttemptRow[] | null = null;
  let attemptsError: { message?: string } | null = null;
  const logResult = await supabase
    .from("student_attempts_log")
    .select("id, quizid, studentname, student_id, score, max_score, attempt_number, submitted_at, created_at, subjectid, sectionid, answers, submission_source")
    .in("quizid", quizIds)
    .eq("is_submitted", true)
    .order("submitted_at", { ascending: false });
  attempts = (logResult.data ?? null) as AttemptRow[] | null;
  attemptsError = (logResult.error ?? null) as { message?: string } | null;

  // Retry with minimal columns if some columns don't exist yet
  if (
    attemptsError?.message &&
    (attemptsError.message.toLowerCase().includes("answers") ||
      attemptsError.message.toLowerCase().includes("submitted_at") ||
      attemptsError.message.toLowerCase().includes("subjectid") ||
      attemptsError.message.toLowerCase().includes("sectionid") ||
      attemptsError.message.toLowerCase().includes("submission_source"))
  ) {
    const minimal = await supabase
      .from("student_attempts_log")
      .select("id, quizid, studentname, student_id, score, max_score, attempt_number, created_at")
      .in("quizid", quizIds)
      .eq("is_submitted", true)
      .order("created_at", { ascending: false });
    attempts = (minimal.data ?? null) as AttemptRow[] | null;
    attemptsError = (minimal.error ?? null) as { message?: string } | null;
  }

  // Fallback if the log table doesn't exist yet
  if (attemptsError?.message && attemptsError.message.toLowerCase().includes("student_attempts_log")) {
    const fallback = await supabase
      .from("student_attempts")
      .select("id, quizid, studentname, student_id, score, max_score, attempt_number, created_at")
      .in("quizid", quizIds)
      .order("created_at", { ascending: false });
    attempts = (fallback.data ?? null) as AttemptRow[] | null;
    attemptsError = (fallback.error ?? null) as { message?: string } | null;
  }

  if (attemptsError) return noStoreJson({ error: attemptsError.message }, { status: 500 });

  // Get quiz metadata for quiz codes and backup subject/section data
  const { data: quizMetadata } = await supabase
    .from("quiztbl")
    .select("id, quizcode, subjectid, sectionid, source_quiz_id")
    .in("id", quizIds);

  const quizMap = new Map(quizMetadata?.map((q) => [q.id, q]) ?? []);

  // Get sections and subjects for display (using correct DB column names)
  const { data: sections } = await supabase.from("sections").select("id, sectionname");
  const { data: subjects } = await supabase.from("subjecttbl").select("id, subjectname");

  // Normalize map keys to strings so they match client-side IDs
  const sectionMap = new Map(
    ((sections ?? []) as SectionLookupRow[]).map((s) => [String(s.id), String(s.sectionname ?? "")])
  );
  const subjectMap = new Map(
    ((subjects ?? []) as SubjectLookupRow[]).map((s) => [String(s.id), String(s.subjectname ?? "")])
  );

  // Transform attempts to match expected format, including joined names
  const rows = (attempts ?? []).map((a) => {
    const quiz = quizMap.get(a.quizid);
    // Prefer attempt-level values so manual response edits remain visible in the teacher view.
    // Fallback to current quiz metadata when the attempt record does not carry these fields.
    const rawSubjectId = a.subjectid ?? quiz?.subjectid ?? null;
    const rawSectionId = a.sectionid ?? quiz?.sectionid ?? null;

    const subjectid = rawSubjectId != null ? String(rawSubjectId) : "";
    const sectionid = rawSectionId != null ? String(rawSectionId) : "";

    const sectionname = sectionid ? sectionMap.get(sectionid) ?? "" : "";
    const subjectname = subjectid ? subjectMap.get(subjectid) ?? "" : "";

    const periodName = quizPeriodNameMap.get(a.quizid);
    // Use the database primary key as the unique ID, fallback to composite key if id is missing
    const uniqueId = a.id ? String(a.id) : `${a.quizid}-${a.student_id}-${a.attempt_number}-${a.created_at || Date.now()}`;
    
    return {
      id: uniqueId,
      quizid: a.quizid,
      source_quiz_id: quiz?.source_quiz_id ?? null,
      quizcode: quiz?.quizcode ?? "",
      period: periodName?.period ?? "",
      quizname: periodName?.quizname ?? "",
      assessment_type: periodName?.assessmentType ?? "quiz",
      studentname: a.studentname,
      student_id: a.student_id,
      score: a.score,
      max_score: a.max_score,
      attempt_number: a.attempt_number,
      // Human-readable names from joined tables
      section: sectionname,
      subject: subjectname,
      created_at: a.submitted_at ?? a.created_at,
      answers: a.answers ?? null,
      submission_source: a.submission_source ?? "manual_submit",
      subjectid,
      sectionid,
      sectionname,
      subjectname,
    };
  });

  return noStoreJson({ rows });
}
