import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../../lib/admin-auth";
import { getSupabase } from "../../../../lib/supabase-server";

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

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await (await _request.json()) as {
    name?: string;
    archived?: boolean;
    yearLevel?: number | null;
    semester?: string | null;
    regenerateCode?: boolean;
  };
  const subjectname = typeof body.name === "string" ? body.name.trim() : undefined;

  const update: Record<string, unknown> = {};
  if (subjectname !== undefined) update.subjectname = subjectname;
  if (typeof body.archived === "boolean") update.archived = body.archived;
  if (body.yearLevel !== undefined) {
    const y = body.yearLevel;
    update.year_level = y === null ? null : typeof y === "number" && Number.isFinite(y) ? Math.trunc(y) : null;
  }
  if (body.semester !== undefined) {
    update.semester = body.semester === null ? null : String(body.semester ?? "").trim() || null;
  }
  if (body.regenerateCode) update.subject_code = generateSubjectCode();

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const supabase = getSupabase();

  let updateRes = await supabase
    .from("subjecttbl")
    .update(update)
    .eq("id", id)
    .select("id, subjectname, archived, year_level, semester, subject_code")
    .single();
  if (updateRes.error?.message && updateRes.error.message.toLowerCase().includes("archived")) {
    delete update.archived;
    delete update.year_level;
    delete update.semester;
    delete update.subject_code;
    updateRes = await supabase
      .from("subjecttbl")
      .update(update)
      .eq("id", id)
      .select("id, subjectname")
      .single();
  }

  if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 500 });
  const row = updateRes.data as Record<string, unknown>;
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const supabase = getSupabase();
  const { error } = await supabase.from("subjecttbl").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
