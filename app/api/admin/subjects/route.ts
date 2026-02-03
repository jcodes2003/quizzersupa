import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../lib/admin-auth";
import { getSupabase } from "../../../lib/supabase-server";

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  const { data, error } = await supabase.from("subjecttbl").select("id, subjectname").order("subjectname");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as { id: string; subjectname: string }[];
  return NextResponse.json(rows.map((r) => ({ id: r.id, name: r.subjectname, subjectname: r.subjectname })));
}

export async function POST(request: NextRequest) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const subjectname = typeof body.name === "string" ? body.name.trim() : "";
  if (!subjectname) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const supabase = getSupabase();
  const { data, error } = await supabase.from("subjecttbl").insert({ subjectname }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
