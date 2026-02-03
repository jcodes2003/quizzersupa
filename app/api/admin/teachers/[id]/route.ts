import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isAdminAuthenticated } from "../../../../lib/admin-auth";
import { getSupabase } from "../../../../lib/supabase-server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json() as { name?: string; email?: string; password?: string };
  const updates: { teachername?: string; username?: string; password?: string } = {};
  if (typeof body.name === "string" && body.name.trim()) updates.teachername = body.name.trim();
  if (typeof body.email === "string" && body.email.trim()) updates.username = body.email.trim().toLowerCase();
  if (typeof body.password === "string" && body.password.length >= 6) {
    updates.password = await bcrypt.hash(body.password, 10);
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("teachertbl")
    .update(updates)
    .eq("id", id)
    .select("id, teachername, username")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as { id: string; teachername: string; username: string };
  return NextResponse.json({ id: row.id, name: row.teachername, email: row.username });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const supabase = getSupabase();
  const { error } = await supabase.from("teachertbl").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
