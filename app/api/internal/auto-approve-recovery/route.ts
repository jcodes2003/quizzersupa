import { NextRequest } from "next/server";
import { noStoreJson } from "../../../lib/no-store";
import { getSupabase } from "../../../lib/supabase-server";
import { sameStudentId } from "../../../lib/student-id";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AUTO_SUBMIT_SOURCES = new Set(["auto_tab_switch", "auto_close_tab", "auto_time_expired"]);

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  if (!cronSecret) return false;
  const authHeader = String(request.headers.get("authorization") ?? "").trim();
  return authHeader === `Bearer ${cronSecret}`;
}

type PendingRequestRow = {
  id: string;
  attempt_log_id?: string | null;
  student_id?: string | null;
};

type AttemptRow = {
  id: string;
  quizid?: string | null;
  student_id?: string | null;
  started_at?: string | null;
  submitted_at?: string | null;
  submission_source?: string | null;
};

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const pendingRes = await supabase
    .from("student_attempt_recovery_requests")
    .select("id, attempt_log_id, student_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(500);
  if (pendingRes.error) {
    return noStoreJson({ ok: false, error: pendingRes.error.message }, { status: 500 });
  }

  const pendingRows = (pendingRes.data ?? []) as PendingRequestRow[];
  let approvedCount = 0;
  const skipped: Array<{ requestId: string; reason: string }> = [];

  for (const requestRow of pendingRows) {
    const requestId = String(requestRow.id ?? "").trim();
    const attemptId = String(requestRow.attempt_log_id ?? "").trim();
    const requestStudentId = String(requestRow.student_id ?? "").trim();
    if (!requestId || !attemptId || !requestStudentId) {
      skipped.push({ requestId: requestId || "(missing)", reason: "Missing request fields." });
      continue;
    }

    const attemptRes = await supabase
      .from("student_attempts_log")
      .select("id, quizid, student_id, started_at, submitted_at, submission_source")
      .eq("id", attemptId)
      .maybeSingle();
    if (attemptRes.error) {
      skipped.push({ requestId, reason: attemptRes.error.message });
      continue;
    }
    const attemptRow = (attemptRes.data ?? null) as AttemptRow | null;
    if (!attemptRow) {
      skipped.push({ requestId, reason: "Attempt not found." });
      continue;
    }
    if (!sameStudentId(attemptRow.student_id, requestStudentId)) {
      skipped.push({ requestId, reason: "Student mismatch." });
      continue;
    }
    if (!AUTO_SUBMIT_SOURCES.has(String(attemptRow.submission_source ?? "").trim().toLowerCase())) {
      skipped.push({ requestId, reason: "Attempt is not auto-submitted." });
      continue;
    }

    const quizId = String(attemptRow.quizid ?? "").trim();
    if (!quizId) {
      skipped.push({ requestId, reason: "Attempt quiz ID is missing." });
      continue;
    }

    const openAttemptRes = await supabase
      .from("student_attempts_log")
      .select("id, student_id")
      .eq("quizid", quizId)
      .eq("is_submitted", false);
    if (openAttemptRes.error) {
      skipped.push({ requestId, reason: openAttemptRes.error.message });
      continue;
    }
    const conflictingOpenAttemptIds = ((openAttemptRes.data ?? []) as Array<{ id?: string | null; student_id?: string | null }>)
      .filter((row) => sameStudentId(row.student_id, requestStudentId))
      .map((row) => String(row.id ?? "").trim())
      .filter((id) => id && id !== attemptId);
    if (conflictingOpenAttemptIds.length > 0) {
      const deleteOpenRes = await supabase
        .from("student_attempts_log")
        .delete()
        .in("id", conflictingOpenAttemptIds);
      if (deleteOpenRes.error) {
        skipped.push({ requestId, reason: deleteOpenRes.error.message });
        continue;
      }
    }

    let reopenedStartedAt = new Date().toISOString();
    const quizRes = await supabase
      .from("quiztbl")
      .select("time_limit_minutes")
      .eq("id", quizId)
      .maybeSingle();
    if (quizRes.error) {
      skipped.push({ requestId, reason: quizRes.error.message });
      continue;
    }
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
      .maybeSingle();
    if (reopenRes.error) {
      skipped.push({ requestId, reason: reopenRes.error.message });
      continue;
    }

    const approveRes = await supabase
      .from("student_attempt_recovery_requests")
      .update({
        status: "approved",
        reviewed_by: "system_cron",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select("id")
      .maybeSingle();
    if (approveRes.error) {
      skipped.push({ requestId, reason: approveRes.error.message });
      continue;
    }

    approvedCount += 1;
  }

  return noStoreJson({
    ok: true,
    pendingCount: pendingRows.length,
    approvedCount,
    skippedCount: skipped.length,
    skipped,
  });
}

