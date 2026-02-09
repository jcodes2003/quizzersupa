import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../lib/teacher-db-auth";
import { getSupabase } from "../../../lib/supabase-server";

const BUCKET = "quiz-images";
const PUBLIC_PATH = `/storage/v1/object/public/${BUCKET}/`;

function extFromType(type: string): string {
  const t = (type || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  return "bin";
}

export async function POST(request: NextRequest) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const quizId = String(form.get("quizId") ?? "").trim();
  if (!quizId) return NextResponse.json({ error: "quizId required" }, { status: 400 });
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const blob = file as Blob;
  const contentType = (blob as unknown as { type?: string }).type || "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads allowed" }, { status: 400 });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const ext = extFromType(contentType);
  const safeQuizId = quizId.replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const path = `${teacherId}/${safeQuizId}/${filename}`;

  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}

export async function DELETE(request: NextRequest) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { url?: string };
  const url = String(body.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  const idx = url.indexOf(PUBLIC_PATH);
  if (idx < 0) return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  const path = url.slice(idx + PUBLIC_PATH.length);
  if (!path) return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Use POST to upload quiz images." }, { status: 200 });
}
