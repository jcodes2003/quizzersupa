import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { getSupabase } from "../../../../../lib/supabase-server";

const DEFAULT_STUDENT_PASSWORD = "quizzer2025";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Student id is required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const passwordHash = await bcrypt.hash(DEFAULT_STUDENT_PASSWORD, 10);
  const { data, error } = await supabase
    .from("studenttbl")
    .update({ user_password: passwordHash })
    .eq("id", id)
    .select("id, studentname, studentid, stud_username")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    defaultPassword: DEFAULT_STUDENT_PASSWORD,
    student: {
      id: String(data.id),
      name: String(data.studentname ?? "").trim(),
      studentId: String(data.studentid ?? "").trim(),
      username: String(data.stud_username ?? "").trim().toLowerCase(),
    },
  });
}
