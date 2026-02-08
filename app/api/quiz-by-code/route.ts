import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim()?.toUpperCase();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const supabase = getSupabase();

  const { data: quizRow, error: quizError } = await supabase
    .from("quiztbl")
    .select("id, quizcode, subjectid, sectionid, time_limit_minutes, allow_retake, max_attempts, source_quiz_id")
    .eq("quizcode", code)
    .maybeSingle();

  if (quizError) return NextResponse.json({ error: quizError.message }, { status: 500 });
  if (!quizRow) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  const { data: sectionRow } = await supabase
    .from("sections")
    .select("*")
    .eq("id", quizRow.sectionid)
    .maybeSingle();
  const sectionName = sectionRow
    ? String((sectionRow as Record<string, unknown>).sectionname ?? (sectionRow as Record<string, unknown>).name ?? "")
    : "";

  const sourceQuizId = (quizRow as { source_quiz_id?: string | null }).source_quiz_id ?? quizRow.id;
  const { data: questions, error: qError } = await supabase
    .from("questiontbl")
    .select("*")
    .eq("quizid", sourceQuizId)
    .order("id");

  if (qError) return NextResponse.json({ error: qError.message }, { status: 500 });

  const rawMaxAttempts = (quizRow as { max_attempts?: number | null }).max_attempts ?? 1;
  const maxAttempts = Math.max(1, rawMaxAttempts);
  const allowRetake =
    Boolean((quizRow as { allow_retake?: boolean | null }).allow_retake) ||
    maxAttempts > 1;

  return NextResponse.json({
    quiz: {
      id: quizRow.id,
      quizcode: quizRow.quizcode,
      subjectid: quizRow.subjectid,
      sectionid: quizRow.sectionid,
      time_limit_minutes: (quizRow as { time_limit_minutes?: number | null }).time_limit_minutes ?? null,
      allow_retake: allowRetake,
      max_attempts: maxAttempts,
      source_quiz_id: (quizRow as { source_quiz_id?: string | null }).source_quiz_id ?? null,
      sectionName,
    },
    questions: questions ?? [],
  });
}
