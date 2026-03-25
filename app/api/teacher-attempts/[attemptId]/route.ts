import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../lib/teacher-db-auth";
import { getSupabase } from "../../../lib/supabase-server";

type AttemptLookupRow = {
  id: string | number;
  quizid: string;
  student_id?: string | null;
  studentname?: string | null;
  score?: number | null;
  max_score?: number | null;
  attempt_number?: number | null;
  subjectid?: string | number | null;
  sectionid?: string | number | null;
  submitted_at?: string | null;
  created_at?: string | null;
};

type QuizOwnerRow = {
  id: string;
  teacherid?: string | null;
  save_best_only?: boolean | null;
  subjectid?: string | number | null;
  sectionid?: string | number | null;
};

function pickBestLog(rows: AttemptLookupRow[]): AttemptLookupRow | null {
  let bestLog: AttemptLookupRow | null = null;
  for (const row of rows) {
    if (!bestLog) {
      bestLog = row;
      continue;
    }
    const rowScore = Number(row.score ?? -1);
    const bestScore = Number(bestLog.score ?? -1);
    if (rowScore > bestScore) {
      bestLog = row;
      continue;
    }
    if (rowScore === bestScore) {
      const rowTime = new Date(row.submitted_at ?? row.created_at ?? 0).getTime();
      const bestTime = new Date(bestLog.submitted_at ?? bestLog.created_at ?? 0).getTime();
      if (rowTime > bestTime) bestLog = row;
    }
  }
  return bestLog;
}

