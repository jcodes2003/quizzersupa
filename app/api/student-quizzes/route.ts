import { NextRequest } from "next/server";
import { noStoreJson } from "../../lib/no-store";
import { sameStudentId, sanitizeStudentId } from "../../lib/student-id";
import { getStudentSession } from "../../lib/student-auth";
import { getSupabase } from "../../lib/supabase-server";
import { getStudentSectionIds } from "../../lib/student-sections";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isOpen(deadlineIso: string | null, submissionsOpen: unknown): boolean {
  if (submissionsOpen === false) return false;
  if (!deadlineIso) return true;
  const d = new Date(deadlineIso);
  if (Number.isNaN(d.getTime())) return true;
  return Date.now() <= d.getTime();
}

export async function GET(request: NextRequest) {
  const session = await getStudentSession();
  if (!session) return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  const dbSectionIds = await getStudentSectionIds(session.student.id).catch(() => null);
  const sectionIds = (dbSectionIds ?? session.sectionIds ?? []).map(String).filter(Boolean);
  if (sectionIds.length === 0) return noStoreJson({ ok: true, quizzes: [] });

  const selectedSectionId = String(request.nextUrl.searchParams.get("sectionId") ?? "").trim();
  const filterSectionIds = selectedSectionId ? [selectedSectionId] : sectionIds;
  if (selectedSectionId && !sectionIds.includes(selectedSectionId)) {
    return noStoreJson({ ok: false, error: "Not joined to that section" }, { status: 403 });
  }

  const supabase = getSupabase();
  let data: Record<string, unknown>[] | null = null;
  let error: { message: string } | null = null;

  const full = await supabase
    .from("quiztbl")
    .select("id, quizcode, quizname, sectionid, subjectid, subject_semester, period, assessment_type, time_limit_minutes, allow_retake, max_attempts, submission_deadline, submissions_open, created_at")
    .in("sectionid", filterSectionIds)
    .order("created_at", { ascending: false });
  data = (full.data ?? null) as Record<string, unknown>[] | null;
  error = (full.error ?? null) as { message: string } | null;

  if (
    error?.message &&
    (error.message.toLowerCase().includes("assessment_type") ||
      error.message.toLowerCase().includes("subjectid") ||
      error.message.toLowerCase().includes("subject_semester") ||
      error.message.toLowerCase().includes("submission_deadline") ||
      error.message.toLowerCase().includes("submissions_open"))
  ) {
    const minimal = await supabase
      .from("quiztbl")
      .select("id, quizcode, quizname, sectionid, subjectid, subject_semester, period, time_limit_minutes, allow_retake, max_attempts, created_at")
      .in("sectionid", filterSectionIds)
      .order("created_at", { ascending: false });
    data = (minimal.data ?? null) as Record<string, unknown>[] | null;
    error = (minimal.error ?? null) as { message: string } | null;
  }

  if (error?.message && (error.message.toLowerCase().includes("subjectid") || error.message.toLowerCase().includes("subject_semester"))) {
    const minimal = await supabase
      .from("quiztbl")
      .select("id, quizcode, quizname, sectionid, period, time_limit_minutes, allow_retake, max_attempts, created_at")
      .in("sectionid", filterSectionIds)
      .order("created_at", { ascending: false });
    data = (minimal.data ?? null) as Record<string, unknown>[] | null;
    error = (minimal.error ?? null) as { message: string } | null;
  }

  if (error) return noStoreJson({ ok: false, error: error.message }, { status: 500 });

  const { data: sectionsData } = await supabase.from("sections").select("id, sectionname, name").in("id", filterSectionIds);
  const sectionNameById = new Map<string, string>(
    ((sectionsData ?? []) as Array<{ id: string; sectionname?: string | null; name?: string | null }>).map((s) => [
      String(s.id),
      String((s.sectionname ?? s.name ?? "") || "").trim(),
    ])
  );

  const baseQuizzes = (data ?? [])
    .map((q) => {
      const deadlineIso = safeIso((q as { submission_deadline?: unknown }).submission_deadline);
      const submissionsOpen = (q as { submissions_open?: unknown }).submissions_open;
      const open = isOpen(deadlineIso, submissionsOpen);
      return {
        id: String(q.id ?? ""),
        quizcode: String(q.quizcode ?? "").trim(),
        quizname: String((q as { quizname?: unknown }).quizname ?? "").trim(),
        period: String((q as { period?: unknown }).period ?? "").trim(),
        sectionid: String((q as { sectionid?: unknown }).sectionid ?? "").trim(),
        sectionName: sectionNameById.get(String((q as { sectionid?: unknown }).sectionid ?? "")) ?? "",
        subjectid: String((q as { subjectid?: unknown }).subjectid ?? "").trim(),
        subject_semester: String((q as { subject_semester?: unknown }).subject_semester ?? "").trim(),
        assessment_type: String((q as { assessment_type?: unknown }).assessment_type ?? "quiz"),
        time_limit_minutes: (q as { time_limit_minutes?: unknown }).time_limit_minutes ?? null,
        allow_retake: Boolean((q as { allow_retake?: unknown }).allow_retake),
        max_attempts: Number((q as { max_attempts?: unknown }).max_attempts ?? 1),
        submission_deadline: deadlineIso,
        submissions_open: submissionsOpen !== false,
        _open: open,
      };
    })
    .filter((q) => q.id && q.quizcode);

  const subjectIds = Array.from(new Set(baseQuizzes.map((q) => q.subjectid).filter(Boolean)));
  const subjectNameById = new Map<string, string>();
  const subjectArchivedById = new Map<string, boolean>();
  const subjectSemesterById = new Map<string, string | null>();
  if (subjectIds.length > 0) {
    const fullSubjects = await supabase
      .from("subjecttbl")
      .select("id, subjectname, archived")
      .in("id", subjectIds);
    const errMsg = (fullSubjects.error as { message?: string } | null)?.message ?? "";
    const subjectsRes =
      errMsg && errMsg.toLowerCase().includes("archived")
        ? await supabase.from("subjecttbl").select("id, subjectname").in("id", subjectIds)
        : fullSubjects;

    for (const s of (subjectsRes.data ?? []) as Array<{ id: string; subjectname?: string | null; archived?: boolean; semester?: string | null }>) {
      const id = String(s.id ?? "").trim();
      if (!id) continue;
      subjectNameById.set(id, String(s.subjectname ?? "").trim());
      subjectArchivedById.set(id, s.archived === undefined ? false : Boolean(s.archived));
      const sem = typeof s.semester === "string" && s.semester.trim() ? s.semester.trim() : null;
      subjectSemesterById.set(id, sem);
    }

    // If semester column exists, enrich semester map.
    const semProbe = await supabase.from("subjecttbl").select("id, semester").in("id", subjectIds);
    const semMsg = (semProbe.error as { message?: string } | null)?.message ?? "";
    if (!semMsg || !semMsg.toLowerCase().includes("semester")) {
      for (const s of (semProbe.data ?? []) as Array<{ id: string; semester?: string | null }>) {
        const id = String(s.id ?? "").trim();
        if (!id) continue;
        const sem = typeof s.semester === "string" && s.semester.trim() ? s.semester.trim() : null;
        subjectSemesterById.set(id, sem);
      }
    }
  }

  const studentId = sanitizeStudentId(session.student.studentId ?? "");
  const quizIds = baseQuizzes.map((q) => q.id);
  const attemptsUsedByQuizId = new Map<string, number>();
  const hasManualSubmitByQuizId = new Map<string, boolean>();
  const openAttemptByQuizId = new Map<string, { attemptId: string }>();
  const approvedRecoveryAttemptIds = new Set<string>();
  const latestAttemptByQuizId = new Map<
    string,
    { attemptId: string; submittedAt: string | null; submissionSource: string | null }
  >();
  const bestByQuizId = new Map<
    string,
    { submittedAt: string | null; score: number | null; maxScore: number | null; percentage: number | null }
  >();

  const mergeAttemptIntoBest = (qid: string, attempt: Record<string, unknown>) => {
    attemptsUsedByQuizId.set(qid, (attemptsUsedByQuizId.get(qid) ?? 0) + 1);
    if (String(attempt.submission_source ?? "").trim() === "manual_submit") {
      hasManualSubmitByQuizId.set(qid, true);
    }

    const submittedAtRaw = safeIso(attempt.submitted_at ?? attempt.created_at);
    const attemptId = String(attempt.id ?? "").trim();
    const submissionSource =
      typeof attempt.submission_source === "string" && attempt.submission_source.trim()
        ? attempt.submission_source.trim()
        : null;
    const prevLatest = latestAttemptByQuizId.get(qid);
    const prevLatestTime = prevLatest?.submittedAt ? new Date(prevLatest.submittedAt).getTime() : 0;
    const nextLatestTime = submittedAtRaw ? new Date(submittedAtRaw).getTime() : 0;
    if (attemptId && (!prevLatest || nextLatestTime >= prevLatestTime)) {
      latestAttemptByQuizId.set(qid, { attemptId, submittedAt: submittedAtRaw, submissionSource });
    }
    const scoreNum = Number(attempt.score);
    const maxNum = Number(attempt.max_score);
    const score = Number.isFinite(scoreNum) ? scoreNum : null;
    const maxScore = Number.isFinite(maxNum) ? maxNum : null;
    const percentage =
      score != null && maxScore != null && maxScore > 0
        ? Math.round((score / maxScore) * 100)
        : null;

    const prev = bestByQuizId.get(qid);
    if (!prev) {
      bestByQuizId.set(qid, { submittedAt: submittedAtRaw, score, maxScore, percentage });
      return;
    }
    const prevPct = typeof prev.percentage === "number" ? prev.percentage : -1;
    const nextPct = typeof percentage === "number" ? percentage : -1;
    if (nextPct > prevPct) {
      bestByQuizId.set(qid, { submittedAt: submittedAtRaw, score, maxScore, percentage });
      return;
    }
    if (nextPct === prevPct) {
      const prevTime = prev.submittedAt ? new Date(prev.submittedAt).getTime() : 0;
      const nextTime = submittedAtRaw ? new Date(submittedAtRaw).getTime() : 0;
      if (nextTime >= prevTime) {
        bestByQuizId.set(qid, { submittedAt: submittedAtRaw, score, maxScore, percentage });
      }
    }
  };

  if (studentId && quizIds.length > 0) {
    const requestRes = await supabase
      .from("student_attempt_recovery_requests")
      .select("attempt_log_id, status");
    const requestErr = (requestRes.error as { message?: string } | null)?.message ?? "";
    if (!requestErr || !requestErr.toLowerCase().includes("student_attempt_recovery_requests")) {
      for (const row of (requestRes.data ?? []) as Array<{ attempt_log_id?: string | null; status?: string | null }>) {
        const attemptId = String(row.attempt_log_id ?? "").trim();
        const status = String(row.status ?? "").trim().toLowerCase();
        if (attemptId && status === "approved") approvedRecoveryAttemptIds.add(attemptId);
      }
    }

    const openAttemptsRes = await supabase
      .from("student_attempts_log")
      .select("id, quizid, student_id")
      .in("quizid", quizIds)
      .eq("is_submitted", false);
    const openAttemptsErr = (openAttemptsRes.error as { message?: string } | null)?.message ?? "";
    if (!openAttemptsErr || !openAttemptsErr.toLowerCase().includes("student_attempts_log")) {
      for (const row of (openAttemptsRes.data ?? []) as Array<{ id?: string | null; quizid?: string | null; student_id?: string | null }>) {
        const qid = String(row.quizid ?? "").trim();
        const attemptId = String(row.id ?? "").trim();
        if (!qid || !attemptId || !sameStudentId(row.student_id, studentId)) continue;
        if (!openAttemptByQuizId.has(qid)) {
          openAttemptByQuizId.set(qid, { attemptId });
        }
      }
    }

    const fullAttempts = await supabase
      .from("student_attempts_log")
      .select("id, quizid, student_id, score, max_score, submitted_at, created_at, submission_source")
      .in("quizid", quizIds)
      .eq("is_submitted", true);

    // Backward compatibility if some columns don't exist yet.
    const errMsg = (fullAttempts.error as { message?: string } | null)?.message ?? "";
    const attemptsRes =
          errMsg &&
      (errMsg.toLowerCase().includes("submitted_at") ||
        errMsg.toLowerCase().includes("id") ||
        errMsg.toLowerCase().includes("max_score") ||
        errMsg.toLowerCase().includes("max_score") ||
        errMsg.toLowerCase().includes("score") ||
        errMsg.toLowerCase().includes("submission_source"))
        ? await supabase
            .from("student_attempts_log")
            .select("id, quizid, student_id, created_at")
            .in("quizid", quizIds)
            .eq("is_submitted", true)
        : fullAttempts;

	    const attempts = (attemptsRes.data ?? []) as Array<Record<string, unknown>>;
	    for (const a of attempts) {
	      const qid = String(a.quizid ?? "").trim();
	      if (!qid || !sameStudentId(a.student_id, studentId)) continue;
      mergeAttemptIntoBest(qid, a);
	    }
	  }

  if (quizIds.length > 0) {
    const fallbackRows: Array<Record<string, unknown>> = [];

    if (studentId) {
      const fallbackById = await supabase
        .from("student_attempts")
        .select("quizid, score, max_score, created_at, student_id, studentname")
        .in("quizid", quizIds);
      if (!fallbackById.error) {
        fallbackRows.push(...(((fallbackById.data ?? []) as Array<Record<string, unknown>>)));
      }
    }

    const seenFallbackKeys = new Set<string>();
    for (const row of fallbackRows) {
      const qid = String(row.quizid ?? "").trim();
      if (!qid || attemptsUsedByQuizId.has(qid)) continue;
      if (!sameStudentId(row.student_id, studentId)) continue;
      const sid = String(row.student_id ?? "").trim();
      const sname = String(row.studentname ?? "").trim();
      const dedupeKey = `${qid}::${sid}::${sname}::${String(row.created_at ?? "")}`;
      if (seenFallbackKeys.has(dedupeKey)) continue;
      seenFallbackKeys.add(dedupeKey);
      mergeAttemptIntoBest(qid, row);
    }
  }

  const quizzes = baseQuizzes
    .filter((q) => !q.subjectid || !subjectArchivedById.get(q.subjectid))
    .filter((q) => {
      if (!q.subjectid) return true;
      const currentSem = subjectSemesterById.get(q.subjectid) ?? null;
      if (!currentSem) return true; // no semester set => show all
      const quizSem = q.subject_semester || null;
      // Fresh start: only show quizzes tagged with the current subject semester.
      return quizSem === currentSem;
	    })
	          .map((q) => {
	      const attemptsUsed = attemptsUsedByQuizId.get(q.id) ?? 0;
	      const baseAttemptsRemaining = Math.max(0, (q.max_attempts ?? 1) - attemptsUsed);
	      const existingOpenAttempt = openAttemptByQuizId.get(q.id) ?? null;
	      const best = bestByQuizId.get(q.id) ?? null;
	      const latestAttempt = latestAttemptByQuizId.get(q.id) ?? null;
	      const latestSubmissionSource = latestAttempt?.submissionSource ?? null;
	      const submitted = attemptsUsed > 0;
	      const hasManualSubmit = hasManualSubmitByQuizId.get(q.id) === true;
      const hasApprovedRecoveredAttempt =
        Boolean(existingOpenAttempt?.attemptId) && approvedRecoveryAttemptIds.has(String(existingOpenAttempt?.attemptId ?? ""));
      const hasReopenedAttempt = Boolean(existingOpenAttempt?.attemptId) && hasApprovedRecoveredAttempt;
      const attemptsRemaining = hasReopenedAttempt ? -1 : baseAttemptsRemaining;
      const canStillAttempt = (q._open && attemptsRemaining > 0 && !hasManualSubmit) || hasReopenedAttempt;
	      const status: "open" | "closed" | "missing" | "completed" = canStillAttempt
	        ? "open"
	        : submitted
          ? "completed"
          : "missing";
      const submittedAt = best?.submittedAt ?? null;
      const score = best?.score ?? null;
      const maxScore = best?.maxScore ?? null;
      const percentage = best?.percentage ?? null;
      return {
        id: q.id,
        quizcode: q.quizcode,
        quizname: q.quizname,
        period: q.period,
        sectionid: q.sectionid,
        sectionName: q.sectionName,
        subjectid: q.subjectid,
        subjectName: subjectNameById.get(q.subjectid) ?? "",
        assessment_type: q.assessment_type,
        time_limit_minutes: q.time_limit_minutes,
        allow_retake: q.allow_retake,
        max_attempts: q.max_attempts,
        submission_deadline: q.submission_deadline,
        submissions_open: q.submissions_open,
        status,
        submitted,
        submittedAt,
        score,
        maxScore,
        percentage,
	        attemptsUsed,
	        attemptsRemaining,
	        latestAttemptId: existingOpenAttempt?.attemptId ?? latestAttempt?.attemptId ?? null,
	        latestSubmissionSource,
	      };
	    })
    .sort((a, b) => {
      // Open first, then missing, then completed, then closed; within group, closest deadline first, else by code.
      const rank = (s: string) => (s === "open" ? 0 : s === "missing" ? 1 : s === "completed" ? 2 : 3);
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      const ad = a.submission_deadline ? new Date(a.submission_deadline).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.submission_deadline ? new Date(b.submission_deadline).getTime() : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return a.quizcode.localeCompare(b.quizcode);
    });

  const latestAttemptIds = quizzes
    .map((q) => String((q as { latestAttemptId?: unknown }).latestAttemptId ?? "").trim())
    .filter(Boolean);

  let requestRows: Array<{ attempt_log_id?: string | null; status?: string | null }> = [];
  if (latestAttemptIds.length > 0) {
    const requestRes = await supabase
      .from("student_attempt_recovery_requests")
      .select("attempt_log_id, status")
      .in("attempt_log_id", latestAttemptIds)
      .order("created_at", { ascending: false });
    const requestErr = (requestRes.error as { message?: string } | null)?.message ?? "";
    if (!requestErr || !requestErr.toLowerCase().includes("student_attempt_recovery_requests")) {
      requestRows = (requestRes.data ?? []) as Array<{ attempt_log_id?: string | null; status?: string | null }>;
    }
  }

  const requestStatusByAttemptId = new Map<string, string>();
  for (const row of requestRows) {
    const attemptId = String(row.attempt_log_id ?? "").trim();
    if (!attemptId || requestStatusByAttemptId.has(attemptId)) continue;
    requestStatusByAttemptId.set(attemptId, String(row.status ?? "").trim().toLowerCase());
  }

  const quizzesWithRequests = quizzes.map((q) => {
    const latestAttemptId = String((q as { latestAttemptId?: unknown }).latestAttemptId ?? "").trim();
    const latestSubmissionSource = String((q as { latestSubmissionSource?: unknown }).latestSubmissionSource ?? "").trim().toLowerCase();
    const recoveryRequestStatus = latestAttemptId ? requestStatusByAttemptId.get(latestAttemptId) ?? null : null;
    const isAutoSubmitted =
      latestSubmissionSource === "auto_tab_switch" ||
      latestSubmissionSource === "auto_close_tab" ||
      latestSubmissionSource === "auto_time_expired";
    const canRequestRecovery =
      Boolean(latestAttemptId) &&
      isAutoSubmitted &&
      q.status !== "open" &&
      recoveryRequestStatus !== "pending";
    return {
      ...q,
      recoveryRequestStatus,
      canRequestRecovery,
    };
  });

  return noStoreJson({ ok: true, quizzes: quizzesWithRequests });
}
