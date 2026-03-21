import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../../lib/admin-auth";
import { getSupabase } from "../../../../lib/supabase-server";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]!;
  }
  return out;
}

export async function POST() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const { data, error } = await supabase.from("sections").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<{ id: string }>;

  const used = new Set<string>();
  let updated = 0;

  for (const r of rows) {
    const id = String(r.id ?? "").trim();
    if (!id) continue;
    let code = randomCode(8);
    for (let attempts = 0; attempts < 30 && used.has(code); attempts++) {
      code = randomCode(8);
    }
    used.add(code);
    const res = await supabase.from("sections").update({ section_code: code }).eq("id", id);
    if (!res.error) updated++;
  }

  return NextResponse.json({ ok: true, updated });
}

