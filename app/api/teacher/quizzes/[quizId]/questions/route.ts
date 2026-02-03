import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../../../lib/teacher-db-auth";
import { getSupabase } from "../../../../../lib/supabase-server";

async function ensureQuizBelongsToTeacher(quizId: string, teacherId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase.from("quiztbl").select("id").eq("id", quizId).eq("teacherid", teacherId).single();
  return !!data;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ quizId: string }> }
) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { quizId } = await params;
  const ok = await ensureQuizBelongsToTeacher(quizId, teacherId);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("questiontbl")
    .select("*")
    .eq("quizid", quizId)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ quizId: string }> }
) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { quizId } = await params;
  const ok = await ensureQuizBelongsToTeacher(quizId, teacherId);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json() as {
    question?: string;
    quizType?: string;
    options?: string[];
    answerkey?: string;
    score?: number;
    questions?: Array<{
      question: string;
      quizType: string;
      options?: string[];
      answerkey?: string;
      score?: number;
    }>;
  };
  
  // Support both single question and batch creation
  const isBatch = Array.isArray(body.questions);
  const questionsToProcess = isBatch ? body.questions! : [{
    question: body.question!,
    quizType: body.quizType!,
    options: body.options,
    answerkey: body.answerkey,
    score: body.score,
  }];

  if (questionsToProcess.length === 0) {
    return NextResponse.json({ error: "At least one question required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const inserts: Record<string, unknown>[] = [];

  for (const q of questionsToProcess) {
    const { question, quizType, options, answerkey, score } = q;
    if (!question?.trim()) {
      return NextResponse.json({ error: "Each question must have text" }, { status: 400 });
    }
    const type = (quizType || "multiple_choice").trim();
    
    if (type === "multiple_choice") {
      const opts = Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : [];
      if (opts.length < 2) {
        return NextResponse.json({ error: "Multiple choice requires at least 2 options" }, { status: 400 });
      }
      if (!answerkey || typeof answerkey !== "string" || !answerkey.trim()) {
        return NextResponse.json({ error: "Answer key required for multiple choice" }, { status: 400 });
      }
      if (!opts.includes(answerkey.trim())) {
        return NextResponse.json({ error: "Answer key must be one of the options" }, { status: 400 });
      }
    }
    if ((type === "identification" || type === "long_answer" || type === "enumeration") && (!answerkey || typeof answerkey !== "string" || !answerkey.trim())) {
      return NextResponse.json({ error: `Answer key required for ${type.replace("_", " ")}` }, { status: 400 });
    }

    const insert: Record<string, unknown> = {
      quizid: quizId,
      question: question.trim(),
      quiztype: type,
      score: typeof score === "number" && score > 0 ? score : 1,
    };
    if (type === "multiple_choice" && Array.isArray(options)) {
      insert.answerkey = (answerkey ?? "").trim();
      insert.options = JSON.stringify(options.map((o) => String(o).trim()).filter(Boolean));
    } else if (type === "identification" || type === "long_answer" || type === "enumeration") {
      insert.answerkey = (answerkey ?? "").trim();
    }
    inserts.push(insert);
  }

  const { data, error } = await supabase
    .from("questiontbl")
    .insert(inserts)
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(isBatch ? data : data[0]);
}
