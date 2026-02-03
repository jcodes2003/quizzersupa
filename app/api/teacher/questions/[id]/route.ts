import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../../lib/teacher-db-auth";
import { getSupabase } from "../../../../lib/supabase-server";

async function getQuestionForTeacher(questionId: string, teacherId: string) {
  const supabase = getSupabase();
  const { data: q, error } = await supabase
    .from("questiontbl")
    .select("id, quizid, question, quiztype, options, answerkey, score")
    .eq("id", questionId)
    .single();
  if (error || !q?.quizid) return null;
  const { data: quiz } = await supabase
    .from("quiztbl")
    .select("id")
    .eq("id", q.quizid)
    .eq("teacherid", teacherId)
    .single();
  if (!quiz) return null;
  return q;
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const q = await getQuestionForTeacher(id, teacherId);
  if (!q) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const { error } = await supabase.from("questiontbl").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await getQuestionForTeacher(id, teacherId);
  if (!existing) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    question?: string;
    answerkey?: string;
    score?: number;
  };

  const supabase = getSupabase();
  const update: Record<string, unknown> = {};

  if (body.question !== undefined) {
    if (!body.question.trim()) {
      return NextResponse.json({ error: "question required" }, { status: 400 });
    }
    update.question = body.question.trim();
  }

  if (body.answerkey !== undefined) {
    const ak = String(body.answerkey ?? "").trim();
    if (!ak) {
      return NextResponse.json({ error: "answerkey required" }, { status: 400 });
    }
    if (existing.quiztype === "multiple_choice" && existing.options) {
      try {
        const opts = JSON.parse(existing.options as string) as unknown[];
        const optStrings = Array.isArray(opts) ? opts.map((o) => String(o).trim()) : [];
        if (!optStrings.includes(ak)) {
          return NextResponse.json(
            { error: "Answer key must be one of the options" },
            { status: 400 }
          );
        }
      } catch {
        // If options JSON is bad, still allow updating answerkey
      }
    }
    update.answerkey = ak;
  }

  if (body.score !== undefined) {
    const s = Number(body.score);
    if (!Number.isFinite(s) || s <= 0) {
      return NextResponse.json({ error: "score must be a positive number" }, { status: 400 });
    }
    update.score = s;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("questiontbl")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
