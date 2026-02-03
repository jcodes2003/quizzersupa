import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";

export async function GET(request: NextRequest) {
  const quizId = request.nextUrl.searchParams.get("quizId");
  const studentName = request.nextUrl.searchParams.get("studentName");

  if (!quizId || !studentName) {
    return NextResponse.json({ error: "quizId and studentName required" }, { status: 400 });
  }

  const supabase = getSupabase();
  
  // Get the best score for this student on this quiz
  const { data, error } = await supabase
    .from("student_attempts")
    .select("score")
    .eq("quizid", quizId)
    .eq("studentname", studentName)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ score: data?.score ?? 0 });
}
