import { NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";

export async function GET() {
  try {
    const supabase = getSupabase();
    let data: Array<Record<string, unknown>> | null = null;
    let error: { message: string } | null = null;

    const full = await supabase.from("subjecttbl").select("id, subjectname, archived").order("subjectname");
    data = (full.data ?? null) as Array<Record<string, unknown>> | null;
    error = (full.error ?? null) as { message: string } | null;

    if (error?.message && error.message.toLowerCase().includes("archived")) {
      const fallback = await supabase.from("subjecttbl").select("id, subjectname").order("subjectname");
      data = (fallback.data ?? null) as Array<Record<string, unknown>> | null;
      error = (fallback.error ?? null) as { message: string } | null;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rowsAll = (data ?? []) as Array<{ id: string; subjectname: string; archived?: boolean }>;
    const rows = rowsAll.filter((r) => r.archived === undefined ? true : !Boolean(r.archived));
    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        name: r.subjectname,
        slug: r.subjectname.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      }))
    );
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
