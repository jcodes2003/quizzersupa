import { NextResponse } from "next/server";
import { getStudentSession } from "../../lib/student-auth";
import { getSupabase } from "../../lib/supabase-server";
import { getSectionJoinCode } from "../../lib/section-join";
import { getStudentSectionIds } from "../../lib/student-sections";

export async function GET() {
  const session = await getStudentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const dbSectionIds = await getStudentSectionIds(session.student.id).catch(() => null);
  const sectionIds = (dbSectionIds ?? session.sectionIds ?? []).map(String).filter(Boolean);
  let sections: Array<{ id: string; name: string; joinCode: string }> = [];
  if (sectionIds.length > 0) {
    const { data } = await supabase.from("sections").select("*").in("id", sectionIds);
    const rows = (data ?? []) as Record<string, unknown>[];
    sections = rows.map((r) => {
      const id = String(r.id ?? "");
      const name = String((r.sectionname ?? r.sectionName ?? r.name ?? "") || "").trim() || "Section";
      const joinCode =
        String((r.section_code ?? r.sectionCode ?? "") || "").trim() || getSectionJoinCode(id);
      return { id, name, joinCode };
    });
  }

  return NextResponse.json({
    ok: true,
    student: session.student,
    sections,
  });
}
