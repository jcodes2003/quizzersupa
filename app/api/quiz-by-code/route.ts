import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";
import { getStudentSession } from "../../lib/student-auth";

function isSubmissionClosed(quizRow: Record<string, unknown>): string | null {
  const submissionsOpen = (quizRow.submissions_open as boolean | null | undefined) !== false;
  if (!submissionsOpen) return "Quiz submissions are closed by the teacher.";
  const deadlineRaw = quizRow.submission_deadline;
  if (typeof deadlineRaw === "string" && deadlineRaw.trim()) {
    const deadline = new Date(deadlineRaw);
    if (!Number.isNaN(deadline.getTime()) && Date.now() > deadline.getTime()) {
      return "Quiz deadline has passed.";
    }
  }
  return null;
}

async function isSubjectArchived(subjectId: string): Promise<boolean> {
  const supabase = getSupabase();
  const res = await supabase.from("subjecttbl").select("archived").eq("id", subjectId).maybeSingle();
  const msg = (res.error as { message?: string } | null)?.message ?? "";
  if (msg && msg.toLowerCase().includes("archived")) return false;
  return Boolean((res.data as { archived?: boolean } | null)?.archived);
}

async function getSubjectSemester(subjectId: string): Promise<string | null> {
  const supabase = getSupabase();
  const res = await supabase.from("subjecttbl").select("semester").eq("id", subjectId).maybeSingle();
  const msg = (res.error as { message?: string } | null)?.message ?? "";
  if (msg && msg.toLowerCase().includes("semester")) return null;
  const sem = (res.data as { semester?: unknown } | null)?.semester;
  return typeof sem === "string" && sem.trim() ? sem.trim() : null;
}

export async function GET(request: NextRequest) {
  const studentSession = await getStudentSession();
  if (!studentSession) {
    return NextResponse.json({ error: "Please log in as a student to access this quiz." }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get("code")?.trim()?.toUpperCase();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const supabase = getSupabase();

  let quizRow: Record<string, unknown> | null = null;
  let quizError: { message: string } | null = null;

  const full = await supabase
    .from("quiztbl")
    .select("id, quizcode, subjectid, subject_semester, sectionid, time_limit_minutes, allow_retake, max_attempts, source_quiz_id, submission_deadline, submissions_open")
    .eq("quizcode", code)
    .maybeSingle();
  quizRow = (full.data ?? null) as Record<string, unknown> | null;
  quizError = (full.error ?? null) as { message: string } | null;
  if (
    quizError?.message &&
    (quizError.message.toLowerCase().includes("submission_deadline") ||
      quizError.message.toLowerCase().includes("submissions_open") ||
      quizError.message.toLowerCase().includes("subject_semester"))
  ) {
    const fallback = await supabase
      .from("quiztbl")
      .select("id, quizcode, subjectid, sectionid, time_limit_minutes, allow_retake, max_attempts, source_quiz_id")
      .eq("quizcode", code)
      .maybeSingle();
    quizRow = (fallback.data ?? null) as Record<string, unknown> | null;
    quizError = (fallback.error ?? null) as { message: string } | null;
  }

  if (quizError) return NextResponse.json({ error: quizError.message }, { status: 500 });
  if (!quizRow) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  const subjectId = String((quizRow as { subjectid?: unknown }).subjectid ?? "").trim();
  if (subjectId) {
    const archived = await isSubjectArchived(subjectId);
    if (archived) return NextResponse.json({ error: "Subject archived" }, { status: 403 });

    const currentSem = await getSubjectSemester(subjectId);
    if (currentSem) {
      const quizSem = String((quizRow as { subject_semester?: unknown }).subject_semester ?? "").trim() || null;
      if (quizSem && quizSem !== currentSem) {
        return NextResponse.json({ error: "Quiz is from a previous semester" }, { status: 403 });
      }
    }
  }
  const closedReason = isSubmissionClosed(quizRow);
  if (closedReason) return NextResponse.json({ error: closedReason }, { status: 403 });

  const rawMaxAttempts = (quizRow as { max_attempts?: number | null }).max_attempts ?? 1;
  const maxAttempts = Math.max(1, rawMaxAttempts);
  const allowRetake =
    Boolean((quizRow as { allow_retake?: boolean | null }).allow_retake) ||
    maxAttempts > 1;

  // If the student is logged in, block access when they have no attempts remaining.
  const studentId = String(studentSession?.student?.studentId ?? "").trim();
  let attemptsUsed: number | null = null;
  let attemptsRemaining: number | null = null;
  if (studentId) {
    const sourceQuizIdForAttempts =
      (quizRow as { source_quiz_id?: string | null }).source_quiz_id ?? String(quizRow.id ?? "");
    const { data: relatedQuizzes } = await supabase
      .from("quiztbl")
      .select("id")
      .or(`id.eq.${sourceQuizIdForAttempts},source_quiz_id.eq.${sourceQuizIdForAttempts}`);
    const quizIds = (relatedQuizzes ?? [])
      .map((q) => String((q as { id?: string }).id ?? ""))
      .filter(Boolean);

    const countRes = await supabase
      .from("student_attempts_log")
      .select("*", { count: "exact" })
      .in("quizid", quizIds.length > 0 ? quizIds : [String(quizRow.id ?? "")])
      .eq("student_id", studentId)
      .eq("is_submitted", true);

    // If student_attempts_log isn't migrated, don't block here (quiz-start still enforces attempts when possible).
    const countErr = (countRes.error as { message?: string } | null)?.message ?? "";
    if (!countErr || !countErr.toLowerCase().includes("student_attempts_log")) {
      const used = countRes.count ?? 0;
      attemptsUsed = used;
      attemptsRemaining = Math.max(0, maxAttempts - used);
      if (used >= maxAttempts) {
        return NextResponse.json({ error: "No attempts remaining" }, { status: 403 });
      }
    }
  }

  const { data: sectionRow } = await supabase
    .from("sections")
    .select("*")
    .eq("id", quizRow.sectionid)
    .maybeSingle();
  const sectionName = sectionRow
    ? String((sectionRow as Record<string, unknown>).sectionname ?? (sectionRow as Record<string, unknown>).name ?? "")
    : "";

  const sourceQuizId = (quizRow as { source_quiz_id?: string | null }).source_quiz_id ?? quizRow.id;
  const { data: questions, error: qError } = await supabase
    .from("questiontbl")
    .select("*")
    .eq("quizid", sourceQuizId)
    .order("id");

  if (qError) return NextResponse.json({ error: qError.message }, { status: 500 });

  // maxAttempts / allowRetake computed above (and used for attempts gating)

  return NextResponse.json({
    quiz: {
      id: quizRow.id,
      quizcode: quizRow.quizcode,
      subjectid: quizRow.subjectid,
      sectionid: quizRow.sectionid,
      time_limit_minutes: (quizRow as { time_limit_minutes?: number | null }).time_limit_minutes ?? null,
      allow_retake: allowRetake,
      max_attempts: maxAttempts,
      attemptsUsed,
      attemptsRemaining,
      source_quiz_id: (quizRow as { source_quiz_id?: string | null }).source_quiz_id ?? null,
      submission_deadline: (quizRow as { submission_deadline?: string | null }).submission_deadline ?? null,
      submissions_open: (quizRow as { submissions_open?: boolean | null }).submissions_open !== false,
      sectionName,
    },
    questions: questions ?? [],
  });
}
