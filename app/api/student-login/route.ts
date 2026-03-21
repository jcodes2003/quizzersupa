import { NextRequest, NextResponse } from "next/server";
import {
  createStudentSession,
  getStudentCookieName,
  verifyStudentCredentials,
} from "../../lib/student-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return NextResponse.json({ ok: false, error: "Username and password required" }, { status: 400 });
    }

    const student = await verifyStudentCredentials(username, password);
    if (!student) {
      return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
    }

    const token = createStudentSession({
      student: {
        id: student.id,
        name: student.name,
        studentId: student.studentId,
        username: student.username ?? username,
      },
      sectionIds: [],
    });

    const res = NextResponse.json({
      ok: true,
      student: { id: student.id, name: student.name, studentId: student.studentId, username: student.username ?? username },
    });
    res.cookies.set(getStudentCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
      path: "/",
    });
    return res;
  } catch (e) {
    console.error("Student login error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

