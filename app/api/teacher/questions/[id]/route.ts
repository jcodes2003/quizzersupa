import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../../lib/teacher-db-auth";
import { getSupabase } from "../../../../lib/supabase-server";

async function ensureQuestionQuizBelongsToTeacher(questionId: string, teacherId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data: q } = await supabase.from("questiontbl").select("quizid").eq("id", questionId).single();
  if (!q?.quizid) return false;
  const { data: quiz } = await supabase.from("quiztbl").select("id").eq("id", q.quizid).eq("teacherid", teacherId).single();
  return !!quiz;
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await ensureQuestionQuizBelongsToTeacher(id, teacherId);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const { error } = await supabase.from("questiontbl").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
