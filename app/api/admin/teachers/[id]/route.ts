import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isAdminAuthenticated } from "../../../../lib/admin-auth";
import { getSupabase } from "../../../../lib/supabase-server";

function isMissingTableError(message: string): boolean {
  return /does not exist|relation .* does not exist|undefined table|does not exist in the schema|table .* not found/i.test(message);
}

async function deleteQuestionsForQuizIds(supabase: ReturnType<typeof getSupabase>, quizIds: string[]) {
  if (quizIds.length === 0) return;

  const attempts = [
    { table: "questiontbl", column: "quizid" },
    { table: "questionstbl", column: "quizid" },
    { table: "questions", column: "quizid" },
  ];

  for (const attempt of attempts) {
    const { error } = await supabase.from(attempt.table).delete().in(attempt.column, quizIds);
    if (!error) return;
    if (!isMissingTableError(error.message)) {
      throw new Error(error.message);
    }
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json() as { name?: string; email?: string; password?: string; approved?: boolean };
  const updates: { teachername?: string; username?: string; password?: string; approved?: boolean } = {};
  if (typeof body.name === "string" && body.name.trim()) updates.teachername = body.name.trim();
  if (typeof body.email === "string" && body.email.trim()) updates.username = body.email.trim().toLowerCase();
  if (typeof body.password === "string" && body.password.length >= 6) {
    updates.password = await bcrypt.hash(body.password, 10);
  }
  if (typeof body.approved === "boolean") updates.approved = body.approved;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("teachertbl")
    .update(updates)
    .eq("id", id)
    .select("id, teachername, username, approved")
    .single();
  if (error?.message && error.message.toLowerCase().includes("approved")) {
    delete updates.approved;
    const fallback = await supabase
      .from("teachertbl")
      .update(updates)
      .eq("id", id)
      .select("id, teachername, username")
      .single();
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    const rowFallback = fallback.data as { id: string; teachername: string; username: string };
    return NextResponse.json({
      id: rowFallback.id,
      name: rowFallback.teachername,
      email: rowFallback.username,
      approved: true,
    });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as { id: string; teachername: string; username: string; approved?: boolean };
  return NextResponse.json({
    id: row.id,
    name: row.teachername,
    email: row.username,
    approved: Boolean(row.approved),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { deleteAll?: boolean };
  const deleteAll = body.deleteAll === true;
  const supabase = getSupabase();

  if (deleteAll) {
    const { data: quizRows } = await supabase.from("quiztbl").select("id").eq("teacherid", id);
    const quizIds = Array.isArray(quizRows)
      ? quizRows.map((row) => String((row as { id?: string }).id)).filter(Boolean)
      : [];

    if (quizIds.length > 0) {
      const { error: recoveryErr } = await supabase.from("student_attempt_recovery_requests").delete().in("quizid", quizIds);
      if (recoveryErr && !isMissingTableError(recoveryErr.message)) {
        return NextResponse.json({ error: recoveryErr.message }, { status: 500 });
      }

      const { error: logErr } = await supabase.from("student_attempts_log").delete().in("quizid", quizIds);
      if (logErr && !isMissingTableError(logErr.message)) {
        return NextResponse.json({ error: logErr.message }, { status: 500 });
      }

      const { error: attemptsErr } = await supabase.from("student_attempts").delete().in("quizid", quizIds);
      if (attemptsErr && !isMissingTableError(attemptsErr.message)) {
        return NextResponse.json({ error: attemptsErr.message }, { status: 500 });
      }

      try {
        await deleteQuestionsForQuizIds(supabase, quizIds);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete questions";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    const { error: teacherRecoveryErr } = await supabase.from("student_attempt_recovery_requests").delete().eq("teacherid", id);
    if (teacherRecoveryErr && !isMissingTableError(teacherRecoveryErr.message)) {
      return NextResponse.json({ error: teacherRecoveryErr.message }, { status: 500 });
    }

    const { error: sectionErr } = await supabase.from("sections").delete().eq("teacherid", id);
    if (sectionErr && !isMissingTableError(sectionErr.message)) {
      return NextResponse.json({ error: sectionErr.message }, { status: 500 });
    }

    const { error: quizErr } = await supabase.from("quiztbl").delete().eq("teacherid", id);
    if (quizErr && !isMissingTableError(quizErr.message)) {
      return NextResponse.json({ error: quizErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, deletedAll: deleteAll });
}
