import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../../lib/admin-auth";
import { getSupabase } from "../../../../lib/supabase-server";

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await (await _request.json()) as { name?: string };
  const subjectname = typeof body.name === "string" ? body.name.trim() : undefined;
  if (subjectname === undefined) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const supabase = getSupabase();
  const { data, error } = await supabase.from("subjecttbl").update({ subjectname }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as { id: string; subjectname: string };
  return NextResponse.json({ id: row.id, name: row.subjectname, slug: row.subjectname.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") });
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
