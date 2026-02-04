import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabase } from "./supabase-server";
import bcrypt from "bcryptjs";

const COOKIE_NAME = "teacher_db_session";
const TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_SECRET =
  process.env.TEACHER_SESSION_SECRET ?? "quizmake-teacher-session-secret-32chars";

function sign(payload: string): string {
  const expiry = (Date.now() + TTL_MS).toString();
  const data = `${payload}.${expiry}`;
  const hmac = createHmac("sha256", SESSION_SECRET).update(data).digest("hex");
  return `${data}.${hmac}`;
}

function verifyAndPayload(value: string): string | null {
  try {
    const parts = value.split(".");
    if (parts.length < 3) return null;
    const hmac = parts.pop()!;
    const expiry = parts.pop()!;
    const teacherId = parts.join(".");
    if (!teacherId || !expiry) return null;
    if (parseInt(expiry, 10) < Date.now()) return null;
    const data = `${teacherId}.${expiry}`;
    const expected = createHmac("sha256", SESSION_SECRET).update(data).digest("hex");
    if (!timingSafeEqual(Buffer.from(hmac, "utf8"), Buffer.from(expected, "utf8")))
      return null;
    return teacherId;
  } catch {
    return null;
  }
}

export async function getTeacherId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return value ? verifyAndPayload(value) : null;
}

export async function isTeacherDBAuthenticated(): Promise<boolean> {
  return (await getTeacherId()) != null;
}

export function createTeacherDBSession(teacherId: string): string {
  return sign(teacherId);
}

export function getTeacherDBCookieName(): string {
  return COOKIE_NAME;
}

export async function verifyTeacherCredentials(
  username: string,
  password: string
): Promise<{ id: string; name: string; approved: boolean } | null> {
  const supabase = getSupabase();
  const normalized = username.trim().toLowerCase();
  let teacher:
    | { id: string; teachername: string; password: string; approved?: boolean }
    | null = null;
  let error: { message?: string } | null = null;

  const first = await supabase
    .from("teachertbl")
    .select("id, teachername, password, approved")
    .eq("username", normalized)
    .single();
  teacher = (first.data ?? null) as typeof teacher;
  const firstError = first.error as { message?: string } | null;
  error = firstError;

  // Fallback if the approved column doesn't exist yet
  if (error?.message && String(error.message).toLowerCase().includes("approved")) {
    const fallback = await supabase
      .from("teachertbl")
      .select("id, teachername, password")
      .eq("username", normalized)
      .single();
    teacher = (fallback.data ?? null) as typeof teacher;
    error = (fallback.error ?? null) as { message?: string } | null;
    if (teacher) {
      (teacher as { approved?: boolean }).approved = true;
    }
  }

  if (error || !teacher || !("password" in teacher)) return null;
  const teacherWithPass = teacher as { password: string; approved?: boolean; id: string; teachername: string };
  const ok = await bcrypt.compare(password, teacherWithPass.password);
  if (!ok) return null;
  const approved = Boolean(teacherWithPass.approved);
  return { id: teacherWithPass.id, name: teacherWithPass.teachername, approved };
}
