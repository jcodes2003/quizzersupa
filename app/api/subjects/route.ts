import { NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("subjecttbl").select("id, subjectname").order("subjectname");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as { id: string; subjectname: string }[];
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
