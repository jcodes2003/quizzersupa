import { NextResponse } from "next/server";
import { isTeacherAuthenticated } from "../../lib/teacher-auth";
import { getTeacherId } from "../../lib/teacher-db-auth";
import { getSupabase } from "../../lib/supabase-server";

export type QuizResponseRow = {
  id: string;
  quizcode: string;
  quizname?: string | null;
  subjectid: string;
  sectionid: string;
  score: number | null;
  studentname: string | null;
  created_at?: string;
};

export async function GET(request: Request) {
  const okStatic = await isTeacherAuthenticated();
  const teacherId = await getTeacherId();
  const okDb = !!teacherId;
  if (!okStatic && !okDb) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!okDb || !teacherId) {
    return NextResponse.json({ rows: [] });
  }

  const { searchParams } = new URL(request.url);
  const quizname = searchParams.get("quizname")?.trim();

  const supabase = getSupabase();
  let query = supabase
    .from("quiztbl")
    .select(
      "id, quizcode, quizname, subjectid, sectionid, score, studentname, created_at",
    )
    .eq("teacherid", teacherId)
    .order("created_at", { ascending: false });

  if (quizname) {
    query = query.ilike("quizname", `%${quizname}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Supabase quiztbl error:", error);
    return NextResponse.json({ error: "Failed to fetch responses" }, { status: 500 });
  }
  return NextResponse.json({ rows: (data ?? []) as QuizResponseRow[] });
}
