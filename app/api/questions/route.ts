import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const subjectSlug = searchParams.get("subject");
  if (!subjectSlug) return NextResponse.json({ error: "subject required" }, { status: 400 });
  try {
    const supabase = getSupabase();
    const { data: subjects } = await supabase.from("subjecttbl").select("id, subjectname");
    const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const subject = (subjects ?? []).find((s) => slug((s as { subjectname: string }).subjectname) === subjectSlug);
    if (!subject) return NextResponse.json([]);
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("subject_id", subject.id)
      .order("order_index")
      .order("created_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
