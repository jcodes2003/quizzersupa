import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../lib/teacher-db-auth";
import { getSupabase } from "../../../lib/supabase-server";

export async function GET() {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("quiztbl")
    .select("id, teacherid, subjectid, quizcode, sectionid, period, quizname, time_limit_minutes, allow_retake, max_attempts, save_best_only, source_quiz_id")
    .eq("teacherid", teacherId)
    .order("created_at", { ascending: false });
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
  const body = await request.json() as {
    subjectId?: string;
    sectionId?: string;
    period?: string;
    quizname?: string;
    timeLimitMinutes?: number | null;
    allowRetake?: boolean;
    maxAttempts?: number | null;
    saveBestOnly?: boolean;
  };
  const { subjectId, sectionId, period, quizname, timeLimitMinutes, allowRetake, maxAttempts } = body;
  const subjectIdStr = subjectId == null ? "" : String(subjectId).trim();
  const sectionIdStr = sectionId == null ? "" : String(sectionId).trim();
  if (!subjectIdStr || !sectionIdStr) {
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
      subjectid: subjectIdStr,
      quizcode,
      sectionid: sectionIdStr,
      period: (period ?? "").toString().trim(),
      quizname: (quizname ?? "").toString().trim(),
      time_limit_minutes: Number.isFinite(timeLimitMinutes) ? timeLimitMinutes : null,
      allow_retake: Boolean(allowRetake),
      max_attempts: Number.isFinite(maxAttempts) ? maxAttempts : 1,
      save_best_only: body.saveBestOnly !== false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
