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
    .select("allow_retake, max_attempts")
    .eq("id", quizId)
    .maybeSingle();

  if (quizError) {
    return NextResponse.json({ error: quizError.message }, { status: 500 });
  }

  const allowRetake = Boolean((quizSettings as { allow_retake?: boolean | null })?.allow_retake);
  const maxAttempts = allowRetake
    ? (quizSettings as { max_attempts?: number | null })?.max_attempts ?? 2
    : 1;

  // Get the count of submitted attempts for this student on this quiz
  const { count, error } = await supabase
    .from("student_attempts_log")
    .select("*", { count: "exact" })
    .eq("quizid", quizId)
    .eq("student_id", studentId)
    .eq("is_submitted", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ attemptCount: count ?? 0, maxAttempts, allowRetake });
}
