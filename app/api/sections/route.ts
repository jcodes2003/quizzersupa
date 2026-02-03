import { NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("sections").select("*");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as Record<string, unknown>[];
    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        name: String((r.sectionname ?? r.sectionName ?? r.name ?? "") || "").trim() || "Section",
      }))
    );
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
