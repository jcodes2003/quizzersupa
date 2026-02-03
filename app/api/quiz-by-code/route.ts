import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim()?.toUpperCase();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const supabase = getSupabase();

  const { data: quizRow, error: quizError } = await supabase
    .from("quiztbl")
    .select("id, quizcode, subjectid, sectionid")
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

  const { data: questions, error: qError } = await supabase
    .from("questiontbl")
    .select("*")
    .eq("quizid", quizRow.id)
    .order("id");

  if (qError) return NextResponse.json({ error: qError.message }, { status: 500 });

  return NextResponse.json({
    quiz: {
      id: quizRow.id,
      quizcode: quizRow.quizcode,
      subjectid: quizRow.subjectid,
      sectionid: quizRow.sectionid,
      sectionName,
    },
    questions: questions ?? [],
  });
}
