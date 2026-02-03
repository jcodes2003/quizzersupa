import { cookies } from "next/headers";
import { createHmac, createHash, timingSafeEqual } from "crypto";

const COOKIE_NAME = "admin_session";
const TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_PASSWORD = "adminQuizMake2025"; // static admin password

const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ?? "quizmake-admin-session-secret-32ch";

function sign(expiry: number): string {
  const payload = expiry.toString();
  const hmac = createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
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

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return !!value && verify(value);
}

export function createAdminSession(): string {
  const expiry = Date.now() + TTL_MS;
  return sign(expiry);
}

export function getAdminCookieName(): string {
  return COOKIE_NAME;
}

export function verifyAdminPassword(password: string): boolean {
  const a = createHash("sha256").update(password, "utf8").digest();
  const b = createHash("sha256").update(ADMIN_PASSWORD, "utf8").digest();
  return a.length === b.length && timingSafeEqual(a, b);
}
