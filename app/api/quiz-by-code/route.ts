import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";

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

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim()?.toUpperCase();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const supabase = getSupabase();

  let quizRow: Record<string, unknown> | null = null;
  let quizError: { message: string } | null = null;

  const full = await supabase
    .from("quiztbl")
    .select("id, quizcode, subjectid, sectionid, time_limit_minutes, allow_retake, max_attempts, source_quiz_id, submission_deadline, submissions_open")
    .eq("quizcode", code)
    .maybeSingle();
  quizRow = (full.data ?? null) as Record<string, unknown> | null;
  quizError = (full.error ?? null) as { message: string } | null;
  if (
    quizError?.message &&
    (quizError.message.toLowerCase().includes("submission_deadline") ||
      quizError.message.toLowerCase().includes("submissions_open"))
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
  const closedReason = isSubmissionClosed(quizRow);
  if (closedReason) return NextResponse.json({ error: closedReason }, { status: 403 });

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

  const rawMaxAttempts = (quizRow as { max_attempts?: number | null }).max_attempts ?? 1;
  const maxAttempts = Math.max(1, rawMaxAttempts);
  const allowRetake =
    Boolean((quizRow as { allow_retake?: boolean | null }).allow_retake) ||
    maxAttempts > 1;

  return NextResponse.json({
    quiz: {
      id: quizRow.id,
      quizcode: quizRow.quizcode,
      subjectid: quizRow.subjectid,
      sectionid: quizRow.sectionid,
      time_limit_minutes: (quizRow as { time_limit_minutes?: number | null }).time_limit_minutes ?? null,
      allow_retake: allowRetake,
      max_attempts: maxAttempts,
      source_quiz_id: (quizRow as { source_quiz_id?: string | null }).source_quiz_id ?? null,
      submission_deadline: (quizRow as { submission_deadline?: string | null }).submission_deadline ?? null,
      submissions_open: (quizRow as { submissions_open?: boolean | null }).submissions_open !== false,
      sectionName,
    },
    questions: questions ?? [],
  });
}
