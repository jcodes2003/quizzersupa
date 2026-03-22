import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { getSupabase } from "./supabase-server";
import { sanitizeStudentId } from "./student-id";

const COOKIE_NAME = "student_session";
const TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_SECRET =
  process.env.STUDENT_SESSION_SECRET ?? "quizmake-student-session-secret-32chars";

export type StudentSession = {
  student: {
    id: string;
    name: string;
    studentId?: string;
    username?: string;
  };
  sectionIds: string[];
};

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): string {
  const padLen = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen);
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(payloadB64: string): string {
  const expiry = (Date.now() + TTL_MS).toString();
  const data = `${payloadB64}.${expiry}`;
  const hmac = createHmac("sha256", SESSION_SECRET).update(data).digest("hex");
  return `${data}.${hmac}`;
}

function verify(token: string): StudentSession | null {
  try {
    const parts = token.split(".");
    if (parts.length < 3) return null;
    const hmac = parts.pop()!;
    const expiry = parts.pop()!;
    const payloadB64 = parts.join(".");
    if (!payloadB64 || !expiry) return null;
    if (parseInt(expiry, 10) < Date.now()) return null;
    const data = `${payloadB64}.${expiry}`;
    const expected = createHmac("sha256", SESSION_SECRET).update(data).digest("hex");
    if (!timingSafeEqual(Buffer.from(hmac, "utf8"), Buffer.from(expected, "utf8"))) return null;
    const json = fromBase64Url(payloadB64);
    const parsed = JSON.parse(json) as StudentSession;
    if (!parsed?.student?.id || !parsed?.student?.name) return null;
    if (!Array.isArray(parsed.sectionIds)) parsed.sectionIds = [];
    if (parsed.student) {
      const sanitized = sanitizeStudentId(parsed.student.studentId);
      parsed.student.studentId = sanitized ? sanitized : undefined;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createStudentSession(session: StudentSession): string {
  const payloadB64 = toBase64Url(JSON.stringify(session));
  return sign(payloadB64);
}

export function getStudentCookieName(): string {
  return COOKIE_NAME;
}

export async function getStudentSession(): Promise<StudentSession | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return value ? verify(value) : null;
}

export async function isStudentAuthenticated(): Promise<boolean> {
  return (await getStudentSession()) != null;
}

function getRowString(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function looksLikeBcryptHash(value: string): boolean {
  return /^\$2[aby]\$/.test(value);
}

async function findStudentRow(
  table: string,
  identifier: string
): Promise<Record<string, unknown> | null> {
  const supabase = getSupabase();
  const candidateCols = ["stud_username", "username", "email"];
  for (const col of candidateCols) {
    const res = await supabase.from(table).select("*").eq(col, identifier).maybeSingle();
    const errMsg = (res.error as { message?: string } | null)?.message ?? "";
    if (res.data) return res.data as Record<string, unknown>;
    if (errMsg && (errMsg.toLowerCase().includes("column") || errMsg.toLowerCase().includes(col))) {
      continue;
    }
    if (errMsg && errMsg.toLowerCase().includes("relation")) {
      return null;
    }
  }
  return null;
}

export async function verifyStudentCredentials(
  username: string,
  password: string
): Promise<{ id: string; name: string; studentId?: string; username?: string } | null> {
  const normalized = username.trim().toLowerCase();
  if (!normalized || !password) return null;

  const tables = ["studenttbl", "students", "student"];
  let row: Record<string, unknown> | null = null;
  for (const t of tables) {
    try {
      row = await findStudentRow(t, normalized);
      if (row) break;
    } catch {
      // Try next table.
    }
  }
  if (!row) return null;

  const storedPassword = getRowString(row, ["user_password", "password", "password_hash", "passwordHash"]);
  if (!storedPassword) return null;
  const ok = looksLikeBcryptHash(storedPassword)
    ? await bcrypt.compare(password, storedPassword)
    : storedPassword === password;
  if (!ok) return null;

  const id = getRowString(row, ["id", "student_id", "studentId"]);
  const name = getRowString(row, ["studentname", "name", "fullname", "full_name"]);
  const studentIdRaw = getRowString(row, ["studentid", "studentId", "student_id"]);
  const studentId = sanitizeStudentId(studentIdRaw) || undefined;
  const uname =
    getRowString(row, ["stud_username", "username", "email"]).toLowerCase().trim() || undefined;
  if (!id || !name) return null;
  return { id, name, studentId, username: uname };
}
