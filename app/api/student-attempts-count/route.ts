import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const quizId = searchParams.get("quizId");
  const studentId = searchParams.get("studentId");

  if (!quizId || !studentId) {
    return NextResponse.json(
      { error: "quizId and studentId are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { data: quizSettings, error: quizError } = await supabase
    .from("quiztbl")
    .select("allow_retake, max_attempts, source_quiz_id")
    .eq("id", quizId)
    .maybeSingle();

  if (quizError) {
    return NextResponse.json({ error: quizError.message }, { status: 500 });
  }

  const rawMaxAttempts = (quizSettings as { max_attempts?: number | null })?.max_attempts ?? 1;
  const maxAttempts = Math.max(1, rawMaxAttempts);
  const allowRetake =
    Boolean((quizSettings as { allow_retake?: boolean | null })?.allow_retake) ||
    maxAttempts > 1;

  const sourceQuizId = (quizSettings as { source_quiz_id?: string | null })?.source_quiz_id ?? quizId;
  const { data: relatedQuizzes } = await supabase
    .from("quiztbl")
    .select("id")
    .or(`id.eq.${sourceQuizId},source_quiz_id.eq.${sourceQuizId}`);
  const quizIds = (relatedQuizzes ?? []).map((q) => (q as { id: string }).id);

  // Get the count of submitted attempts for this student on this quiz
  const { count, error } = await supabase
    .from("student_attempts_log")
    .select("*", { count: "exact" })
    .in("quizid", quizIds.length > 0 ? quizIds : [quizId])
    .eq("student_id", studentId)
    .eq("is_submitted", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ attemptCount: count ?? 0, maxAttempts, allowRetake });
}
