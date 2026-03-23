import { noStoreJson } from "../../lib/no-store";
import { getTeacherId } from "../../lib/teacher-db-auth";
import { getSupabase } from "../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const teacherId = await getTeacherId();
  if (!teacherId) return noStoreJson({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const teacherQuizRes = await supabase
    .from("quiztbl")
    .select("id")
    .eq("teacherid", teacherId);
  const teacherQuizErr = (teacherQuizRes.error as { message?: string } | null)?.message ?? "";
  if (teacherQuizErr) return noStoreJson({ error: teacherQuizErr }, { status: 500 });
  const teacherQuizIds = ((teacherQuizRes.data ?? []) as Array<{ id?: string | null }>)
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
  if (teacherQuizIds.length === 0) return noStoreJson({ rows: [] });

  const requestsRes = await supabase
    .from("student_attempt_recovery_requests")
    .select("id, attempt_log_id, quizid, student_id, studentname, sectionid, subjectid, submission_source, status, created_at, reviewed_at")
    .in("quizid", teacherQuizIds)
    .order("created_at", { ascending: false });
  const errMsg = (requestsRes.error as { message?: string } | null)?.message ?? "";
  if (errMsg) {
    if (errMsg.toLowerCase().includes("student_attempt_recovery_requests")) {
      return noStoreJson({ rows: [] });
    }
    return noStoreJson({ error: errMsg }, { status: 500 });
  }

  const rows = (requestsRes.data ?? []) as Array<Record<string, unknown>>;
  const quizIds = Array.from(new Set(rows.map((r) => String(r.quizid ?? "")).filter(Boolean)));
  const sectionIds = Array.from(new Set(rows.map((r) => String(r.sectionid ?? "")).filter(Boolean)));
  const subjectIds = Array.from(new Set(rows.map((r) => String(r.subjectid ?? "")).filter(Boolean)));

  const quizMap = new Map<string, { quizcode?: string | null; quizname?: string | null }>();
  if (quizIds.length > 0) {
    const quizRes = await supabase.from("quiztbl").select("id, quizcode, quizname").in("id", quizIds);
    for (const row of (quizRes.data ?? []) as Array<{ id: string; quizcode?: string | null; quizname?: string | null }>) {
      quizMap.set(String(row.id), row);
    }
  }

  const sectionMap = new Map<string, string>();
  if (sectionIds.length > 0) {
    const sectionRes = await supabase.from("sections").select("id, sectionname, name").in("id", sectionIds);
    for (const row of (sectionRes.data ?? []) as Array<{ id: string; sectionname?: string | null; name?: string | null }>) {
      sectionMap.set(String(row.id), String(row.sectionname ?? row.name ?? "").trim());
    }
  }

  const subjectMap = new Map<string, string>();
  if (subjectIds.length > 0) {
    const subjectRes = await supabase.from("subjecttbl").select("id, subjectname").in("id", subjectIds);
    for (const row of (subjectRes.data ?? []) as Array<{ id: string; subjectname?: string | null }>) {
      subjectMap.set(String(row.id), String(row.subjectname ?? "").trim());
    }
  }

  return noStoreJson({
    rows: rows.map((row) => {
      const quizid = String(row.quizid ?? "");
      const sectionid = String(row.sectionid ?? "");
      const subjectid = String(row.subjectid ?? "");
      return {
        id: String(row.id ?? ""),
        attempt_log_id: String(row.attempt_log_id ?? ""),
        quizid,
        quizcode: quizMap.get(quizid)?.quizcode ?? "",
        quizname: quizMap.get(quizid)?.quizname ?? "",
        student_id: String(row.student_id ?? ""),
        studentname: String(row.studentname ?? ""),
        sectionid,
        subjectid,
        sectionname: sectionMap.get(sectionid) ?? "",
        subjectname: subjectMap.get(subjectid) ?? "",
        submission_source: String(row.submission_source ?? ""),
        status: String(row.status ?? "pending"),
        created_at: String(row.created_at ?? ""),
        reviewed_at: String(row.reviewed_at ?? ""),
      };
    }),
  });
}
