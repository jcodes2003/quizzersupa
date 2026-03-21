import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../lib/teacher-db-auth";
import { getSectionJoinCode } from "../../../lib/section-join";
import { normalizeJoinCode } from "../../../lib/section-join";
import { getSupabase } from "../../../lib/supabase-server";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function readSectionName(row: Record<string, unknown>): string {
  return String((row.sectionname ?? row.sectionName ?? row.name ?? "") || "").trim() || "Section";
}

function readJoinCode(row: Record<string, unknown>): string {
  const explicit = normalizeJoinCode(String((row.section_code ?? row.sectionCode ?? "") || ""));
  if (explicit) return explicit;
  return getSectionJoinCode(String(row.id ?? ""));
}

function generateClassCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

async function isCodeTaken(code: string): Promise<boolean> {
  const supabase = getSupabase();
  const exact = await supabase.from("sections").select("id").eq("section_code", code).maybeSingle();
  if (exact.data) return true;

  const exactMessage = (exact.error as { message?: string } | null)?.message ?? "";
  if (exactMessage && !exactMessage.toLowerCase().includes("section_code")) {
    throw exact.error;
  }

  const insensitive = await supabase.from("sections").select("id").ilike("section_code", code).maybeSingle();
  if (insensitive.data) return true;

  const insensitiveMessage = (insensitive.error as { message?: string } | null)?.message ?? "";
  if (insensitiveMessage && !insensitiveMessage.toLowerCase().includes("section_code")) {
    throw insensitive.error;
  }

  return false;
}

export async function GET() {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const { data, error } = await supabase.from("sections").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as Record<string, unknown>[])
    .map((row) => ({
      id: String(row.id ?? ""),
      name: readSectionName(row),
      joinCode: readJoinCode(row),
      teacherId: String((row.teacherid ?? row.teacherId ?? "") || "").trim() || null,
      isOwnedByTeacher: String((row.teacherid ?? row.teacherId ?? "") || "").trim() === teacherId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    sectionCode?: string;
    classCode?: string;
  };

  const name = String(body.name ?? "").trim();
  const requestedCode = normalizeJoinCode(String(body.sectionCode ?? body.classCode ?? ""));
  if (!name) return NextResponse.json({ error: "Section name required" }, { status: 400 });

  const supabase = getSupabase();
  const existingSections = await supabase.from("sections").select("id, sectionname, sectionName, name");
  if (existingSections.error) {
    return NextResponse.json({ error: existingSections.error.message }, { status: 500 });
  }
  const normalizedName = name.toLowerCase();
  const duplicate = ((existingSections.data ?? []) as Record<string, unknown>[]).find((row) => {
    return readSectionName(row).toLowerCase() === normalizedName;
  });
  if (duplicate) {
    return NextResponse.json({ error: "Section already exists" }, { status: 400 });
  }

  let classCode = requestedCode;
  if (classCode) {
    if (await isCodeTaken(classCode)) {
      return NextResponse.json({ error: "Section code already in use" }, { status: 400 });
    }
  } else {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = generateClassCode();
      if (!(await isCodeTaken(candidate))) {
        classCode = candidate;
        break;
      }
    }
    if (!classCode) {
      return NextResponse.json({ error: "Failed to generate a unique class code" }, { status: 500 });
    }
  }

  const insertWithTeacher = await supabase
    .from("sections")
    .insert({
      sectionname: name,
      section_code: classCode,
      teacherid: teacherId,
    })
    .select("*")
    .single();

  let row = insertWithTeacher.data as Record<string, unknown> | null;
  let insertError = insertWithTeacher.error as { message?: string } | null;

  if (insertError?.message && insertError.message.toLowerCase().includes("teacherid")) {
    const fallback = await supabase
      .from("sections")
      .insert({
        sectionname: name,
        section_code: classCode,
      })
      .select("*")
      .single();
    row = fallback.data as Record<string, unknown> | null;
    insertError = fallback.error as { message?: string } | null;
  }

  if (insertError || !row) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to create section" }, { status: 500 });
  }

  return NextResponse.json({
    id: String(row.id ?? ""),
    name: readSectionName(row),
    joinCode: readJoinCode(row) || classCode,
    teacherId: String((row.teacherid ?? row.teacherId ?? "") || "").trim() || teacherId,
    isOwnedByTeacher: true,
  });
}
