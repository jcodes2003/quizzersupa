import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../../lib/teacher-db-auth";
import { getSupabase } from "../../../../lib/supabase-server";

type AssessmentType = "quiz" | "exam";

function normalizeAssessmentType(value: unknown): AssessmentType {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "exam" || raw === "examination" ? "exam" : "quiz";
}

function parseOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

function normalizePeriod(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asInt = parseOptionalInt(trimmed);
    return asInt === null ? trimmed : asInt;
  }
  return null;
}

function parseDeadline(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeQuizName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function isTeacherQuizNameTakenInSection(
  teacherId: string,
  sectionId: string,
  quizName: string,
  excludeQuizId?: string
): Promise<boolean> {
  const normalized = normalizeQuizName(quizName);
  if (!normalized) return false;
  const supabase = getSupabase();
  const sectionIdTrimmed = String(sectionId ?? "").trim();
  if (!sectionIdTrimmed) return false;
  const res = await supabase
    .from("quiztbl")
    .select("id, quizname")
    .eq("teacherid", teacherId)
    .eq("sectionid", sectionIdTrimmed);
  if (res.error) throw res.error;
  return ((res.data ?? []) as Array<{ id?: string | null; quizname?: string | null }>).some((row) => {
    const rowId = String(row.id ?? "").trim();
    if (excludeQuizId && rowId === excludeQuizId) return false;
    return normalizeQuizName(row.quizname) === normalized;
  });
}

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
  const supabase = getSupabase();
  const currentQuizRes = await supabase
    .from("quiztbl")
    .select("id, sectionid")
    .eq("id", quizId)
    .maybeSingle();
  if (currentQuizRes.error) {
    return NextResponse.json({ error: currentQuizRes.error.message }, { status: 500 });
  }
  const currentSectionId = String((currentQuizRes.data as { sectionid?: string | null } | null)?.sectionid ?? "").trim();

  const body = (await request.json()) as {
    subjectId?: string;
    sectionId?: string;
    period?: string;
    quizname?: string;
    assessmentType?: string;
    quizcode?: string;
    timeLimitMinutes?: number | null;
    allowRetake?: boolean;
    maxAttempts?: number | null;
    saveBestOnly?: boolean;
    submissionDeadline?: string | null;
    submissionsOpen?: boolean;
  };

  const update: Record<string, unknown> = {};

  if (typeof body.subjectId === "string" && body.subjectId.trim()) update.subjectid = body.subjectId.trim();
  if (typeof body.sectionId === "string" && body.sectionId.trim()) update.sectionid = body.sectionId.trim();
  if (body.period !== undefined) update.period = normalizePeriod(body.period);
  if (typeof body.quizname === "string") {
    const nextQuizName = body.quizname.trim();
    if (!nextQuizName) {
      return NextResponse.json({ error: "Quiz name required" }, { status: 400 });
    }
    const targetSectionId =
      typeof body.sectionId === "string" && body.sectionId.trim() ? body.sectionId.trim() : currentSectionId;
    if (await isTeacherQuizNameTakenInSection(teacherId, targetSectionId, nextQuizName, quizId)) {
      return NextResponse.json({ error: "Quiz name already taken. Please rename the quiz." }, { status: 409 });
    }
    update.quizname = nextQuizName;
  }
  if (typeof body.assessmentType === "string") {
    update.assessment_type = normalizeAssessmentType(body.assessmentType);
  }

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
    update.time_limit_minutes = parseOptionalInt(body.timeLimitMinutes);
  }
  if (body.allowRetake !== undefined) update.allow_retake = Boolean(body.allowRetake);
  if (body.maxAttempts !== undefined) {
    update.max_attempts = parseOptionalInt(body.maxAttempts);
  }
  if (body.saveBestOnly !== undefined) update.save_best_only = Boolean(body.saveBestOnly);
  if (body.submissionDeadline !== undefined) {
    update.submission_deadline = parseDeadline(body.submissionDeadline);
  }
  if (body.submissionsOpen !== undefined) update.submissions_open = Boolean(body.submissionsOpen);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  let updateRes = await supabase
    .from("quiztbl")
    .update(update)
    .eq("id", quizId)
    .select()
    .single();
  if (
    updateRes.error?.message &&
    (updateRes.error.message.toLowerCase().includes("assessment_type") ||
      updateRes.error.message.toLowerCase().includes("submission_deadline") ||
      updateRes.error.message.toLowerCase().includes("submissions_open"))
  ) {
    delete update.assessment_type;
    delete update.submission_deadline;
    delete update.submissions_open;
    updateRes = await supabase
      .from("quiztbl")
      .update(update)
      .eq("id", quizId)
      .select()
      .single();
  }

  const data = updateRes.data;
  const error = updateRes.error;

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

    const basePeriod = normalizePeriod((quizRow as { period?: unknown }).period);
    const providedPeriod = normalizePeriod(body.period);
    const period = providedPeriod === null ? basePeriod : providedPeriod;
    const baseQuizname = (quizRow as { quizname?: string | null }).quizname ?? "";
    const quizname = (body.quizname ?? baseQuizname).toString().trim();
    if (!quizname) {
      return NextResponse.json({ error: "Quiz name required" }, { status: 400 });
    }
    if (await isTeacherQuizNameTakenInSection(teacherId, sectionId, quizname, quizId)) {
      return NextResponse.json({ error: "Quiz name already taken. Please rename the quiz." }, { status: 409 });
    }

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
      subject_semester: (quizRow as { subject_semester?: unknown }).subject_semester ?? null,
      subject_year_level: (quizRow as { subject_year_level?: unknown }).subject_year_level ?? null,
      sectionid: sectionId,
      period,
      quizname,
      assessment_type: normalizeAssessmentType((quizRow as { assessment_type?: string | null }).assessment_type),
      quizcode,
      time_limit_minutes: parseOptionalInt((quizRow as { time_limit_minutes?: unknown }).time_limit_minutes),
      allow_retake: Boolean((quizRow as { allow_retake?: boolean | null }).allow_retake),
      max_attempts: parseOptionalInt((quizRow as { max_attempts?: unknown }).max_attempts) ?? 1,
      save_best_only: (quizRow as { save_best_only?: boolean | null }).save_best_only !== false,
      submission_deadline: (quizRow as { submission_deadline?: string | null }).submission_deadline ?? null,
      submissions_open: (quizRow as { submissions_open?: boolean | null }).submissions_open !== false,
      source_quiz_id: action === "assign" ? sourceQuizId : null,
    };

    let insertRes = await supabase
      .from("quiztbl")
      .insert(insertRow)
      .select()
      .single();
    if (
      insertRes.error?.message &&
      (insertRes.error.message.toLowerCase().includes("assessment_type") ||
        insertRes.error.message.toLowerCase().includes("submission_deadline") ||
        insertRes.error.message.toLowerCase().includes("submissions_open") ||
        insertRes.error.message.toLowerCase().includes("subject_semester") ||
        insertRes.error.message.toLowerCase().includes("subject_year_level"))
    ) {
      delete insertRow.assessment_type;
      delete insertRow.submission_deadline;
      delete insertRow.submissions_open;
      delete insertRow.subject_semester;
      delete insertRow.subject_year_level;
      insertRes = await supabase
        .from("quiztbl")
        .insert(insertRow)
        .select()
        .single();
    }
    const newQuiz = insertRes.data;
    const insertErr = insertRes.error;
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
