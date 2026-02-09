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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ quizId: string }> }
) {
  try {
    const teacherId = await getTeacherId();
    if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { quizId } = await params;

    const ok = await ensureQuizBelongsToTeacher(quizId, teacherId);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await request.json()) as {
      action?: "duplicate" | "assign";
      sectionId?: string;
      period?: string;
      quizname?: string;
    };

    const supabase = getSupabase();
    const { data: quizRow, error: quizErr } = await supabase
      .from("quiztbl")
      .select("*")
      .eq("id", quizId)
      .single();
    if (quizErr || !quizRow) return NextResponse.json({ error: quizErr?.message ?? "Quiz not found" }, { status: 404 });

    const action = body.action;
    if (action !== "duplicate" && action !== "assign") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const sectionId = body.sectionId !== undefined && body.sectionId !== null ? String(body.sectionId).trim() : "";
    if (!sectionId) return NextResponse.json({ error: "sectionId required" }, { status: 400 });

    const period = (body.period ?? "").toString().trim();
    const baseQuizname = (quizRow as { quizname?: string | null }).quizname ?? "";
    const quizname = (body.quizname ?? baseQuizname).toString().trim();

    // Create new quiz code
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let quizcode = "";
    for (let i = 0; i < 8; i++) {
      quizcode += chars[Math.floor(Math.random() * chars.length)];
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data: existing } = await supabase.from("quiztbl").select("id").eq("quizcode", quizcode).limit(1).maybeSingle();
      if (!existing) break;
      quizcode = "";
      for (let i = 0; i < 8; i++) {
        quizcode += chars[Math.floor(Math.random() * chars.length)];
      }
    }

    const sourceQuizId = (quizRow as { source_quiz_id?: string | null }).source_quiz_id ?? quizRow.id;
    const insertRow: Record<string, unknown> = {
      teacherid: (quizRow as { teacherid: string }).teacherid,
      subjectid: (quizRow as { subjectid: string }).subjectid,
      sectionid: sectionId,
      period,
      quizname,
      quizcode,
      time_limit_minutes: (quizRow as { time_limit_minutes?: number | null }).time_limit_minutes ?? null,
      allow_retake: Boolean((quizRow as { allow_retake?: boolean | null }).allow_retake),
      max_attempts: (quizRow as { max_attempts?: number | null }).max_attempts ?? 1,
      save_best_only: (quizRow as { save_best_only?: boolean | null }).save_best_only !== false,
      source_quiz_id: action === "assign" ? sourceQuizId : null,
    };

    const { data: newQuiz, error: insertErr } = await supabase
      .from("quiztbl")
      .insert(insertRow)
      .select()
      .single();
    if (insertErr || !newQuiz) return NextResponse.json({ error: insertErr?.message ?? "Failed to create quiz" }, { status: 500 });

    if (action === "duplicate") {
      const { data: questions, error: qErr } = await supabase
        .from("questiontbl")
        .select("*")
        .eq("quizid", sourceQuizId);
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
      if (questions && questions.length > 0) {
        const inserts = questions.map((q) => ({
          quizid: newQuiz.id,
          question: q.question,
          quiztype: q.quiztype,
          answerkey: q.answerkey,
          options: q.options,
          score: q.score ?? 1,
          image_url: (q as { image_url?: string | null }).image_url ?? null,
        }));
        const { error: insertQErr } = await supabase.from("questiontbl").insert(inserts);
        if (insertQErr) return NextResponse.json({ error: insertQErr.message }, { status: 500 });
      }
    }

    return NextResponse.json(newQuiz);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ quizId: string }> }
) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { quizId } = await params;

  const ok = await ensureQuizBelongsToTeacher(quizId, teacherId);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getSupabase();
  // If this is a source quiz, delete assigned quizzes and their attempts first.
  const { data: relatedQuizzes } = await supabase
    .from("quiztbl")
    .select("id")
    .eq("source_quiz_id", quizId);
  const relatedIds = Array.isArray(relatedQuizzes)
    ? relatedQuizzes.map((q) => String((q as { id?: string }).id)).filter(Boolean)
    : [];
  const quizIds = [quizId, ...relatedIds];

  const { error: logErr } = await supabase.from("student_attempts_log").delete().in("quizid", quizIds);
  if (logErr && !logErr.message.toLowerCase().includes("student_attempts_log")) {
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }
  const { error: attemptsErr } = await supabase.from("student_attempts").delete().in("quizid", quizIds);
  if (attemptsErr && !attemptsErr.message.toLowerCase().includes("student_attempts")) {
    return NextResponse.json({ error: attemptsErr.message }, { status: 500 });
  }

  // Questions belong to the source quiz id (quizId).
  const { error: qErr } = await supabase.from("questiontbl").delete().eq("quizid", quizId);
  if (qErr && !qErr.message.toLowerCase().includes("questiontbl")) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  if (relatedIds.length > 0) {
    const { error: relErr } = await supabase.from("quiztbl").delete().in("id", relatedIds);
    if (relErr) return NextResponse.json({ error: relErr.message }, { status: 500 });
  }

  const { error } = await supabase.from("quiztbl").delete().eq("id", quizId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
