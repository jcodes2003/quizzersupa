import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabase } from "../../lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const teachername = typeof body.name === "string" ? body.name.trim() : "";
    const username = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const plainPassword = typeof body.password === "string" ? body.password : "";
    if (!teachername || !username || !plainPassword) {
      return NextResponse.json({ error: "Name, email, and password required" }, { status: 400 });
    }
    if (plainPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    const password = await bcrypt.hash(plainPassword, 10);
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("teachertbl")
      .insert({ teachername, username, password, approved: false })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e) {
    console.error("Teacher registration error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
