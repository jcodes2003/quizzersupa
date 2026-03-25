import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  createStudentSession,
  getStudentCookieName,
  getStudentSession,
} from "../../lib/student-auth";
import { getStudentSectionIds } from "../../lib/student-sections";
import { getSupabase } from "../../lib/supabase-server";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPhinmaedEmail(value: string): boolean {
  return /^[a-z0-9._%+-]+@phinmaed\.com$/.test(value);
}

function looksLikeBcryptHash(value: string): boolean {
  return /^\$2[aby]\$/.test(value);
}

type StudentRow = {
  id?: string | number | null;
  studentname?: string | null;
  studentid?: string | null;
  stud_username?: string | null;
  user_password?: string | null;
};

export async function PATCH(request: NextRequest) {
  const session = await getStudentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  const username = normalizeEmail(body.username);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!username) {
    return NextResponse.json({ ok: false, error: "Username is required" }, { status: 400 });
  }
  if (!isPhinmaedEmail(username)) {
    return NextResponse.json(
      { ok: false, error: "Use your @phinmaed.com email for the username" },
      { status: 400 }
    );
  }
  if (!currentPassword) {
    return NextResponse.json({ ok: false, error: "Current password is required" }, { status: 400 });
  }
  if (newPassword && newPassword.length < 6) {
    return NextResponse.json({ ok: false, error: "New password must be at least 6 characters" }, { status: 400 });
  }

  const supabase = getSupabase();
  const existingRes = await supabase
    .from("studenttbl")
    .select("id, studentname, studentid, stud_username, user_password")
    .eq("id", session.student.id)
    .maybeSingle();

  const existing = (existingRes.data ?? null) as StudentRow | null;
  if (existingRes.error) {
    return NextResponse.json({ ok: false, error: existingRes.error.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Student account not found" }, { status: 404 });
  }

  const storedPassword = String(existing.user_password ?? "");
  const passwordOk = looksLikeBcryptHash(storedPassword)
    ? await bcrypt.compare(currentPassword, storedPassword)
    : storedPassword === currentPassword;
  if (!passwordOk) {
    return NextResponse.json({ ok: false, error: "Current password is incorrect" }, { status: 403 });
  }

  if (username !== String(existing.stud_username ?? "").trim().toLowerCase()) {
    const duplicateRes = await supabase
      .from("studenttbl")
      .select("id")
      .eq("stud_username", username)
      .neq("id", session.student.id)
      .limit(1)
      .maybeSingle();
    if (duplicateRes.error) {
      return NextResponse.json({ ok: false, error: duplicateRes.error.message }, { status: 500 });
    }
    if (duplicateRes.data) {
      return NextResponse.json({ ok: false, error: "Username already in use" }, { status: 409 });
    }
  }

  const updatePayload: Record<string, unknown> = {
    stud_username: username,
  };
  if (newPassword) {
    updatePayload.user_password = await bcrypt.hash(newPassword, 10);
  }

  const updateRes = await supabase
    .from("studenttbl")
    .update(updatePayload)
    .eq("id", session.student.id)
    .select("id, studentname, studentid, stud_username")
    .single();

  if (updateRes.error) {
    return NextResponse.json({ ok: false, error: updateRes.error.message }, { status: 500 });
  }

  const updated = updateRes.data as StudentRow;
  const sectionIds = (await getStudentSectionIds(session.student.id).catch(() => null)) ?? session.sectionIds ?? [];
  const nextSession = {
    student: {
      id: String(updated.id ?? session.student.id),
      name: String(updated.studentname ?? session.student.name ?? "").trim(),
      studentId: String(updated.studentid ?? session.student.studentId ?? "").trim() || undefined,
      username: String(updated.stud_username ?? username).trim().toLowerCase() || username,
    },
    sectionIds: sectionIds.map(String).filter(Boolean),
  };

  const res = NextResponse.json({ ok: true, student: nextSession.student });
  res.cookies.set(getStudentCookieName(), createStudentSession(nextSession), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60,
    path: "/",
  });
  return res;
}
