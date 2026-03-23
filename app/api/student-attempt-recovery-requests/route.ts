import { NextRequest } from "next/server";
import { noStoreJson } from "../../lib/no-store";
import { getStudentSession } from "../../lib/student-auth";
import { sameStudentId, sanitizeStudentId } from "../../lib/student-id";
import { getSupabase } from "../../lib/supabase-server";

const AUTO_SUBMIT_SOURCES = new Set(["auto_tab_switch", "auto_close_tab", "auto_time_expired"]);

export async function POST(request: NextRequest) {
  const session = await getStudentSession();
  if (!session) return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { attemptId?: string; submissionSource?: string };
  const attemptId = String(body.attemptId ?? "").trim();
  if (!attemptId) {
    return noStoreJson({ ok: false, error: "Attempt ID is required." }, { status: 400 });
  }

  const supabase = getSupabase();
  const attemptRes = await supabase
    .from("student_attempts_log")
    .select("id, quizid, student_id, studentname, subjectid, sectionid, submission_source, is_submitted, answers")
    .eq("id", attemptId)
    .maybeSingle();

  const attemptErr = (attemptRes.error as { message?: string } | null)?.message ?? "";
  if (attemptErr) {
    if (attemptErr.toLowerCase().includes("student_attempts_log")) {
      return noStoreJson({ ok: false, error: "Attempt recovery requests require the student_attempts_log table." }, { status: 501 });
    }
    return noStoreJson({ ok: false, error: attemptErr }, { status: 500 });
  }

  let attempt = (attemptRes.data ?? null) as
    | {
        id: string;
        quizid?: string | null;
        student_id?: string | null;
        studentname?: string | null;
        subjectid?: string | null;
        sectionid?: string | null;
        submission_source?: string | null;
        is_submitted?: boolean | null;
        answers?: Record<string, unknown> | null;
      }
    | null;
  if (!attempt) return noStoreJson({ ok: false, error: "Attempt not found." }, { status: 404 });

  const sessionStudentId = sanitizeStudentId(session.student.studentId ?? "");
  if (!sameStudentId(attempt.student_id, sessionStudentId)) {
    return noStoreJson({ ok: false, error: "This attempt does not belong to your account." }, { status: 403 });
  }

  const dbSource = String(attempt.submission_source ?? "").trim().toLowerCase();
  const requestedSource = String(body.submissionSource ?? "").trim().toLowerCase();
  let source = AUTO_SUBMIT_SOURCES.has(dbSource)
    ? dbSource
    : AUTO_SUBMIT_SOURCES.has(requestedSource)
      ? requestedSource
      : dbSource;

  const needsFallbackAttempt =
    !AUTO_SUBMIT_SOURCES.has(source) ||
    attempt.is_submitted !== true ||
    !attempt.answers ||
    typeof attempt.answers !== "object";

  if (needsFallbackAttempt) {
    const fallbackRes = await supabase
      .from("student_attempts_log")
      .select("id, quizid, student_id, studentname, subjectid, sectionid, submission_source, is_submitted, answers, submitted_at, created_at")
      .eq("quizid", String(attempt.quizid ?? ""))
      .eq("is_submitted", true)
      .order("submitted_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    const fallbackErr = (fallbackRes.error as { message?: string } | null)?.message ?? "";
    if (fallbackErr && !fallbackErr.toLowerCase().includes("student_attempts_log")) {
      return noStoreJson({ ok: false, error: fallbackErr }, { status: 500 });
    }
    const fallbackAttempt =
      ((fallbackRes.data ?? []) as Array<typeof attempt>)
        .find((row) => {
          const rowSource = String(row?.submission_source ?? "").trim().toLowerCase();
          return (
            !!row &&
            sameStudentId(row.student_id, sessionStudentId) &&
            AUTO_SUBMIT_SOURCES.has(rowSource) &&
            row.answers &&
            typeof row.answers === "object"
          );
        }) ?? null;
    if (fallbackAttempt) {
      attempt = fallbackAttempt;
      source = String(fallbackAttempt.submission_source ?? "").trim().toLowerCase();
    }
  }

  if (!AUTO_SUBMIT_SOURCES.has(source)) {
    return noStoreJson({ ok: false, error: "Only auto-submitted attempts can be requested for recovery." }, { status: 400 });
  }
  if (attempt.is_submitted !== true) {
    return noStoreJson({ ok: false, error: "No submitted auto-save attempt is ready for recovery yet." }, { status: 409 });
  }
  if (!attempt.answers || typeof attempt.answers !== "object") {
    return noStoreJson({ ok: false, error: "No saved answers were found for the latest auto-submitted attempt." }, { status: 409 });
  }

  const quizRes = await supabase
    .from("quiztbl")
    .select("id, teacherid")
    .eq("id", String(attempt.quizid ?? ""))
    .maybeSingle();
  const quizErr = (quizRes.error as { message?: string } | null)?.message ?? "";
  if (quizErr) return noStoreJson({ ok: false, error: quizErr }, { status: 500 });
  const teacherId = String((quizRes.data as { teacherid?: string | null } | null)?.teacherid ?? "").trim();
  if (!teacherId) return noStoreJson({ ok: false, error: "Teacher not found for this quiz." }, { status: 400 });

  const existingRes = await supabase
    .from("student_attempt_recovery_requests")
    .select("id, status")
    .eq("attempt_log_id", attempt.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const existingErr = (existingRes.error as { message?: string } | null)?.message ?? "";
  if (existingErr) {
    if (existingErr.toLowerCase().includes("student_attempt_recovery_requests")) {
      return noStoreJson(
        { ok: false, error: "Attempt recovery requests table is not set up yet. Run the new SQL migration first." },
        { status: 501 }
      );
    }
    return noStoreJson({ ok: false, error: existingErr }, { status: 500 });
  }
  const existing = ((existingRes.data ?? []) as Array<{ id?: string | null; status?: string | null }>)[0] ?? null;
  const existingStatus = String(existing?.status ?? "").trim().toLowerCase();
  if (existingStatus === "pending") {
    return noStoreJson({ ok: true, status: "pending", message: "A recovery request is already pending." });
  }

  let insertRes = await supabase
    .from("student_attempt_recovery_requests")
    .insert({
      attempt_log_id: attempt.id,
      quizid: attempt.quizid,
      teacherid: teacherId,
      student_db_id: session.student.id,
      student_id: sessionStudentId,
      studentname: attempt.studentname ?? session.student.name,
      subjectid: attempt.subjectid ?? null,
      sectionid: attempt.sectionid ?? null,
      submission_source: source,
      status: "pending",
    })
    .select("id, status")
    .single();

  if (insertRes.error) {
    const retryRes = await supabase
      .from("student_attempt_recovery_requests")
        .insert({
        attempt_log_id: attempt.id,
        quizid: attempt.quizid,
        teacherid: teacherId,
        student_id: sessionStudentId,
        studentname: attempt.studentname ?? session.student.name,
        submission_source: source,
        status: "pending",
      })
      .select("id, status")
      .single();
    insertRes = retryRes;
  }

  if (insertRes.error) {
    return noStoreJson({ ok: false, error: insertRes.error.message }, { status: 500 });
  }

  return noStoreJson({ ok: true, request: insertRes.data, status: "pending" });
}
