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
  };

  const { quizId, studentName, studentId, score, maxScore, attemptNumber } = body;

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
    .select("subjectid, sectionid")
    .eq("id", quizId)
    .single();

  if (!quizData) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
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

  return NextResponse.json(data);
}


