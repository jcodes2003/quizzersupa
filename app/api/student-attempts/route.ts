import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";

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

  const { quizId, studentName, studentId, score, maxScore, attemptNumber, attemptId, answers } = body;
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

  // Get quiz metadata including sectionid and subjectid
  const { data: quizData } = await supabase
    .from("quiztbl")
    .select("subjectid, sectionid, time_limit_minutes, save_best_only")
    .eq("id", quizId)
    .single();

  if (!quizData) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
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
      if (attemptRow.quizid !== quizId || attemptRow.student_id !== studentId) {
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
    const { data: firstAttempt } = await supabase
      .from("student_attempts")
      .select("*")
      .eq("quizid", quizId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstAttempt) {
      if (score > firstAttempt.score) {
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
