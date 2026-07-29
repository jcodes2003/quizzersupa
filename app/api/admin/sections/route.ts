import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../lib/admin-auth";
import { getSupabase } from "../../../lib/supabase-server";
import { getSectionJoinCode } from "../../../lib/section-join";
import { normalizeJoinCode } from "../../../lib/section-join";

function getSectionDisplayName(row: Record<string, unknown>): string {
  const candidates = [row.name, row.sectionname, row.sectionName];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  const { data, error } = await supabase.from("sections").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const sortedRows = [...rows].sort((a, b) => {
    const aCreated = typeof a.created_at === "string" ? a.created_at : null;
    const bCreated = typeof b.created_at === "string" ? b.created_at : null;

    if (aCreated && bCreated) {
      const aTime = new Date(aCreated).getTime();
      const bTime = new Date(bCreated).getTime();
      if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
        return bTime - aTime;
      }
    }

    const aId = Number(a.id);
    const bId = Number(b.id);
    if (!Number.isNaN(aId) && !Number.isNaN(bId) && aId !== bId) {
      return bId - aId;
    }

    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
  return NextResponse.json(
    sortedRows.map((r) => ({
      id: r.id,
      name: getSectionDisplayName(r) || "Section",
      joinCode: getSectionJoinCode(String(r.id ?? "")),
      created_at: typeof r.created_at === "string" ? r.created_at : null,
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
  const insertRow: Record<string, unknown> = { name: sectionName };
  let insertRes = await supabase.from("sections").insert(insertRow).select("*").single();
  if (insertRes.error?.message && insertRes.error.message.toLowerCase().includes("does not exist")) {
    insertRes = await supabase.from("sections").insert({ sectionname: sectionName }).select("*").single();
  }
  if (insertRes.error) return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
  const row = insertRes.data as {
    id: string;
    name?: string;
    sectionname?: string;
    sectionName?: string;
  } | null;
  const name = getSectionDisplayName((row ?? {}) as Record<string, unknown>) || sectionName;
  return NextResponse.json({
    id: row?.id,
    name,
    joinCode: getSectionJoinCode(String(row?.id ?? "")),
  });
}
