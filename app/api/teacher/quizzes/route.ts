import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../lib/teacher-db-auth";
import { getSupabase } from "../../../lib/supabase-server";

type AssessmentType = "quiz" | "exam";

function normalizeAssessmentType(value: unknown): AssessmentType {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "exam" || raw === "examination" ? "exam" : "quiz";
}

export async function GET() {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  let data: Record<string, unknown>[] | null = null;
  let error: { message: string } | null = null;

  const full = await supabase
    .from("quiztbl")
    .select("id, teacherid, subjectid, quizcode, sectionid, period, quizname, assessment_type, time_limit_minutes, allow_retake, max_attempts, save_best_only, source_quiz_id")
    .eq("teacherid", teacherId)
    .order("created_at", { ascending: false });
  data = (full.data ?? null) as Record<string, unknown>[] | null;
  error = (full.error ?? null) as { message: string } | null;

  // Backward compatibility: if assessment_type isn't migrated yet, retry without it.
  if (error?.message?.toLowerCase().includes("assessment_type")) {
    const minimal = await supabase
      .from("quiztbl")
      .select("id, teacherid, subjectid, quizcode, sectionid, period, quizname, time_limit_minutes, allow_retake, max_attempts, save_best_only, source_quiz_id")
      .eq("teacherid", teacherId)
      .order("created_at", { ascending: false });
    data = (minimal.data ?? null) as Record<string, unknown>[] | null;
    error = (minimal.error ?? null) as { message: string } | null;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((q) => ({
    ...q,
    assessment_type: normalizeAssessmentType((q as { assessment_type?: unknown }).assessment_type),
  }));
  return NextResponse.json(rows);
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
    assessmentType?: string;
    timeLimitMinutes?: number | null;
    allowRetake?: boolean;
    maxAttempts?: number | null;
    saveBestOnly?: boolean;
  };
  const { subjectId, sectionId, period, quizname, assessmentType, timeLimitMinutes, allowRetake, maxAttempts } = body;
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
  const insertRow: Record<string, unknown> = {
    teacherid: teacherId,
    subjectid: subjectIdStr,
    quizcode,
    sectionid: sectionIdStr,
    period: (period ?? "").toString().trim(),
    quizname: (quizname ?? "").toString().trim(),
    assessment_type: normalizeAssessmentType(assessmentType),
    time_limit_minutes: Number.isFinite(timeLimitMinutes) ? timeLimitMinutes : null,
    allow_retake: Boolean(allowRetake),
    max_attempts: Number.isFinite(maxAttempts) ? maxAttempts : 1,
    save_best_only: body.saveBestOnly !== false,
  };
  let insertRes = await supabase
    .from("quiztbl")
    .insert(insertRow)
    .select()
    .single();
  if (insertRes.error?.message?.toLowerCase().includes("assessment_type")) {
    delete insertRow.assessment_type;
    insertRes = await supabase
      .from("quiztbl")
      .insert(insertRow)
      .select()
      .single();
  }
  const data = insertRes.data;
  const error = insertRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
