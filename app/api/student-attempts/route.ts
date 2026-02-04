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
  };

  const { quizId, studentName, studentId, score, maxScore, attemptNumber, attemptId, answers } = body;

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
    .select("subjectid, sectionid, time_limit_minutes")
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
        return NextResponse.json({ error: "Invalid attempt" }, { status: 400 });
      }
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

      const { data: updatedRow, error: logError } = await supabase
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
      if (logError?.message && !logError.message.toLowerCase().includes("student_attempts_log")) {
        return NextResponse.json({ error: logError.message }, { status: 500 });
      }
      logUpdated = !!updatedRow;
    }
  }

  // Check if this student already has an attempt record for this quiz
  const { data: existingAttempt } = await supabase
    .from("student_attempts")
    .select("*")
    .eq("quizid", quizId)
    .eq("student_id", studentId)
    .maybeSingle();

  let data;
  let error;

  if (existingAttempt) {
    // Update existing record only if new score is higher
    if (score > existingAttempt.score) {
      const result = await supabase
        .from("student_attempts")
        .update({
          score,
          studentname: studentName,
          attempt_number: attemptNumber,
          max_score: maxScore,
          subjectid: quizData.subjectid,
          sectionid: quizData.sectionid,
        })
        .eq("id", existingAttempt.id)
        .select()
        .single();
      
      data = result.data;
      error = result.error;
    } else {
      // Return existing record if score is not higher
      data = existingAttempt;
      error = null;
    }
  } else {
    // Insert new record if first attempt
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

  // Best-effort log insert for every submission (ensures data even if update path fails)
  const insertLog = await supabase
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
  const logSaved = !insertLog.error;
  if (!logSaved) {
    console.error("student_attempts_log insert failed:", insertLog.error);
    if (!insertLog.error?.message.toLowerCase().includes("student_attempts_log")) {
      return NextResponse.json({ error: insertLog.error.message }, { status: 500 });
    }
  } else {
    console.log("student_attempts_log insert ok for quiz:", quizId, "student:", studentId);
  }

  return NextResponse.json({ ok: true, best: data, logSaved });
}

