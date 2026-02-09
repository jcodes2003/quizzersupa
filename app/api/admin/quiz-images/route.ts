import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../lib/admin-auth";
import { getSupabase } from "../../../lib/supabase-server";

const BUCKET = "quiz-images";
const PUBLIC_PATH = `/storage/v1/object/public/${BUCKET}/`;

function urlToPath(url: string): string | null {
  const idx = url.indexOf(PUBLIC_PATH);
  if (idx < 0) return null;
  const path = url.slice(idx + PUBLIC_PATH.length);
  return path || null;
}

async function listAllObjects(prefix = ""): Promise<string[]> {
  const supabase = getSupabase();
  const files: string[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      const name = (item as { name?: string }).name;
      if (!name) continue;
      const fullPath = prefix ? `${prefix}/${name}` : name;
      // If it has metadata.size, treat as file; otherwise it's likely a folder.
      const metaSize = (item as { metadata?: { size?: number } | null }).metadata?.size;
      if (typeof metaSize === "number") {
        files.push(fullPath);
      } else {
        const nested = await listAllObjects(fullPath);
        files.push(...nested);
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return files;
}

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("questiontbl")
    .select("image_url")
    .not("image_url", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const urls = Array.from(
    new Set((data ?? []).map((r) => String((r as { image_url?: string | null }).image_url ?? "").trim()).filter(Boolean))
  );
  return NextResponse.json({ urls });
}

export async function DELETE(request: NextRequest) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { url?: string; urls?: string[]; all?: boolean };
  const supabase = getSupabase();

  if (body.all === true) {
    const allPaths = await listAllObjects();
    if (allPaths.length === 0) return NextResponse.json({ ok: true, deleted: 0 });
    const { error } = await supabase.storage.from(BUCKET).remove(allPaths);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: allPaths.length });
  }

  const urlList = Array.isArray(body.urls) ? body.urls : body.url ? [body.url] : [];
  const paths = urlList
    .map((u) => urlToPath(String(u ?? "").trim()))
    .filter((p): p is string => Boolean(p));
  if (paths.length === 0) return NextResponse.json({ error: "url(s) required" }, { status: 400 });
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: paths.length });
}
