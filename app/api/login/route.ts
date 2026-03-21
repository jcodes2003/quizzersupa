import { NextRequest, NextResponse } from "next/server";
import {
  createTeacherDBSession,
  getTeacherDBCookieName,
  verifyTeacherCredentials,
} from "../../lib/teacher-db-auth";
import {
  createStudentSession,
  getStudentCookieName,
  verifyStudentCredentials,
} from "../../lib/student-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email and password required" }, { status: 400 });
    }

    // 1) Try teacher first (approved teachers).
    const teacher = await verifyTeacherCredentials(email, password);
    if (teacher) {
      if (!teacher.approved) {
        return NextResponse.json({ ok: false, error: "Teacher account pending admin approval" }, { status: 403 });
      }
      const token = createTeacherDBSession(teacher.id);
      const res = NextResponse.json({ ok: true, role: "teacher", redirect: "/teacher" });
      res.cookies.set(getTeacherDBCookieName(), token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60,
        path: "/",
      });
      return res;
    }

    // 2) Try student.
    const student = await verifyStudentCredentials(email, password);
    if (!student) {
      return NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
    }
    const token = createStudentSession({
      student: {
        id: student.id,
        name: student.name,
        studentId: student.studentId,
        username: student.username ?? email,
      },
      sectionIds: [],
    });
    const res = NextResponse.json({ ok: true, role: "student", redirect: "/student" });
    res.cookies.set(getStudentCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
      path: "/",
    });
    return res;
  } catch (e) {
    console.error("Unified login error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

