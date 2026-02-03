import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isAdminAuthenticated } from "../../../lib/admin-auth";
import { getSupabase } from "../../../lib/supabase-server";

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("teachertbl")
    .select("id, teachername, username")
    .order("teachername");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as { id: string; teachername: string; username: string }[];
  return NextResponse.json(rows.map((r) => ({ id: r.id, name: r.teachername, email: r.username })));
}

export async function POST(request: NextRequest) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const teachername = typeof body.name === "string" ? body.name.trim() : "";
  const username = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const plainPassword = typeof body.password === "string" ? body.password : "";
  if (!teachername || !username || !plainPassword) {
    return NextResponse.json({ error: "Name, username, and password required" }, { status: 400 });
  }
  if (plainPassword.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  const password = await bcrypt.hash(plainPassword, 10);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("teachertbl")
    .insert({ teachername, username, password })
    .select("id, teachername, username")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as { id: string; teachername: string; username: string };
  return NextResponse.json({ id: row.id, name: row.teachername, email: row.username });
}
