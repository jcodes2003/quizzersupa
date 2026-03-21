import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../lib/admin-auth";
import { getSupabase } from "../../../lib/supabase-server";
import { getSectionJoinCode } from "../../../lib/section-join";
import { normalizeJoinCode } from "../../../lib/section-join";

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
      joinCode:
        String((r.section_code ?? r.sectionCode ?? "") || "").trim() ||
        getSectionJoinCode(String(r.id ?? "")),
    }))
  );
}

export async function POST(request: NextRequest) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const sectionName = typeof body.name === "string" ? body.name.trim() : "";
  const sectionCodeRaw = typeof body.sectionCode === "string" ? body.sectionCode : "";
  const sectionCode = normalizeJoinCode(sectionCodeRaw);
  if (!sectionName) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const supabase = getSupabase();
  const insertRow: Record<string, unknown> = { sectionname: sectionName };
  if (sectionCode) insertRow.section_code = sectionCode;
  const { data, error } = await supabase.from("sections").insert(insertRow).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as {
    id: string;
    sectionname?: string;
    sectionName?: string;
    name?: string;
    section_code?: string;
  } | null;
  const name = row?.sectionname ?? row?.sectionName ?? row?.name ?? sectionName;
  return NextResponse.json({
    id: row?.id,
    name,
    joinCode: String(row?.section_code ?? "").trim() || getSectionJoinCode(String(row?.id ?? "")),
  });
}
