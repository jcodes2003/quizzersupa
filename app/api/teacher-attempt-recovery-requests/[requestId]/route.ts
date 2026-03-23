import { NextRequest } from "next/server";
import { noStoreJson } from "../../../lib/no-store";
import { getTeacherId } from "../../../lib/teacher-db-auth";
import { getSupabase } from "../../../lib/supabase-server";
import { sameStudentId } from "../../../lib/student-id";

const AUTO_SUBMIT_SOURCES = new Set(["auto_tab_switch", "auto_close_tab", "auto_time_expired"]);

export async function PATCH(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  const teacherId = await getTeacherId();
  if (!teacherId) return noStoreJson({ error: "Unauthorized" }, { status: 401 });

  const { requestId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = String(body.action ?? "").trim().toLowerCase();
  if (action !== "approve" && action !== "reject") {
    return noStoreJson({ error: "Action must be approve or reject." }, { status: 400 });
  }

  const supabase = getSupabase();
  const requestRes = await supabase
    .from("student_attempt_recovery_requests")
    .select("id, teacherid, attempt_log_id, student_id, status")
    .eq("id", requestId)
    .maybeSingle();
  const requestErr = (requestRes.error as { message?: string } | null)?.message ?? "";
  if (requestErr) return noStoreJson({ error: requestErr }, { status: 500 });
  const requestRow = (requestRes.data ?? null) as
    | { id: string; teacherid?: string | null; attempt_log_id?: string | null; student_id?: string | null; status?: string | null }
    | null;
  if (!requestRow) return noStoreJson({ error: "Request not found." }, { status: 404 });
  if (String(requestRow.teacherid ?? "") !== teacherId) {
    return noStoreJson({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "reject") {
    const rejectRes = await supabase
      .from("student_attempt_recovery_requests")
      .update({
        status: "rejected",
        reviewed_by: teacherId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select("id, status")
      .single();
    if (rejectRes.error) return noStoreJson({ error: rejectRes.error.message }, { status: 500 });
    return noStoreJson({ ok: true, request: rejectRes.data });
  }

  const attemptId = String(requestRow.attempt_log_id ?? "").trim();
  if (!attemptId) return noStoreJson({ error: "Recovery request is missing its attempt reference." }, { status: 400 });

  const attemptRes = await supabase
    .from("student_attempts_log")
    .select("id, quizid, student_id, started_at, submitted_at, is_submitted, submission_source")
    .eq("id", attemptId)
    .maybeSingle();
  const attemptErr = (attemptRes.error as { message?: string } | null)?.message ?? "";
  if (attemptErr) return noStoreJson({ error: attemptErr }, { status: 500 });
  const attemptRow = (attemptRes.data ?? null) as
    | {
        id: string;
        quizid?: string | null;
        student_id?: string | null;
        started_at?: string | null;
        submitted_at?: string | null;
        is_submitted?: boolean | null;
        submission_source?: string | null;
      }
    | null;
  if (!attemptRow) return noStoreJson({ error: "Attempt not found." }, { status: 404 });
  if (!sameStudentId(attemptRow.student_id, requestRow.student_id)) {
    return noStoreJson({ error: "Student mismatch for this recovery request." }, { status: 409 });
  }
  if (!AUTO_SUBMIT_SOURCES.has(String(attemptRow.submission_source ?? "").trim().toLowerCase())) {
    return noStoreJson({ error: "Only auto-submitted attempts can be reopened." }, { status: 400 });
  }

  const openAttemptRes = await supabase
    .from("student_attempts_log")
    .select("id, student_id")
    .eq("quizid", String(attemptRow.quizid ?? ""))
    .eq("is_submitted", false);
  const openAttemptErr = (openAttemptRes.error as { message?: string } | null)?.message ?? "";
  if (openAttemptErr && !openAttemptErr.toLowerCase().includes("student_attempts_log")) {
    return noStoreJson({ error: openAttemptErr }, { status: 500 });
  }
  const existingOpenAttempts = ((openAttemptRes.data ?? []) as Array<{ id?: string | null; student_id?: string | null }>).filter((row) =>
    sameStudentId(row.student_id, requestRow.student_id)
  );
  const conflictingOpenAttemptIds = existingOpenAttempts
    .map((row) => String(row.id ?? "").trim())
    .filter((id) => id && id !== attemptId);

  if (conflictingOpenAttemptIds.length > 0) {
    const deleteOpenRes = await supabase
      .from("student_attempts_log")
      .delete()
      .in("id", conflictingOpenAttemptIds);
    if (deleteOpenRes.error) {
      return noStoreJson({ error: deleteOpenRes.error.message }, { status: 500 });
    }
  }

  let reopenedStartedAt = new Date().toISOString();
  const quizRes = await supabase
    .from("quiztbl")
    .select("time_limit_minutes")
    .eq("id", String(attemptRow.quizid ?? ""))
    .maybeSingle();
  const quizErr = (quizRes.error as { message?: string } | null)?.message ?? "";
  if (quizErr) return noStoreJson({ error: quizErr }, { status: 500 });

  const timeLimitMinutes = Number((quizRes.data as { time_limit_minutes?: number | null } | null)?.time_limit_minutes ?? 0);
  const startedMs = attemptRow.started_at ? new Date(attemptRow.started_at).getTime() : Number.NaN;
  const submittedMs = attemptRow.submitted_at ? new Date(attemptRow.submitted_at).getTime() : Number.NaN;
  if (Number.isFinite(timeLimitMinutes) && timeLimitMinutes > 0 && Number.isFinite(startedMs) && Number.isFinite(submittedMs)) {
    const timeLimitMs = timeLimitMinutes * 60 * 1000;
    const originalExpiresMs = startedMs + timeLimitMs;
    const remainingMs = Math.max(1000, originalExpiresMs - submittedMs);
    reopenedStartedAt = new Date(Date.now() - (timeLimitMs - remainingMs)).toISOString();
  }

  const reopenRes = await supabase
    .from("student_attempts_log")
    .update({
      is_submitted: false,
      started_at: reopenedStartedAt,
      submitted_at: null,
    })
    .eq("id", attemptId)
    .select("id")
    .single();
  if (reopenRes.error) return noStoreJson({ error: reopenRes.error.message }, { status: 500 });

  const approveRes = await supabase
    .from("student_attempt_recovery_requests")
    .update({
      status: "approved",
      reviewed_by: teacherId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .select("id, status")
    .single();
  if (approveRes.error) return noStoreJson({ error: approveRes.error.message }, { status: 500 });

  return noStoreJson({
    ok: true,
    request: approveRes.data,
    reopenedAttemptId: attemptId,
    clearedConflictingOpenAttempts: conflictingOpenAttemptIds.length,
  });
}