async function syncStudentAttemptsForQuiz(
  supabase: ReturnType<typeof getSupabase>,
  quiz: QuizOwnerRow,
  studentId: string
) {
  const submittedLogsResult = await supabase
    .from("student_attempts_log")
    .select("id, quizid, student_id, studentname, score, max_score, attempt_number, subjectid, sectionid, submitted_at, created_at")
    .eq("quizid", quiz.id)
    .eq("student_id", studentId)
    .eq("is_submitted", true);

  const submittedLogs = (submittedLogsResult.data ?? []) as AttemptLookupRow[];
  if (
    submittedLogsResult.error &&
    !String(submittedLogsResult.error.message ?? "").toLowerCase().includes("student_attempts_log")
  ) {
    throw new Error(submittedLogsResult.error.message);
  }

  if (submittedLogs.length === 0) {
    const deleteSummary = await supabase
      .from("student_attempts")
      .delete()
      .eq("quizid", quiz.id)
      .eq("student_id", studentId);
    const deleteSummaryMessage = String(deleteSummary.error?.message ?? "");
    if (deleteSummary.error && !deleteSummaryMessage.toLowerCase().includes("student_attempts")) {
      throw new Error(deleteSummary.error.message);
    }
    return null;
  }

  if (quiz.save_best_only !== false) {
    const bestLog = pickBestLog(submittedLogs);
    if (!bestLog) return null;

    const summaryPayload = {
      quizid: quiz.id,
      student_id: studentId,
      studentname: bestLog.studentname ?? "",
      score: bestLog.score ?? null,
      max_score: bestLog.max_score ?? null,
      attempt_number: bestLog.attempt_number ?? 1,
      subjectid: String(bestLog.subjectid ?? quiz.subjectid ?? "").trim() || null,
      sectionid: String(bestLog.sectionid ?? quiz.sectionid ?? "").trim() || null,
    };

    const updateSummary = await supabase
      .from("student_attempts")
      .update(summaryPayload)
      .eq("quizid", quiz.id)
      .eq("student_id", studentId)
      .select("id")
      .maybeSingle();

    const updateSummaryMessage = String(updateSummary.error?.message ?? "");
    if (updateSummary.error && !updateSummaryMessage.toLowerCase().includes("student_attempts")) {
      throw new Error(updateSummary.error.message);
    }

    if (!updateSummary.data && !updateSummary.error) {
      const insertSummary = await supabase.from("student_attempts").insert(summaryPayload);
      const insertSummaryMessage = String(insertSummary.error?.message ?? "");
      if (insertSummary.error && !insertSummaryMessage.toLowerCase().includes("student_attempts")) {
        throw new Error(insertSummary.error.message);
      }
    }

    return bestLog;
  }

  const deleteExisting = await supabase
    .from("student_attempts")
    .delete()
    .eq("quizid", quiz.id)
    .eq("student_id", studentId);
  const deleteExistingMessage = String(deleteExisting.error?.message ?? "");
  if (deleteExisting.error && !deleteExistingMessage.toLowerCase().includes("student_attempts")) {
    throw new Error(deleteExisting.error.message);
  }

  const insertPayload = submittedLogs.map((row) => ({
    quizid: quiz.id,
    student_id: studentId,
    studentname: row.studentname ?? "",
    score: row.score ?? null,
    max_score: row.max_score ?? null,
    attempt_number: row.attempt_number ?? 1,
    subjectid: String(row.subjectid ?? quiz.subjectid ?? "").trim() || null,
    sectionid: String(row.sectionid ?? quiz.sectionid ?? "").trim() || null,
  }));

  const insertAttempts = await supabase.from("student_attempts").insert(insertPayload);
  const insertAttemptsMessage = String(insertAttempts.error?.message ?? "");
  if (insertAttempts.error && !insertAttemptsMessage.toLowerCase().includes("student_attempts")) {
    throw new Error(insertAttempts.error.message);
  }

  return pickBestLog(submittedLogs);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const teacherId = await getTeacherId();
  if (!teacherId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attemptId } = await context.params;
  const normalizedAttemptId = String(attemptId ?? "").trim();
  if (!normalizedAttemptId) {
    return NextResponse.json({ error: "Attempt ID is required." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const hasScore = body.score !== undefined && body.score !== null && String(body.score).trim() !== "";
  const hasMaxScore = body.maxScore !== undefined && body.maxScore !== null && String(body.maxScore).trim() !== "";
  const hasSection = body.sectionId !== undefined && body.sectionId !== null && String(body.sectionId).trim() !== "";
  const hasQuizId = body.quizId !== undefined && body.quizId !== null && String(body.quizId).trim() !== "";
  const hasAnswers = body.answers !== undefined && body.answers !== null && typeof body.answers === "object";
  const forceReopen = body.forceReopen === true;
  if (!hasScore && !hasSection && !hasMaxScore && !hasQuizId && !hasAnswers && !forceReopen) {
    return NextResponse.json({ error: "At least one field to update is required." }, { status: 400 });
  }

  const supabase = getSupabase();

  const attemptLogResult = await supabase
    .from("student_attempts_log")
    .select("id, quizid, student_id, studentname, score, max_score, attempt_number, subjectid, sectionid, submitted_at, created_at")
    .eq("id", normalizedAttemptId)
    .maybeSingle();

  let attempt = (attemptLogResult.data ?? null) as AttemptLookupRow | null;
  let attemptSource: "log" | "summary" = "log";
  const attemptError = attemptLogResult.error;

  if (attemptError) {
    const message = String(attemptError.message ?? "");
    if (!message.toLowerCase().includes("student_attempts_log")) {
      return NextResponse.json({ error: message || "Failed to load attempt." }, { status: 500 });
    }
  }

  if (!attempt) {
    const summaryResult = await supabase
      .from("student_attempts")
      .select("id, quizid, student_id, studentname, score, max_score, attempt_number, subjectid, sectionid, created_at")
      .eq("id", normalizedAttemptId)
      .maybeSingle();
    if (summaryResult.error) {
      return NextResponse.json({ error: summaryResult.error.message }, { status: 500 });
    }
    attempt = (summaryResult.data ?? null) as AttemptLookupRow | null;
    attemptSource = "summary";
  }

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found in logs or summary attempts." }, { status: 404 });
  }

  const ownerResult = await supabase
    .from("quiztbl")
    .select("id, teacherid, save_best_only, subjectid, sectionid")
    .eq("id", attempt.quizid)
    .maybeSingle();

  const quiz = (ownerResult.data ?? null) as QuizOwnerRow | null;
  if (ownerResult.error) {
    return NextResponse.json({ error: ownerResult.error.message }, { status: 500 });
  }
  if (!quiz || String(quiz.teacherid ?? "") !== teacherId) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  if (forceReopen) {
    if (attemptSource !== "log") {
      return NextResponse.json(
        { error: "Force reopen is only available for attempts stored in student_attempts_log." },
        { status: 400 }
      );
    }
    const studentId = String(attempt.student_id ?? "").trim();
    if (!studentId) {
      return NextResponse.json({ error: "This attempt is missing a student ID." }, { status: 400 });
    }

    const existingOpenRes = await supabase
      .from("student_attempts_log")
      .select("id, student_id")
      .eq("quizid", String(attempt.quizid ?? ""))
      .eq("is_submitted", false);
    const existingOpenErr = String(existingOpenRes.error?.message ?? "");
    if (existingOpenErr && !existingOpenErr.toLowerCase().includes("student_attempts_log")) {
      return NextResponse.json({ error: existingOpenErr }, { status: 500 });
    }
    const conflictingOpenIds = ((existingOpenRes.data ?? []) as Array<{ id?: string | null; student_id?: string | null }>)
      .filter((row) => String(row.id ?? "").trim() && String(row.id ?? "").trim() !== normalizedAttemptId)
      .filter((row) => String(row.student_id ?? "").trim() === studentId)
      .map((row) => String(row.id ?? "").trim());
    if (conflictingOpenIds.length > 0) {
      const deleteOpen = await supabase
        .from("student_attempts_log")
        .delete()
        .in("id", conflictingOpenIds);
      if (deleteOpen.error) {
        return NextResponse.json({ error: deleteOpen.error.message }, { status: 500 });
      }
    }

    const reopenRes = await supabase
      .from("student_attempts_log")
      .update({
        is_submitted: false,
        submitted_at: null,
        started_at: new Date().toISOString(),
      })
      .eq("id", normalizedAttemptId)
      .select("id, quizid")
      .maybeSingle();
    if (reopenRes.error) {
      return NextResponse.json({ error: reopenRes.error.message }, { status: 500 });
    }

    try {
      await syncStudentAttemptsForQuiz(supabase, quiz, studentId);
    } catch (syncError) {
      return NextResponse.json(
        { error: syncError instanceof Error ? syncError.message : "Failed to sync attempt summary." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      reopened: true,
      attempt: {
        id: normalizedAttemptId,
        quizid: String(reopenRes.data?.quizid ?? attempt.quizid ?? ""),
      },
    });
  }

  let finalQuizId = attempt.quizid;
  let syncQuiz = quiz;
  if (hasQuizId) {
    const requestedQuizId = String(body.quizId).trim();
    if (requestedQuizId === "") {
      return NextResponse.json({ error: "Quiz ID cannot be empty." }, { status: 400 });
    }
    finalQuizId = requestedQuizId;

    // Ensure requested quiz belongs to this teacher
    const newQuizResult = await supabase
      .from("quiztbl")
      .select("id, teacherid, save_best_only, subjectid, sectionid")
      .eq("id", requestedQuizId)
      .maybeSingle();

    if (newQuizResult.error) {
      return NextResponse.json({ error: newQuizResult.error.message }, { status: 500 });
    }
    const newQuiz = (newQuizResult.data ?? null) as QuizOwnerRow | null;
    if (!newQuiz || String(newQuiz.teacherid ?? "") !== teacherId) {
      return NextResponse.json({ error: "Selected quiz not found." }, { status: 404 });
    }
    syncQuiz = newQuiz;
  }

  const rawScore = hasScore ? Number(body.score) : Number(attempt.score ?? 0);
  if (hasScore && (!Number.isFinite(rawScore) || rawScore < 0)) {
    return NextResponse.json({ error: "A valid score is required." }, { status: 400 });
  }

  const rawMaxScore = hasMaxScore ? Number(body.maxScore) : Number(attempt.max_score ?? 0);
  if (hasMaxScore && (!Number.isFinite(rawMaxScore) || rawMaxScore < 0)) {
    return NextResponse.json({ error: "A valid max score is required." }, { status: 400 });
  }

  const effectiveMaxScore = hasMaxScore ? rawMaxScore : Number(attempt.max_score ?? 0);
  if (hasScore && effectiveMaxScore > 0 && rawScore > effectiveMaxScore) {
    return NextResponse.json(
      { error: `Score cannot be greater than ${Number(effectiveMaxScore)}.` },
      { status: 400 }
    );
  }

  let nextSectionId: string | null = hasQuizId ? String(syncQuiz.sectionid ?? "").trim() || null : null;
  if (hasSection) {
    nextSectionId = String(body.sectionId).trim() || null;
  }
  if (nextSectionId) {
    const sectionCheck = await supabase.from("sections").select("id").eq("id", nextSectionId).maybeSingle();
    if (sectionCheck.error) {
      return NextResponse.json({ error: sectionCheck.error.message }, { status: 500 });
    }
    if (!sectionCheck.data) {
      return NextResponse.json({ error: "Selected section was not found." }, { status: 400 });
    }
  }

  const nextScore = hasScore ? Number(rawScore) : Number(attempt.score ?? 0);
  const nextMaxScore = hasMaxScore ? Number(rawMaxScore) : Number(attempt.max_score ?? 0);
  const nextSubjectId = hasQuizId
    ? String(syncQuiz.subjectid ?? "").trim() || null
    : String(attempt.subjectid ?? "").trim() || null;
  const logPatch: {
    score?: number;
    max_score?: number;
    sectionid?: string | null;
    subjectid?: string | null;
    answers?: unknown;
    quizid?: string;
  } = {};
  if (hasScore) logPatch.score = nextScore;
  if (hasMaxScore) logPatch.max_score = nextMaxScore;
  if (hasQuizId || hasSection) logPatch.sectionid = nextSectionId;
  if (hasQuizId) logPatch.subjectid = nextSubjectId;
  if (hasAnswers) logPatch.answers = body.answers;
  if (hasQuizId) logPatch.quizid = finalQuizId;

  let updatedAnswers: unknown = body.answers ?? null;
  if (attemptSource === "log") {
    const updateLog = await supabase
      .from("student_attempts_log")
      .update(logPatch)
      .eq("id", normalizedAttemptId)
      .select("id, score, max_score, subjectid, sectionid, answers, quizid")
      .maybeSingle();

    if (updateLog.error) {
      return NextResponse.json({ error: updateLog.error.message }, { status: 500 });
    }
    updatedAnswers = updateLog.data?.answers ?? body.answers ?? null;
  } else {
    if (hasAnswers) {
      return NextResponse.json(
        { error: "Answer updates require the student_attempts_log table for this attempt." },
        { status: 400 }
      );
    }
    const summaryPatch: {
      score?: number;
      max_score?: number;
      sectionid?: string | null;
      subjectid?: string | null;
      quizid?: string;
    } = {};
    if (hasScore) summaryPatch.score = nextScore;
    if (hasMaxScore) summaryPatch.max_score = nextMaxScore;
    if (hasQuizId || hasSection) summaryPatch.sectionid = nextSectionId;
    if (hasQuizId) summaryPatch.subjectid = nextSubjectId;
    if (hasQuizId) summaryPatch.quizid = finalQuizId;
    const updateSummary = await supabase
      .from("student_attempts")
      .update(summaryPatch)
      .eq("id", normalizedAttemptId)
      .select("id, score, max_score, subjectid, sectionid, quizid")
      .maybeSingle();
    if (updateSummary.error) {
      return NextResponse.json({ error: updateSummary.error.message }, { status: 500 });
    }
    updatedAnswers = null;
  }

  const studentId = String(attempt.student_id ?? "").trim();
  if (studentId && attemptSource === "log") {
    try {
      const bestLog = await syncStudentAttemptsForQuiz(supabase, syncQuiz, studentId);
      if (bestLog) {
        await supabase
          .from("quiztbl")
          .update({
            score: bestLog.score ?? nextScore,
            studentname: bestLog.studentname ?? attempt.studentname ?? "",
          })
          .eq("id", finalQuizId);
      }

      if (hasQuizId && attempt.quizid !== finalQuizId) {
        const previousQuiz = quiz;
        const previousBestLog = await syncStudentAttemptsForQuiz(supabase, previousQuiz, studentId);
        if (previousBestLog) {
          await supabase
            .from("quiztbl")
            .update({
              score: previousBestLog.score ?? null,
              studentname: previousBestLog.studentname ?? "",
            })
            .eq("id", previousQuiz.id);
        }
      }
    } catch (syncError) {
      return NextResponse.json(
        { error: syncError instanceof Error ? syncError.message : "Failed to sync attempt summary." },
        { status: 500 }
      );
    }
  } else if (studentId && attemptSource === "summary") {
    await supabase
      .from("quiztbl")
      .update({
        score: nextScore,
        studentname: attempt.studentname ?? "",
      })
      .eq("id", finalQuizId);
  }

  return NextResponse.json({
    ok: true,
    attempt: {
      id: normalizedAttemptId,
      quizid: finalQuizId,
      score: nextScore,
      max_score: nextMaxScore ?? attempt.max_score ?? null,
      subjectid: nextSubjectId,
      sectionid: nextSectionId,
      answers: updatedAnswers,
      source: attemptSource,
    },
  });
}
