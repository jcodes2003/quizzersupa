import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      quizId?: string;
      studentName?: string;
      studentId?: string;
    };

    const quizId = body.quizId?.trim();
    const studentName = body.studentName?.trim();
    const studentId = body.studentId?.trim();

    if (!quizId || !studentName || !studentId) {
      return NextResponse.json({ error: "quizId, studentName, and studentId required" }, { status: 400 });
    }

    const supabase = getSupabase();

  let { data: quizSettings, error: quizError } = await supabase
    .from("quiztbl")
    .select("time_limit_minutes, allow_retake, max_attempts")
    .eq("id", quizId)
    .maybeSingle();
  if (
    quizError?.message &&
    (quizError.message.toLowerCase().includes("time_limit") ||
      quizError.message.toLowerCase().includes("allow_retake") ||
      quizError.message.toLowerCase().includes("max_attempts"))
  ) {
    const fallback = await supabase
      .from("quiztbl")
      .select("id")
      .eq("id", quizId)
      .maybeSingle();
    quizSettings = fallback.data as typeof quizSettings;
    quizError = fallback.error as typeof quizError;
  }

    if (quizError) {
      return NextResponse.json({ ok: true, attemptId: null, attemptNumber: 1, expiresAt: null, maxAttempts: 2, allowRetake: false });
    }
    if (!quizSettings) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  const allowRetake = Boolean((quizSettings as { allow_retake?: boolean | null }).allow_retake);
  const maxAttempts = allowRetake
    ? (quizSettings as { max_attempts?: number | null }).max_attempts ?? 2
    : 1;

  let { data: existingOpen, error: existingOpenError } = await supabase
    .from("student_attempts_log")
    .select("id, attempt_number, started_at")
    .eq("quizid", quizId)
    .eq("student_id", studentId)
    .eq("is_submitted", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingOpenError?.message && existingOpenError.message.toLowerCase().includes("student_attempts_log")) {
    existingOpen = null;
  }

  if (existingOpen) {
    const expiresAt = (quizSettings as { time_limit_minutes?: number | null }).time_limit_minutes
      ? new Date(new Date(existingOpen.started_at).getTime() + ((quizSettings as { time_limit_minutes?: number }).time_limit_minutes ?? 0) * 60 * 1000).toISOString()
      : null;
    return NextResponse.json({
      attemptId: existingOpen.id,
      attemptNumber: existingOpen.attempt_number,
      expiresAt,
      maxAttempts,
      allowRetake,
    });
  }

  let count: number | null = null;
  const countResult = await supabase
    .from("student_attempts_log")
    .select("*", { count: "exact" })
    .eq("quizid", quizId)
    .eq("student_id", studentId)
    .eq("is_submitted", true);
  if (countResult.error?.message && countResult.error.message.toLowerCase().includes("student_attempts_log")) {
    const fallbackCount = await supabase
      .from("student_attempts")
      .select("*", { count: "exact" })
      .eq("quizid", quizId)
      .eq("student_id", studentId);
    count = fallbackCount.count ?? 0;
  } else {
    count = countResult.count ?? 0;
  }

  const attemptCount = count ?? 0;
    if (attemptCount >= maxAttempts) {
      return NextResponse.json({ error: "No attempts remaining" }, { status: 403 });
    }

  const attemptNumber = attemptCount + 1;
  type AttemptRow = { id: string; attempt_number: number; started_at: string };
  let attemptRow: AttemptRow | null = null;
  const attemptResult = await supabase
    .from("student_attempts_log")
    .insert({
      quizid: quizId,
      studentname: studentName,
      student_id: studentId,
      attempt_number: attemptNumber,
      started_at: new Date().toISOString(),
      is_submitted: false,
    })
    .select("id, attempt_number, started_at")
    .single();

    if (attemptResult.error?.message && attemptResult.error.message.toLowerCase().includes("student_attempts_log")) {
      attemptRow = {
        id: "",
        attempt_number: attemptNumber,
        started_at: new Date().toISOString(),
      };
    } else if (attemptResult.error) {
      return NextResponse.json({ ok: true, attemptId: null, attemptNumber, expiresAt: null, maxAttempts, allowRetake });
  } else {
    attemptRow = attemptResult.data as AttemptRow;
  }

  const expiresAt = attemptRow && (quizSettings as { time_limit_minutes?: number | null }).time_limit_minutes
    ? new Date(new Date(attemptRow.started_at).getTime() + ((quizSettings as { time_limit_minutes?: number }).time_limit_minutes ?? 0) * 60 * 1000).toISOString()
    : null;

  return NextResponse.json({
    attemptId: attemptRow?.id || null,
    attemptNumber: attemptRow?.attempt_number ?? attemptNumber,
    expiresAt,
    maxAttempts,
    allowRetake,
  });
  } catch {
    return NextResponse.json({ ok: true, attemptId: null, attemptNumber: 1, expiresAt: null, maxAttempts: 2, allowRetake: false });
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: true, message: "Use POST to start a quiz attempt." },
    { status: 200 }
  );
}
