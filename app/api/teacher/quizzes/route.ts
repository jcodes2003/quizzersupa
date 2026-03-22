import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../lib/teacher-db-auth";
import { noStoreJson } from "../../../lib/no-store";
import { getSupabase } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

async function isTeacherQuizNameTaken(teacherId: string, quizName: string, excludeQuizId?: string): Promise<boolean> {
  const normalized = normalizeQuizName(quizName);
  if (!normalized) return false;
  const supabase = getSupabase();
  const res = await supabase.from("quiztbl").select("id, quizname").eq("teacherid", teacherId);
  if (res.error) throw res.error;
  return ((res.data ?? []) as Array<{ id?: string | null; quizname?: string | null }>).some((row) => {
    const rowId = String(row.id ?? "").trim();
    if (excludeQuizId && rowId === excludeQuizId) return false;
    return normalizeQuizName(row.quizname) === normalized;
  });
}

export async function GET() {
  const teacherId = await getTeacherId();
  if (!teacherId) return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  let data: Record<string, unknown>[] | null = null;
  let error: { message: string } | null = null;

  const full = await supabase
    .from("quiztbl")
    .select("id, teacherid, subjectid, quizcode, sectionid, period, quizname, assessment_type, time_limit_minutes, allow_retake, max_attempts, save_best_only, source_quiz_id, submission_deadline, submissions_open")
    .eq("teacherid", teacherId)
    .order("created_at", { ascending: false });
  data = (full.data ?? null) as Record<string, unknown>[] | null;
  error = (full.error ?? null) as { message: string } | null;

  // Backward compatibility: retry with a reduced select if newer columns are not migrated yet.
  if (
    error?.message &&
    (error.message.toLowerCase().includes("assessment_type") ||
      error.message.toLowerCase().includes("submission_deadline") ||
      error.message.toLowerCase().includes("submissions_open"))
  ) {
    const minimal = await supabase
      .from("quiztbl")
      .select("id, teacherid, subjectid, quizcode, sectionid, period, quizname, time_limit_minutes, allow_retake, max_attempts, save_best_only, source_quiz_id")
      .eq("teacherid", teacherId)
      .order("created_at", { ascending: false });
    data = (minimal.data ?? null) as Record<string, unknown>[] | null;
    error = (minimal.error ?? null) as { message: string } | null;
  }

  if (error) return noStoreJson({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((q) => ({
    ...q,
    assessment_type: normalizeAssessmentType((q as { assessment_type?: unknown }).assessment_type),
  }));
  return noStoreJson(rows);
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
    submissionDeadline?: string | null;
    submissionsOpen?: boolean;
  };
  const {
    subjectId,
    sectionId,
    period,
    quizname,
    assessmentType,
    timeLimitMinutes,
    allowRetake,
    maxAttempts,
    submissionDeadline,
    submissionsOpen,
  } = body;
  const subjectIdStr = subjectId == null ? "" : String(subjectId).trim();
  const sectionIdStr = sectionId == null ? "" : String(sectionId).trim();
  if (!subjectIdStr || !sectionIdStr) {
    return NextResponse.json({ error: "subjectId and sectionId required" }, { status: 400 });
  }
  const quizNameTrimmed = String(quizname ?? "").trim();
  if (!quizNameTrimmed) {
    return NextResponse.json({ error: "Quiz name required" }, { status: 400 });
  }
  const supabase = getSupabase();
  if (await isTeacherQuizNameTaken(teacherId, quizNameTrimmed)) {
    return NextResponse.json({ error: "Quiz name already taken. Please rename the quiz." }, { status: 409 });
  }

  let subjectSemester: string | null = null;
  let subjectYearLevel: number | null = null;
  const subjectMeta = await supabase
    .from("subjecttbl")
    .select("semester, year_level")
    .eq("id", subjectIdStr)
    .maybeSingle();
  const subjectMetaMsg = (subjectMeta.error as { message?: string } | null)?.message ?? "";
  if (!subjectMetaMsg || (!subjectMetaMsg.toLowerCase().includes("semester") && !subjectMetaMsg.toLowerCase().includes("year_level"))) {
    const rawSemester = (subjectMeta.data as { semester?: unknown } | null)?.semester;
    const rawYear = (subjectMeta.data as { year_level?: unknown } | null)?.year_level;
    subjectSemester = typeof rawSemester === "string" && rawSemester.trim() ? rawSemester.trim() : null;
    const y = Number(rawYear);
    subjectYearLevel = Number.isFinite(y) ? Math.trunc(y) : null;
  }

  let quizcode = generateQuizCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: existing } = await supabase.from("quiztbl").select("id").eq("quizcode", quizcode).limit(1).maybeSingle();
    if (!existing) break;
    quizcode = generateQuizCode();
  }
  const insertRow: Record<string, unknown> = {
    teacherid: teacherId,
    subjectid: subjectIdStr,
    subject_semester: subjectSemester,
    subject_year_level: subjectYearLevel,
    quizcode,
    sectionid: sectionIdStr,
    period: normalizePeriod(period),
    quizname: quizNameTrimmed,
    assessment_type: normalizeAssessmentType(assessmentType),
    time_limit_minutes: parseOptionalInt(timeLimitMinutes),
    allow_retake: Boolean(allowRetake),
    max_attempts: parseOptionalInt(maxAttempts) ?? 1,
    save_best_only: body.saveBestOnly !== false,
    submission_deadline: parseDeadline(submissionDeadline),
    submissions_open: submissionsOpen !== false,
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
  const data = insertRes.data;
  const error = insertRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
