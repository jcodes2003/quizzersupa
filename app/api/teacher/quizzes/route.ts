import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../lib/teacher-db-auth";
import { getSupabase } from "../../../lib/supabase-server";

export async function GET() {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("quiztbl")
    .select("id, teacherid, subjectid, quizcode, sectionid, period, quizname")
    .eq("teacherid", teacherId)
    .order("quizcode");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

function generateQuizCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(request: NextRequest) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { subjectId?: string; sectionId?: string; period?: string; quizname?: string };
  const { subjectId, sectionId, period, quizname } = body;
  if (!subjectId?.trim() || !sectionId?.trim()) {
    return NextResponse.json({ error: "subjectId and sectionId required" }, { status: 400 });
  }
  const supabase = getSupabase();
  let quizcode = generateQuizCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: existing } = await supabase.from("quiztbl").select("id").eq("quizcode", quizcode).limit(1).maybeSingle();
    if (!existing) break;
    quizcode = generateQuizCode();
  }
  const { data, error } = await supabase
    .from("quiztbl")
    .insert({
      teacherid: teacherId,
      subjectid: subjectId.trim(),
      quizcode,
      sectionid: sectionId.trim(),
      period: (period ?? "").toString().trim(),
      quizname: (quizname ?? "").toString().trim(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
