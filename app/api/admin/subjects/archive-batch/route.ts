import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../../lib/admin-auth";
import { getSupabase } from "../../../../lib/supabase-server";

export async function POST(request: NextRequest) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    yearLevel?: number | null;
    semester?: string | null;
    archived?: boolean;
  };

  const archived = typeof body.archived === "boolean" ? body.archived : null;
  const yearLevel =
    body.yearLevel === null || body.yearLevel === undefined
      ? null
      : typeof body.yearLevel === "number" && Number.isFinite(body.yearLevel)
        ? Math.trunc(body.yearLevel)
        : null;
  const semester =
    body.semester === null || body.semester === undefined
      ? null
      : String(body.semester ?? "").trim() || null;

  if (archived === null) {
    return NextResponse.json({ error: "archived (boolean) required" }, { status: 400 });
  }
  if (yearLevel === null && semester === null) {
    return NextResponse.json({ error: "Select at least yearLevel or semester" }, { status: 400 });
  }

  const supabase = getSupabase();
  let q = supabase.from("subjecttbl").update({ archived });
  if (yearLevel !== null) q = q.eq("year_level", yearLevel);
  if (semester !== null) q = q.eq("semester", semester);

  const res = await q.select("id");
  const msg = (res.error as { message?: string } | null)?.message ?? "";
  if (msg && msg.toLowerCase().includes("archived")) {
    return NextResponse.json(
      { error: "Subject archiving columns are not migrated yet. Run `supabase-migration-subject-archive-and-code.sql`." },
      { status: 500 }
    );
  }
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: Array.isArray(res.data) ? res.data.length : 0 });
}

