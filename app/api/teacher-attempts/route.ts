import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../lib/teacher-db-auth";
import { getSupabase } from "../../lib/supabase-server";

export async function GET(request: NextRequest) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();

  // Get all quizzes created by this teacher
  const { data: quizzes, error: quizError } = await supabase
    .from("quiztbl")
    .select("id")
    .eq("teacherid", teacherId);

  if (quizError) return NextResponse.json({ error: quizError.message }, { status: 500 });

  const quizIds = (quizzes ?? []).map((q) => q.id);
  if (quizIds.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  // Get all student attempts for these quizzes with sectionid and subjectid
  const { data: attempts, error: attemptsError } = await supabase
    .from("student_attempts")
    .select("quizid, studentname, student_id, score, max_score, attempt_number, created_at, subjectid, sectionid")
    .in("quizid", quizIds)
    .order("created_at", { ascending: false });

  if (attemptsError) return NextResponse.json({ error: attemptsError.message }, { status: 500 });

  // Get quiz metadata for quiz codes and backup subject/section data
  const { data: quizMetadata } = await supabase
    .from("quiztbl")
    .select("id, quizcode, subjectid, sectionid")
    .in("id", quizIds);

  const quizMap = new Map(quizMetadata?.map((q) => [q.id, q]) ?? []);

  // Get sections and subjects for display (using correct DB column names)
  const { data: sections } = await supabase.from("sections").select("id, sectionname");
  const { data: subjects } = await supabase.from("subjecttbl").select("id, subjectname");

  // Normalize map keys to strings so they match client-side IDs
  const sectionMap = new Map(
    (sections ?? []).map((s: any) => [String(s.id), String(s.sectionname ?? "")])
  );
  const subjectMap = new Map(
    (subjects ?? []).map((s: any) => [String(s.id), String(s.subjectname ?? "")])
  );

  // Transform attempts to match expected format, including joined names
  const rows = (attempts ?? []).map((a) => {
    const quiz = quizMap.get(a.quizid);
    // Use subjectid/sectionid from student_attempts, fallback to quiztbl if null
    const rawSubjectId = a.subjectid ?? quiz?.subjectid ?? null;
    const rawSectionId = a.sectionid ?? quiz?.sectionid ?? null;

    const subjectid = rawSubjectId != null ? String(rawSubjectId) : "";
    const sectionid = rawSectionId != null ? String(rawSectionId) : "";

    const sectionname = sectionid ? sectionMap.get(sectionid) ?? "" : "";
    const subjectname = subjectid ? subjectMap.get(subjectid) ?? "" : "";

    return {
      id: `${a.quizid}-${a.student_id}-${a.attempt_number}`,
      quizcode: quiz?.quizcode ?? "",
      studentname: a.studentname,
      student_id: a.student_id,
      score: a.score,
      max_score: a.max_score,
      attempt_number: a.attempt_number,
      // Human-readable names from joined tables
      section: sectionname,
      subject: subjectname,
      created_at: a.created_at,
      subjectid,
      sectionid,
      sectionname,
      subjectname,
    };
  });

  return NextResponse.json({ rows });
}

