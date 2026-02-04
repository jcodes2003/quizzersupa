import { NextRequest, NextResponse } from "next/server";
import {
  verifyTeacherPassword,
  createTeacherSession,
  getCookieName,
} from "../../lib/teacher-auth";
import {
  verifyTeacherCredentials,
  createTeacherDBSession,
  getTeacherDBCookieName,
} from "../../lib/teacher-db-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    // DB login (email + password) – for teachers who create questions
    if (email) {
      if (!password) return NextResponse.json({ ok: false, error: "Password required" }, { status: 400 });
      const teacher = await verifyTeacherCredentials(email, password);
      if (!teacher) return NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
      if (!teacher.approved) {
        return NextResponse.json(
          { ok: false, error: "Account pending admin approval" },
          { status: 403 }
        );
      }
      const token = createTeacherDBSession(teacher.id);
      const res = NextResponse.json({ ok: true, teacher: { name: teacher.name } });
      res.cookies.set(getTeacherDBCookieName(), token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60,
        path: "/",
      });
      return res;
    }

    // Static password – view responses only
    if (!password) return NextResponse.json({ ok: false, error: "Password or email required" }, { status: 400 });
    if (!verifyTeacherPassword(password)) {
      return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
    }
    const token = createTeacherSession();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(getCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
      path: "/",
    });
    return res;
  } catch (e) {
    console.error("Teacher login error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
