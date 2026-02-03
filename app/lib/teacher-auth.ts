import { cookies } from "next/headers";
import { createHmac, createHash, timingSafeEqual } from "crypto";

const COOKIE_NAME = "teacher_session";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Static teacher password – no env required. */
const TEACHER_PASSWORD = "iwu2L&Stv";

/** Session cookie signing secret (static fallback so no env required). */
const SESSION_SECRET =
  process.env.TEACHER_SESSION_SECRET ?? "quizmake-teacher-session-secret-32chars";

function getSecret(): string {
  return SESSION_SECRET;
}

function sign(expiry: number): string {
  const secret = getSecret();
  const payload = expiry.toString();
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

function verify(value: string): boolean {
  try {
    const [payload, hmac] = value.split(".");
    if (!payload || !hmac) return false;
    const expiry = parseInt(payload, 10);
    if (Number.isNaN(expiry) || expiry < Date.now()) return false;
    const expected = sign(expiry);
    return timingSafeEqual(Buffer.from(value, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

export async function isTeacherAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return !!value && verify(value);
}

export function createTeacherSession(): string {
  const expiry = Date.now() + TTL_MS;
  return sign(expiry);
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

export function verifyTeacherPassword(password: string): boolean {
  const a = createHash("sha256").update(password, "utf8").digest();
  const b = createHash("sha256").update(TEACHER_PASSWORD, "utf8").digest();
  return a.length === b.length && timingSafeEqual(a, b);
}
