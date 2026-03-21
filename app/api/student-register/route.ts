import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabase } from "../../lib/supabase-server";

function isPhinmaedEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  return /^[a-z0-9._%+-]+@phinmaed\.com$/.test(email);
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isDuplicateMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("duplicate") || m.includes("already exists") || m.includes("unique");
}

async function insertStudent(payload: {
  fullName: string;
  email: string;
  passwordHash: string;
  studentId?: string;
}): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  const supabase = getSupabase();
  const { fullName, email, passwordHash, studentId } = payload;

  // Your DB table is `studenttbl` (as confirmed).
  const row: Record<string, unknown> = {
    studentname: fullName,
    studentid: studentId || null,
    stud_username: email,
    user_password: passwordHash,
  };

  const res = await supabase.from("studenttbl").insert(row).select("id").single();
  if (res.data?.id) return { ok: true, id: String(res.data.id) };
  const msg = (res.error as { message?: string } | null)?.message ?? "";
  if (msg && isDuplicateMessage(msg)) return { ok: false, status: 409, error: "Email already registered" };
  return { ok: false, status: 500, error: msg || "Failed to create account" };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const fullName = normalizeString(body.fullName ?? body.name);
    const email = normalizeEmail(body.email ?? body.username);
    const password = typeof body.password === "string" ? body.password : "";
    const studentId = normalizeString(body.studentId ?? body.studentid ?? body.student_id) || undefined;

    if (!fullName || !email || !password) {
      return NextResponse.json({ ok: false, error: "Full name, email, and password required" }, { status: 400 });
    }
    if (!isPhinmaedEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "Use your @phinmaed.com email (e.g. jacalma.coc@phinmaed.com)" },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ ok: false, error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Prevent double-entry: email + studentId must be unique in `studenttbl`.
    const supabase = getSupabase();
    const existingEmail = await supabase
      .from("studenttbl")
      .select("id")
      .eq("stud_username", email)
      .limit(1)
      .maybeSingle();
    if (existingEmail.data) {
      return NextResponse.json({ ok: false, error: "Email already registered" }, { status: 409 });
    }
    if (studentId) {
      const existingStudentId = await supabase
        .from("studenttbl")
        .select("id")
        .eq("studentid", studentId)
        .limit(1)
        .maybeSingle();
      if (existingStudentId.data) {
        return NextResponse.json({ ok: false, error: "Student ID already registered" }, { status: 409 });
      }
    }
    // Also block if the same email already exists as a teacher username.
    const existingTeacher = await supabase
      .from("teachertbl")
      .select("id")
      .eq("username", email)
      .limit(1)
      .maybeSingle();
    if (existingTeacher.data) {
      return NextResponse.json({ ok: false, error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await insertStudent({ fullName, email, passwordHash, studentId });
    if (!inserted.ok) return NextResponse.json({ ok: false, error: inserted.error }, { status: inserted.status });

    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (e) {
    console.error("Student registration error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
