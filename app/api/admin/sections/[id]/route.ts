import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../../lib/admin-auth";
import { getSupabase } from "../../../../lib/supabase-server";
import { normalizeJoinCode } from "../../../../lib/section-join";

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await (await _request.json()) as { name?: string; sectionCode?: string | null };
  const sectionName = typeof body.name === "string" ? body.name.trim() : "";
  const sectionCode = normalizeJoinCode(typeof body.sectionCode === "string" ? body.sectionCode : "");
  const hasName = Boolean(sectionName);
  const hasCode = typeof body.sectionCode !== "undefined";
  if (!hasName && !hasCode) return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  const supabase = getSupabase();
  const updateRow: Record<string, unknown> = {};
  if (hasName) updateRow.sectionname = sectionName;
  if (hasCode) updateRow.section_code = sectionCode || null;
  const { data, error } = await supabase.from("sections").update(updateRow).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const supabase = getSupabase();
  const { error } = await supabase.from("sections").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
