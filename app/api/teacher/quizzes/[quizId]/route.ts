import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../../lib/teacher-db-auth";
import { getSupabase } from "../../../../lib/supabase-server";

async function ensureQuizBelongsToTeacher(quizId: string, teacherId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("quiztbl")
    .select("id")
    .eq("id", quizId)
    .eq("teacherid", teacherId)
    .single();
  return !!data;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ quizId: string }> }
) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { quizId } = await params;

  const ok = await ensureQuizBelongsToTeacher(quizId, teacherId);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    subjectId?: string;
    sectionId?: string;
    period?: string;
    quizname?: string;
    quizcode?: string;
    timeLimitMinutes?: number | null;
    allowRetake?: boolean;
    maxAttempts?: number | null;
    saveBestOnly?: boolean;
  };

  const update: Record<string, unknown> = {};

  if (typeof body.subjectId === "string" && body.subjectId.trim()) update.subjectid = body.subjectId.trim();
  if (typeof body.sectionId === "string" && body.sectionId.trim()) update.sectionid = body.sectionId.trim();
  if (typeof body.period === "string") update.period = body.period.trim();
  if (typeof body.quizname === "string") update.quizname = body.quizname.trim();

  if (typeof body.quizcode === "string" && body.quizcode.trim()) {
    const code = body.quizcode.trim().toUpperCase();
    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from("quiztbl")
      .select("id")
      .eq("quizcode", code)
      .neq("id", quizId)
      .maybeSingle();
    if (existing?.id) {
      return NextResponse.json({ error: "Quiz code already in use" }, { status: 400 });
    }
    update.quizcode = code;
  }

  if (body.timeLimitMinutes !== undefined) {
    const t = body.timeLimitMinutes;
    update.time_limit_minutes = t === null ? null : Number.isFinite(t) ? t : null;
  }
  if (body.allowRetake !== undefined) update.allow_retake = Boolean(body.allowRetake);
  if (body.maxAttempts !== undefined) {
    const m = body.maxAttempts;
    update.max_attempts = m === null ? null : Number.isFinite(m) ? m : null;
  }
  if (body.saveBestOnly !== undefined) update.save_best_only = Boolean(body.saveBestOnly);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("quiztbl")
    .update(update)
    .eq("id", quizId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
