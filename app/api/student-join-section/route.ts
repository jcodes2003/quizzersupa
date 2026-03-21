import { NextRequest, NextResponse } from "next/server";
import { createStudentSession, getStudentCookieName, getStudentSession } from "../../lib/student-auth";
import { getSupabase } from "../../lib/supabase-server";
import { getSectionJoinCode, normalizeJoinCode } from "../../lib/section-join";
import { addStudentToSection } from "../../lib/student-sections";

export async function POST(request: NextRequest) {
  const session = await getStudentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const joinCode = normalizeJoinCode(typeof body.joinCode === "string" ? body.joinCode : "");
  if (!joinCode) return NextResponse.json({ ok: false, error: "Join code required" }, { status: 400 });

  const supabase = getSupabase();
  // Prefer matching your new DB column `section_code`.
  // If the project hasn't migrated everywhere yet, fall back to deterministic code and/or section name.
  let match: Record<string, unknown> | null = null;
  const byCode = await supabase.from("sections").select("*").eq("section_code", joinCode).maybeSingle();
  if (byCode.data) {
    match = byCode.data as Record<string, unknown>;
  } else {
    const byCodeAlt = await supabase.from("sections").select("*").ilike("section_code", joinCode).maybeSingle();
    if (byCodeAlt.data) {
      match = byCodeAlt.data as Record<string, unknown>;
    }
  }

  if (!match) {
    const { data, error } = await supabase.from("sections").select("*");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const rows = (data ?? []) as Record<string, unknown>[];
    match =
      rows.find((r) => {
        const id = String(r.id ?? "").trim();
        if (!id) return false;
        const code = String((r.section_code ?? r.sectionCode ?? "") || "").trim();
        if (normalizeJoinCode(code) === joinCode) return true;
        const legacy = getSectionJoinCode(id);
        if (legacy === joinCode) return true;
        const name = String((r.sectionname ?? r.sectionName ?? r.name ?? "") || "").trim();
        return normalizeJoinCode(name) === joinCode;
      }) ?? null;
  }

  if (!match) return NextResponse.json({ ok: false, error: "Invalid join code" }, { status: 404 });
  const sectionId = String(match.id ?? "").trim();
  if (!sectionId) return NextResponse.json({ ok: false, error: "Invalid section" }, { status: 500 });

  // Persist membership in DB so it survives logout/login.
  try {
    await addStudentToSection(session.student.id, sectionId);
  } catch {
    // If membership table isn't migrated yet or insert fails, we still fall back to cookie-based joins.
  }

  const nextSectionIds = Array.from(new Set([...(session.sectionIds ?? []), sectionId])).slice(0, 20);
  const token = createStudentSession({ ...session, sectionIds: nextSectionIds });
  const res = NextResponse.json({ ok: true, sectionId });
  res.cookies.set(getStudentCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60,
    path: "/",
  });
  return res;
}
