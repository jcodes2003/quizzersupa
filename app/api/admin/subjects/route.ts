import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../lib/admin-auth";
import { getSupabase } from "../../../lib/supabase-server";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function generateSubjectCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  let data: Array<Record<string, unknown>> | null = null;
  let error: { message: string } | null = null;

  const full = await supabase
    .from("subjecttbl")
    .select("id, subjectname, archived, year_level, semester, subject_code")
    .order("subjectname");
  data = (full.data ?? null) as Array<Record<string, unknown>> | null;
  error = (full.error ?? null) as { message: string } | null;

  if (error?.message && error.message.toLowerCase().includes("archived")) {
    const fallback = await supabase.from("subjecttbl").select("id, subjectname").order("subjectname");
    data = (fallback.data ?? null) as Array<Record<string, unknown>> | null;
    error = (fallback.error ?? null) as { message: string } | null;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<{
    id: string;
    subjectname: string;
    archived?: boolean;
    year_level?: number | null;
    semester?: string | null;
    subject_code?: string | null;
  }>;
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: r.subjectname,
      slug: toSlug(r.subjectname),
      archived: r.archived === undefined ? false : Boolean(r.archived),
      yearLevel: r.year_level ?? null,
      semester: r.semester ?? null,
      code: r.subject_code ?? null,
    }))
  );
}

export async function POST(request: NextRequest) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const subjectname = typeof body.name === "string" ? body.name.trim() : "";
  if (!subjectname) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const supabase = getSupabase();

  const yearLevelRaw = body.yearLevel;
  const semesterRaw = body.semester;
  const yearLevelNum = typeof yearLevelRaw === "number" && Number.isFinite(yearLevelRaw) ? Math.trunc(yearLevelRaw) : null;
  const semester = typeof semesterRaw === "string" && semesterRaw.trim() ? semesterRaw.trim() : null;

  const insertRow: Record<string, unknown> = {
    subjectname,
    archived: false,
    year_level: yearLevelNum,
    semester,
    subject_code: generateSubjectCode(),
  };

  let insertRes = await supabase.from("subjecttbl").insert(insertRow).select("id, subjectname, archived, year_level, semester, subject_code").single();
  if (insertRes.error?.message && insertRes.error.message.toLowerCase().includes("archived")) {
    delete insertRow.archived;
    delete insertRow.year_level;
    delete insertRow.semester;
    delete insertRow.subject_code;
    insertRes = await supabase.from("subjecttbl").insert(insertRow).select("id, subjectname").single();
  }

  if (insertRes.error) return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
  const row = insertRes.data as Record<string, unknown>;
  const name = String(row.subjectname ?? "").trim();
  return NextResponse.json({
    id: String(row.id ?? ""),
    name,
    slug: toSlug(name),
    archived: row.archived === undefined ? false : Boolean(row.archived),
    yearLevel: (row as { year_level?: number | null }).year_level ?? null,
    semester: (row as { semester?: string | null }).semester ?? null,
    code: (row as { subject_code?: string | null }).subject_code ?? null,
  });
}
