import { NextRequest, NextResponse } from "next/server";
import { sameStudentId, sanitizeStudentId } from "../../lib/student-id";
import { getSupabase } from "../../lib/supabase-server";
import { getStudentSession } from "../../lib/student-auth";

function normalizeStudentNameKey(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSubmissionCloseReason(quizSettings: Record<string, unknown>): string | null {
  const submissionsOpen = (quizSettings.submissions_open as boolean | null | undefined) !== false;
  if (!submissionsOpen) return "Quiz submissions are closed by the teacher.";
  const deadlineRaw = quizSettings.submission_deadline;
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

export async function POST(request: NextRequest) {
  try {
    const studentSession = await getStudentSession();
    if (!studentSession) {
      return NextResponse.json({ error: "Please log in as a student to start this quiz." }, { status: 401 });
    }

    const body = await request.json() as {
      quizId?: string | number;
      studentName?: string;
      studentId?: string;
    };

    const quizId = body.quizId !== undefined && body.quizId !== null ? String(body.quizId).trim() : "";
    const studentName = body.studentName?.trim() ?? "";
    const studentId = sanitizeStudentId(body.studentId?.trim() ?? "");
    const studentNameKey = normalizeStudentNameKey(studentName);

    if (!quizId || !studentName || !studentId) {
      return NextResponse.json({ error: "quizId, studentName, and studentId required" }, { status: 400 });
    }

    const supabase = getSupabase();

  let { data: quizSettings, error: quizError } = await supabase
    .from("quiztbl")
    .select("subjectid, subject_semester, time_limit_minutes, allow_retake, max_attempts, source_quiz_id, submission_deadline, submissions_open")
    .eq("id", quizId)
    .maybeSingle();
  if (
    quizError?.message &&
    (quizError.message.toLowerCase().includes("time_limit") ||
      quizError.message.toLowerCase().includes("allow_retake") ||
      quizError.message.toLowerCase().includes("max_attempts") ||
      quizError.message.toLowerCase().includes("submission_deadline") ||
      quizError.message.toLowerCase().includes("submissions_open"))
  ) {
    const fallback = await supabase
      .from("quiztbl")
      .select("id, source_quiz_id")
      .eq("id", quizId)
      .maybeSingle();
    quizSettings = fallback.data as typeof quizSettings;
    quizError = fallback.error as typeof quizError;
  }

    if (quizError) {
      return NextResponse.json({ ok: true, attemptId: null, attemptNumber: 1, expiresAt: null, maxAttempts: 1, allowRetake: false });
    }
    if (!quizSettings) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

    const subjectId = String((quizSettings as { subjectid?: unknown }).subjectid ?? "").trim();
    if (subjectId) {
      const archived = await isSubjectArchived(subjectId);
      if (archived) return NextResponse.json({ error: "Subject archived" }, { status: 403 });

      const currentSem = await getSubjectSemester(subjectId);
      if (currentSem) {
        const quizSem = String((quizSettings as { subject_semester?: unknown }).subject_semester ?? "").trim() || null;
        if (quizSem && quizSem !== currentSem) {
          return NextResponse.json({ error: "Quiz is from a previous semester" }, { status: 403 });
        }
      }
    }
    const closeReason = getSubmissionCloseReason(quizSettings as Record<string, unknown>);
    if (closeReason) return NextResponse.json({ error: closeReason }, { status: 403 });

  const rawMaxAttempts = (quizSettings as { max_attempts?: number | null }).max_attempts ?? 1;
  let maxAttempts = Math.max(1, rawMaxAttempts);
  const baseAllowRetake =
    Boolean((quizSettings as { allow_retake?: boolean | null }).allow_retake) ||
    maxAttempts > 1;
  console.log("[quiz-start] settings", {
    quizId,
    rawMaxAttempts,
    maxAttempts,
    allowRetake: baseAllowRetake,
    allowRetakeDb: (quizSettings as { allow_retake?: boolean | null }).allow_retake,
  });

  if (maxAttempts === 1) {
    const { data: maxRow } = await supabase
      .from("quiztbl")
      .select("max_attempts")
      .eq("id", quizId)
      .maybeSingle();
    const fallbackMax = Number((maxRow as { max_attempts?: number | null })?.max_attempts);
    console.log("[quiz-start] fallback max_attempts", { quizId, fallbackMax, maxRow });
    if (Number.isFinite(fallbackMax) && fallbackMax > 1) {
      maxAttempts = fallbackMax;
    }
  }

	  const sourceQuizId = (quizSettings as { source_quiz_id?: string | null }).source_quiz_id ?? quizId;
	  const { data: relatedQuizzes } = await supabase
	    .from("quiztbl")
	    .select("id")
	    .or(`id.eq.${sourceQuizId},source_quiz_id.eq.${sourceQuizId}`);
	  const quizIds = (relatedQuizzes ?? []).map((q) => (q as { id: string }).id);

    // Prevent retake/duplicate attempts by changing student ID while keeping the same name.
    // If this name has already been used with a different ID for this quiz (or related clones),
    // reject the attempt start.
    if (studentNameKey) {
      const idsToCheck = quizIds.length > 0 ? quizIds : [quizId];
      let { data: nameRows, error: nameErr } = await supabase
        .from("student_attempts_log")
        .select("studentname, student_id, quizid")
        .in("quizid", idsToCheck)
        .limit(5000);
      if (nameErr?.message && nameErr.message.toLowerCase().includes("student_attempts_log")) {
        const fallback = await supabase
          .from("student_attempts")
          .select("studentname, student_id, quizid")
          .in("quizid", idsToCheck)
          .limit(5000);
        nameRows = fallback.data as typeof nameRows;
        nameErr = fallback.error as typeof nameErr;
      }
      if (nameErr) {
        return NextResponse.json({ error: nameErr.message }, { status: 500 });
      }
      const conflict = (nameRows ?? []).some((r) => {
        const n = normalizeStudentNameKey(String((r as { studentname?: string }).studentname ?? ""));
        if (!n || n !== studentNameKey) return false;
        const existingId = sanitizeStudentId(String((r as { student_id?: string }).student_id ?? ""));
        return existingId && existingId !== studentId;
      });
      if (conflict) {
        return NextResponse.json(
          { error: "This student name is already registered for this quiz with a different Student ID. Please use your original Student ID." },
          { status: 403 }
        );
      }
    }

	  const existingOpenRes = await supabase
	    .from("student_attempts_log")
	    .select("id, attempt_number, started_at, quizid, student_id")
	    .in("quizid", quizIds.length > 0 ? quizIds : [quizId])
	    .eq("is_submitted", false)
	    .order("created_at", { ascending: false })
	    .limit(200);

	  let existingOpen = (((existingOpenRes.data ?? []) as Array<
	    { id?: string; attempt_number?: number; started_at?: string; quizid?: string | null; student_id?: string | null }
	  >).find((row) => sameStudentId(row.student_id, studentId)) ?? null);
	  const existingOpenError = existingOpenRes.error as { message?: string } | null;

  if (existingOpenError?.message && existingOpenError.message.toLowerCase().includes("student_attempts_log")) {
    existingOpen = null;
  }

  if (existingOpen) {
    const countResult = await supabase
      .from("student_attempts_log")
      .select("student_id, submission_source")
      .in("quizid", quizIds.length > 0 ? quizIds : [quizId])
      .eq("is_submitted", true);
    const countErr = (countResult.error as { message?: string } | null)?.message ?? "";
    const matchingRows =
      countErr && countErr.toLowerCase().includes("student_attempts_log")
        ? []
        : (((countResult.data ?? []) as Array<{ student_id?: string | null; submission_source?: string | null }>).filter(
            (row) => sameStudentId(row.student_id, studentId)
          ));
    const attemptsUsed =
      countErr && countErr.toLowerCase().includes("student_attempts_log")
        ? null
        : matchingRows.length;
    const hasManualSubmit =
      countErr && countErr.toLowerCase().includes("student_attempts_log")
        ? false
        : matchingRows.some(
            (row) => String(row.submission_source ?? "").trim() === "manual_submit"
          );
    const attemptsRemaining =
      typeof attemptsUsed === "number" ? Math.max(0, maxAttempts - attemptsUsed) : null;
    const allowRetake = hasManualSubmit ? false : baseAllowRetake;

    let timeLimitMinutes = (quizSettings as { time_limit_minutes?: number | null }).time_limit_minutes ?? null;
    if (!timeLimitMinutes && existingOpen.quizid && existingOpen.quizid !== quizId) {
      const { data: attemptQuiz } = await supabase
        .from("quiztbl")
        .select("time_limit_minutes")
        .eq("id", existingOpen.quizid)
        .maybeSingle();
      timeLimitMinutes = (attemptQuiz as { time_limit_minutes?: number | null })?.time_limit_minutes ?? null;
    }
	    const startedAt = existingOpen.started_at ? new Date(existingOpen.started_at) : null;
	    const expiresAt =
	      timeLimitMinutes && startedAt && !Number.isNaN(startedAt.getTime())
	        ? new Date(startedAt.getTime() + timeLimitMinutes * 60 * 1000).toISOString()
	        : null;
    const expectedAttemptNumber =
      typeof attemptsUsed === "number" ? Math.max(1, attemptsUsed + 1) : null;
    const attemptNumberOut =
      expectedAttemptNumber ?? (existingOpen.attempt_number ?? 1);

    return NextResponse.json({
      attemptId: existingOpen.id,
      attemptNumber: attemptNumberOut,
      expiresAt,
      maxAttempts,
      allowRetake,
      attemptsUsed,
      attemptsRemaining: hasManualSubmit
        ? 0
        : attemptsRemaining === 0
          ? 1
          : attemptsRemaining,
    });
  }

  let count: number | null = null;
  const countResult = await supabase
    .from("student_attempts_log")
    .select("student_id, submission_source")
    .in("quizid", quizIds.length > 0 ? quizIds : [quizId])
    .eq("is_submitted", true);
  if (countResult.error?.message && countResult.error.message.toLowerCase().includes("student_attempts_log")) {
    const fallbackCount = await supabase
      .from("student_attempts")
      .select("student_id")
      .eq("quizid", quizId);
    count = ((fallbackCount.data ?? []) as Array<{ student_id?: string | null }>).filter((row) =>
      sameStudentId(row.student_id, studentId)
    ).length;
  } else {
    count = ((countResult.data ?? []) as Array<{ student_id?: string | null }>).filter((row) =>
      sameStudentId(row.student_id, studentId)
    ).length;
  }

  const attemptCount = count ?? 0;
  const hasManualSubmit =
    countResult.error?.message && countResult.error.message.toLowerCase().includes("student_attempts_log")
      ? false
      : ((countResult.data ?? []) as Array<{ student_id?: string | null; submission_source?: string | null }>)
          .filter((row) => sameStudentId(row.student_id, studentId))
          .some((row) => String(row.submission_source ?? "").trim() === "manual_submit");
  if (hasManualSubmit) {
    return NextResponse.json({ error: "No attempts remaining" }, { status: 403 });
  }
  const allowRetake = hasManualSubmit ? false : baseAllowRetake;

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
    attemptsUsed: attemptCount,
    attemptsRemaining: hasManualSubmit ? 0 : Math.max(0, maxAttempts - attemptCount),
  });
  } catch {
    return NextResponse.json({ ok: true, attemptId: null, attemptNumber: 1, expiresAt: null, maxAttempts: 1, allowRetake: false });
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: true, message: "Use POST to start a quiz attempt." },
    { status: 200 }
  );
}
