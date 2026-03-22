import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../lib/teacher-db-auth";
import { getSupabase } from "../../../lib/supabase-server";

type AttemptLookupRow = {
  id: string | number;
  quizid: string;
  student_id?: string | null;
  studentname?: string | null;
  score?: number | null;
  max_score?: number | null;
  attempt_number?: number | null;
  sectionid?: string | number | null;
  submitted_at?: string | null;
  created_at?: string | null;
};

type QuizOwnerRow = {
  id: string;
  teacherid?: string | null;
  save_best_only?: boolean | null;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const teacherId = await getTeacherId();
  if (!teacherId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attemptId } = await context.params;
  const normalizedAttemptId = String(attemptId ?? "").trim();
  if (!normalizedAttemptId) {
    return NextResponse.json({ error: "Attempt ID is required." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const hasScore = body.score !== undefined && body.score !== null && String(body.score).trim() !== "";
  const hasSection = body.sectionId !== undefined && body.sectionId !== null && String(body.sectionId).trim() !== "";
  if (!hasScore && !hasSection) {
    return NextResponse.json({ error: "At least one field to update is required." }, { status: 400 });
  }

  const supabase = getSupabase();

  const attemptResult = await supabase
    .from("student_attempts_log")
    .select("id, quizid, student_id, studentname, score, max_score, attempt_number, sectionid, submitted_at, created_at")
    .eq("id", normalizedAttemptId)
    .maybeSingle();

  const attempt = (attemptResult.data ?? null) as AttemptLookupRow | null;
  const attemptError = attemptResult.error;

  if (attemptError) {
    const message = String(attemptError.message ?? "");
    if (message.toLowerCase().includes("student_attempts_log")) {
      return NextResponse.json(
        { error: "Manual score editing requires the student_attempts_log table." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message || "Failed to load attempt." }, { status: 500 });
  }

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  const ownerResult = await supabase
    .from("quiztbl")
    .select("id, teacherid, save_best_only")
    .eq("id", attempt.quizid)
    .maybeSingle();

  const quiz = (ownerResult.data ?? null) as QuizOwnerRow | null;
  if (ownerResult.error) {
    return NextResponse.json({ error: ownerResult.error.message }, { status: 500 });
  }
  if (!quiz || String(quiz.teacherid ?? "") !== teacherId) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  const rawScore = hasScore ? Number(body.score) : Number(attempt.score ?? 0);
  if (hasScore && (!Number.isFinite(rawScore) || rawScore < 0)) {
    return NextResponse.json({ error: "A valid score is required." }, { status: 400 });
  }

  if (hasScore && attempt.max_score != null && Number.isFinite(Number(attempt.max_score)) && rawScore > Number(attempt.max_score)) {
    return NextResponse.json(
      { error: `Score cannot be greater than ${Number(attempt.max_score)}.` },
      { status: 400 }
    );
  }

  let nextSectionId: string | null = null;
  if (hasSection) {
    nextSectionId = String(body.sectionId).trim();
    const sectionCheck = await supabase.from("sections").select("id").eq("id", nextSectionId).maybeSingle();
    if (sectionCheck.error) {
      return NextResponse.json({ error: sectionCheck.error.message }, { status: 500 });
    }
    if (!sectionCheck.data) {
      return NextResponse.json({ error: "Selected section was not found." }, { status: 400 });
    }
  }

  const nextScore = hasScore ? Number(rawScore) : Number(attempt.score ?? 0);
  const logPatch: { score?: number; sectionid?: string } = {};
  if (hasScore) logPatch.score = nextScore;
  if (nextSectionId) logPatch.sectionid = nextSectionId;

  const updateLog = await supabase
    .from("student_attempts_log")
    .update(logPatch)
    .eq("id", normalizedAttemptId)
    .select("id, score, max_score, sectionid")
    .maybeSingle();

  if (updateLog.error) {
    return NextResponse.json({ error: updateLog.error.message }, { status: 500 });
  }

  const studentId = String(attempt.student_id ?? "").trim();
  if (studentId) {
      const bestLogResult = await supabase
        .from("student_attempts_log")
        .select("id, quizid, student_id, studentname, score, max_score, attempt_number, sectionid, submitted_at, created_at")
        .eq("quizid", attempt.quizid)
        .eq("student_id", studentId)
        .eq("is_submitted", true);

    const bestLogRows = (bestLogResult.data ?? []) as AttemptLookupRow[];
    if (bestLogResult.error && !String(bestLogResult.error.message ?? "").toLowerCase().includes("student_attempts_log")) {
      return NextResponse.json({ error: bestLogResult.error.message }, { status: 500 });
    }

    let bestLog: AttemptLookupRow | null = null;
    for (const row of bestLogRows) {
      if (!bestLog) {
        bestLog = row;
        continue;
      }
      const rowScore = Number(row.score ?? -1);
      const bestScore = Number(bestLog.score ?? -1);
      if (rowScore > bestScore) {
        bestLog = row;
        continue;
      }
      if (rowScore === bestScore) {
        const rowTime = new Date(row.submitted_at ?? row.created_at ?? 0).getTime();
        const bestTime = new Date(bestLog.submitted_at ?? bestLog.created_at ?? 0).getTime();
        if (rowTime > bestTime) bestLog = row;
      }
    }

    if (bestLog) {
      if (quiz.save_best_only !== false) {
        const syncBest = await supabase
          .from("student_attempts")
          .update({
            score: bestLog.score ?? nextScore,
            max_score: bestLog.max_score ?? attempt.max_score ?? null,
            studentname: bestLog.studentname ?? attempt.studentname ?? "",
            attempt_number: bestLog.attempt_number ?? 1,
            sectionid: String(bestLog.sectionid ?? nextSectionId ?? attempt.sectionid ?? "").trim() || null,
          })
          .eq("quizid", attempt.quizid)
          .eq("student_id", studentId)
          .select("id")
          .maybeSingle();

        const syncBestMessage = String(syncBest.error?.message ?? "");
        if (syncBest.error && !syncBestMessage.toLowerCase().includes("student_attempts")) {
          return NextResponse.json({ error: syncBest.error.message }, { status: 500 });
        }

        if (!syncBest.data && !syncBest.error) {
          const insertBest = await supabase.from("student_attempts").insert({
            quizid: attempt.quizid,
            studentname: bestLog.studentname ?? attempt.studentname ?? "",
            student_id: studentId,
            score: bestLog.score ?? nextScore,
            attempt_number: bestLog.attempt_number ?? 1,
            max_score: bestLog.max_score ?? attempt.max_score ?? null,
            sectionid: String(bestLog.sectionid ?? nextSectionId ?? attempt.sectionid ?? "").trim() || null,
          });
          const insertBestMessage = String(insertBest.error?.message ?? "");
          if (insertBest.error && !insertBestMessage.toLowerCase().includes("student_attempts")) {
            return NextResponse.json({ error: insertBest.error.message }, { status: 500 });
          }
        }
      } else {
        const syncAttempt = await supabase
          .from("student_attempts")
          .update({
            score: nextScore,
            max_score: attempt.max_score ?? null,
            studentname: attempt.studentname ?? "",
            ...(nextSectionId ? { sectionid: nextSectionId } : {}),
          })
          .eq("quizid", attempt.quizid)
          .eq("student_id", studentId)
          .eq("attempt_number", attempt.attempt_number ?? 1)
          .select("id")
          .maybeSingle();

        const syncAttemptMessage = String(syncAttempt.error?.message ?? "");
        if (syncAttempt.error && !syncAttemptMessage.toLowerCase().includes("student_attempts")) {
          return NextResponse.json({ error: syncAttempt.error.message }, { status: 500 });
        }

        if (!syncAttempt.data && !syncAttempt.error) {
          const insertAttempt = await supabase.from("student_attempts").insert({
            quizid: attempt.quizid,
            studentname: attempt.studentname ?? "",
            student_id: studentId,
            score: nextScore,
            attempt_number: attempt.attempt_number ?? 1,
            max_score: attempt.max_score ?? null,
            sectionid: nextSectionId ?? (String(attempt.sectionid ?? "").trim() || null),
          });
          const insertAttemptMessage = String(insertAttempt.error?.message ?? "");
          if (insertAttempt.error && !insertAttemptMessage.toLowerCase().includes("student_attempts")) {
            return NextResponse.json({ error: insertAttempt.error.message }, { status: 500 });
          }
        }
      }

      await supabase
        .from("quiztbl")
        .update({
          score: bestLog.score ?? nextScore,
          studentname: bestLog.studentname ?? attempt.studentname ?? "",
        })
        .eq("id", attempt.quizid);
    }
  }

  return NextResponse.json({
    ok: true,
    attempt: {
      id: normalizedAttemptId,
      score: nextScore,
      max_score: attempt.max_score ?? null,
      sectionid: nextSectionId ?? (String(attempt.sectionid ?? "").trim() || null),
    },
  });
}
