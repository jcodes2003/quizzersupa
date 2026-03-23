import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabase } from "../../lib/supabase-server";
import { sanitizeStudentId } from "../../lib/student-id";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isPhinmaedEmail(value: string): boolean {
  return /^[a-z0-9._%+-]+@phinmaed\.com$/.test(value);
}

type StudentRow = {
  id?: string | number | null;
  studentname?: string | null;
  studentid?: string | null;
  stud_username?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const email = normalizeEmail(body.email ?? body.username);
    const fullName = normalizeString(body.fullName ?? body.name);
    const studentId = sanitizeStudentId(normalizeString(body.studentId ?? body.studentid ?? body.student_id));
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!email || !fullName || !newPassword) {
      return NextResponse.json(
        { ok: false, error: "Email, full name, and new password are required" },
        { status: 400 }
      );
    }
    if (!isPhinmaedEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "Use your @phinmaed.com email address" },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { ok: false, error: "New password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const studentRes = await supabase
      .from("studenttbl")
      .select("id, studentname, studentid, stud_username")
      .eq("stud_username", email)
      .maybeSingle();

    if (studentRes.error) {
      return NextResponse.json({ ok: false, error: studentRes.error.message }, { status: 500 });
    }

    const student = (studentRes.data ?? null) as StudentRow | null;
    if (!student) {
      return NextResponse.json({ ok: false, error: "Student account not found" }, { status: 404 });
    }

    const storedName = normalizeName(String(student.studentname ?? ""));
    if (!storedName || storedName !== normalizeName(fullName)) {
      return NextResponse.json(
        { ok: false, error: "The details you entered do not match this student account" },
        { status: 403 }
      );
    }

    const storedStudentId = sanitizeStudentId(String(student.studentid ?? "").trim());
    if (storedStudentId && storedStudentId !== studentId) {
      return NextResponse.json(
        { ok: false, error: "The details you entered do not match this student account" },
        { status: 403 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updateRes = await supabase
      .from("studenttbl")
      .update({ user_password: passwordHash })
      .eq("id", student.id)
      .select("id")
      .single();

    if (updateRes.error) {
      return NextResponse.json({ ok: false, error: updateRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Password updated. You can now log in with your new password.",
    });
  } catch (e) {
    console.error("Student forgot password error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
