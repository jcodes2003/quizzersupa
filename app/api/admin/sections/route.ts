import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../lib/admin-auth";
import { getSupabase } from "../../../lib/supabase-server";

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  const { data, error } = await supabase.from("sections").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: (r.sectionname ?? r.sectionName ?? r.name ?? "") as string,
    }))
  );
}

export async function POST(request: NextRequest) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const sectionName = typeof body.name === "string" ? body.name.trim() : "";
  if (!sectionName) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const supabase = getSupabase();
  const { data, error } = await supabase.from("sections").insert({ sectionname: sectionName }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as { id: string; sectionname?: string; sectionName?: string; name?: string } | null;
  const name = row?.sectionname ?? row?.sectionName ?? row?.name ?? sectionName;
  return NextResponse.json({ id: row?.id, name });
}
