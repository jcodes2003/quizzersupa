import { NextRequest, NextResponse } from "next/server";
import {
  verifyAdminPassword,
  createAdminSession,
  getAdminCookieName,
} from "../../lib/admin-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";
    if (!password) {
      return NextResponse.json({ ok: false, error: "Password required" }, { status: 400 });
    }
    if (!verifyAdminPassword(password)) {
      return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
    }
    const token = createAdminSession();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(getAdminCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
      path: "/",
    });
    return res;
  } catch (e) {
    console.error("Admin login error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
