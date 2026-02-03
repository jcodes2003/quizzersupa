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

  // Get the count of attempts for this student on this quiz
  const { count, error } = await supabase
    .from("student_attempts")
    .select("*", { count: "exact" })
    .eq("quizid", quizId)
    .eq("student_id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ attemptCount: count ?? 0 });
}
