import { NextRequest, NextResponse } from "next/server";
import { sameStudentId, sanitizeStudentId } from "../../lib/student-id";
import { getSupabase } from "../../lib/supabase-server";

function normalizeStudentNameKey(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSubmissionCloseReason(quizData: Record<string, unknown>): string | null {
  const submissionsOpen = (quizData.submissions_open as boolean | null | undefined) !== false;
  if (!submissionsOpen) return "Quiz submissions are closed by the teacher.";
  const deadlineRaw = quizData.submission_deadline;
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
  const body = await request.json() as {
    quizId: string;
    studentName: string;
    studentId: string;
    score: number;
    maxScore: number;
    attemptNumber: number;
    attemptId?: string;
    answers?: Record<string, unknown>;
    submissionSource?: string;
  };

  const quizId = String(body.quizId ?? "").trim();
  const studentName = String(body.studentName ?? "").trim();
  const studentId = sanitizeStudentId(String(body.studentId ?? "").trim());
  const { score, maxScore, attemptNumber, attemptId, answers } = body;
  const sourceRaw = String(body.submissionSource ?? "").trim().toLowerCase();
  const allowedSources = new Set([
    "manual_submit",
    "auto_tab_switch",
    "auto_close_tab",
    "auto_time_expired",
  ]);
  const submissionSource = allowedSources.has(sourceRaw) ? sourceRaw : "manual_submit";

  if (!quizId || !studentName || !studentId || score === undefined || !maxScore || !attemptNumber) {
    return NextResponse.json(
      { error: "quizId, studentName, studentId, score, maxScore, and attemptNumber required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  // Prevent submitting under a different student ID while keeping the same name.
  const studentNameKey = normalizeStudentNameKey(studentName);
  if (studentNameKey) {
    let { data: nameRows, error: nameErr } = await supabase
      .from("student_attempts_log")
      .select("studentname, student_id")
      .eq("quizid", quizId)
      .limit(5000);
    if (nameErr?.message && nameErr.message.toLowerCase().includes("student_attempts_log")) {
      const fallback = await supabase
        .from("student_attempts")
        .select("studentname, student_id")
        .eq("quizid", quizId)
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

  // Get quiz metadata including sectionid and subjectid
  let quizData: Record<string, unknown> | null = null;
  let quizError: { message: string } | null = null;
  const fullQuiz = await supabase
    .from("quiztbl")
    .select("subjectid, subject_semester, sectionid, time_limit_minutes, save_best_only, submission_deadline, submissions_open")
    .eq("id", quizId)
    .single();
  quizData = (fullQuiz.data ?? null) as Record<string, unknown> | null;
  quizError = (fullQuiz.error ?? null) as { message: string } | null;
  if (
    quizError?.message &&
    (quizError.message.toLowerCase().includes("submission_deadline") ||
      quizError.message.toLowerCase().includes("submissions_open"))
  ) {
    const fallback = await supabase
      .from("quiztbl")
      .select("subjectid, subject_semester, sectionid, time_limit_minutes, save_best_only")
      .eq("id", quizId)
      .single();
    quizData = (fallback.data ?? null) as Record<string, unknown> | null;
    quizError = (fallback.error ?? null) as { message: string } | null;
  }
  if (quizError) {
    return NextResponse.json({ error: quizError.message }, { status: 500 });
  }

  if (!quizData) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }
  const subjectId = String((quizData as { subjectid?: unknown }).subjectid ?? "").trim();
  if (subjectId) {
    const archived = await isSubjectArchived(subjectId);
    if (archived) return NextResponse.json({ error: "Subject archived" }, { status: 403 });

    const currentSem = await getSubjectSemester(subjectId);
    if (currentSem) {
      const quizSem = String((quizData as { subject_semester?: unknown }).subject_semester ?? "").trim() || null;
      if (quizSem && quizSem !== currentSem) {
        return NextResponse.json({ error: "Quiz is from a previous semester" }, { status: 403 });
      }
    }
  }
  const closeReason = getSubmissionCloseReason(quizData);
  if (closeReason) {
    return NextResponse.json({ error: closeReason }, { status: 403 });
  }

  let logUpdated = false;
  if (attemptId) {
    const { data: attemptRow, error: attemptErr } = await supabase
      .from("student_attempts_log")
      .select("id, quizid, student_id, started_at, is_submitted")
      .eq("id", attemptId)
      .maybeSingle();

    if (attemptErr?.message && !attemptErr.message.toLowerCase().includes("student_attempts_log")) {
      return NextResponse.json({ error: attemptErr.message }, { status: 500 });
    }

    if (attemptRow) {
      if (attemptRow.quizid !== quizId || !sameStudentId(attemptRow.student_id, studentId)) {
        // Fallback: if the open attempt belongs to a different related quiz/student,
        // ignore this attemptId and continue with normal save flow.
        console.warn("Ignoring mismatched attemptId in student-attempts", {
          attemptId,
          attemptQuizId: attemptRow.quizid,
          quizId,
          attemptStudentId: attemptRow.student_id,
          studentId,
        });
      } else {
        if (attemptRow.is_submitted) {
          return NextResponse.json({ error: "Attempt already submitted" }, { status: 409 });
        }
        const timeLimit = (quizData as { time_limit_minutes?: number | null }).time_limit_minutes ?? null;
        if (timeLimit) {
          const startMs = new Date(attemptRow.started_at).getTime();
          const expiresMs = startMs + timeLimit * 60 * 1000;
          if (Date.now() > expiresMs) {
            return NextResponse.json({ error: "Time expired" }, { status: 403 });
          }
        }

        const logUpdatePayload = {
          score,
          max_score: maxScore,
          answers: answers ?? null,
          submitted_at: new Date().toISOString(),
          is_submitted: true,
          subjectid: quizData.subjectid,
          sectionid: quizData.sectionid,
          studentname: studentName,
          attempt_number: attemptNumber,
          submission_source: submissionSource,
        };
        let { data: updatedRow, error: logError } = await supabase
          .from("student_attempts_log")
          .update(logUpdatePayload)
          .eq("id", attemptId)
          .select("id")
          .maybeSingle();
        if (logError?.message?.toLowerCase().includes("submission_source")) {
          const retry = await supabase
            .from("student_attempts_log")
            .update({
              score,
              max_score: maxScore,
              answers: answers ?? null,
              submitted_at: new Date().toISOString(),
              is_submitted: true,
              subjectid: quizData.subjectid,
              sectionid: quizData.sectionid,
              studentname: studentName,
              attempt_number: attemptNumber,
            })
            .eq("id", attemptId)
            .select("id")
            .maybeSingle();
          updatedRow = retry.data;
          logError = retry.error;
        }
        if (logError?.message && !logError.message.toLowerCase().includes("student_attempts_log")) {
          return NextResponse.json({ error: logError.message }, { status: 500 });
        }
        logUpdated = !!updatedRow;
      }
    }
  }

  const saveBestOnly = (quizData as { save_best_only?: boolean | null }).save_best_only !== false;
  let data;
  let error;

  if (saveBestOnly) {
    // Keep only the first attempt row; update its score if a later attempt is higher.
    const { data: firstAttemptRows } = await supabase
      .from("student_attempts")
      .select("*")
      .eq("quizid", quizId)
      .order("created_at", { ascending: true })
      .limit(500);
    const firstAttempt = ((firstAttemptRows ?? []) as Array<Record<string, unknown>>).find((row) =>
      sameStudentId(row.student_id, studentId)
    );

    if (firstAttempt) {
      const firstAttemptScore = Number(firstAttempt.score);
      if (!Number.isFinite(firstAttemptScore) || score > firstAttemptScore) {
        const result = await supabase
          .from("student_attempts")
          .update({
            score,
            studentname: studentName,
            max_score: maxScore,
            subjectid: quizData.subjectid,
            sectionid: quizData.sectionid,
          })
          .eq("id", firstAttempt.id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        data = firstAttempt;
        error = null;
      }
    } else {
      const result = await supabase
        .from("student_attempts")
        .insert({
          quizid: quizId,
          studentname: studentName,
          student_id: studentId,
          score,
          attempt_number: attemptNumber,
          max_score: maxScore,
          subjectid: quizData.subjectid,
          sectionid: quizData.sectionid,
        })
        .select()
        .single();

      data = result.data;
      error = result.error;
    }
  } else {
    // Save every attempt as a separate row.
    const result = await supabase
      .from("student_attempts")
      .insert({
        quizid: quizId,
        studentname: studentName,
        student_id: studentId,
        score,
        attempt_number: attemptNumber,
        max_score: maxScore,
        subjectid: quizData.subjectid,
        sectionid: quizData.sectionid,
      })
      .select()
      .single();

    data = result.data;
    error = result.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update quiztbl with the best score
  if (data && data.score !== null) {
    await supabase
      .from("quiztbl")
      .update({ score: data.score, studentname: studentName })
      .eq("id", quizId);
  }

  // Best-effort log insert (only when we did not already update an open attempt)
  let logSaved = logUpdated;
  if (!logUpdated) {
    let insertLog = await supabase
      .from("student_attempts_log")
      .insert({
        quizid: quizId,
        studentname: studentName,
        student_id: studentId,
        attempt_number: attemptNumber,
        score,
        max_score: maxScore,
        answers: answers ?? null,
        started_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        is_submitted: true,
        subjectid: quizData.subjectid,
        sectionid: quizData.sectionid,
        submission_source: submissionSource,
      });
    if (insertLog.error?.message?.toLowerCase().includes("submission_source")) {
      insertLog = await supabase
        .from("student_attempts_log")
        .insert({
          quizid: quizId,
          studentname: studentName,
          student_id: studentId,
          attempt_number: attemptNumber,
          score,
          max_score: maxScore,
          answers: answers ?? null,
          started_at: new Date().toISOString(),
          submitted_at: new Date().toISOString(),
          is_submitted: true,
          subjectid: quizData.subjectid,
          sectionid: quizData.sectionid,
        });
    }
    logSaved = !insertLog.error;
    if (!logSaved) {
      const logError = insertLog.error;
      console.error("student_attempts_log insert failed:", logError);
      if (logError && !logError.message.toLowerCase().includes("student_attempts_log")) {
        return NextResponse.json({ error: logError.message }, { status: 500 });
      }
    } else {
      console.log("student_attempts_log insert ok for quiz:", quizId, "student:", studentId);
    }
  }

  return NextResponse.json({ ok: true, best: data, logSaved });
}
