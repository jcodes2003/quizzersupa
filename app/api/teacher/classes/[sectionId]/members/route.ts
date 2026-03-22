import { noStoreJson } from "../../../../../lib/no-store";
import { getTeacherId } from "../../../../../lib/teacher-db-auth";
import { getSectionJoinCode } from "../../../../../lib/section-join";
import { getSupabase } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SectionRow = {
  id: string | number;
  sectionname?: string | null;
  section_code?: string | null;
  teacherid?: string | null;
};

type StudentSectionRow = {
  student_id?: string | number | null;
};

type StudentRow = {
  id: string | number;
  studentname?: string | null;
  studentid?: string | null;
};

type ActivityRow = {
  id: string | number;
  quizcode?: string | null;
  quizname?: string | null;
  assessment_type?: string | null;
  period?: string | number | null;
  submission_deadline?: string | null;
};

type AttemptRow = {
  quizid?: string | number | null;
  student_id?: string | number | null;
};

function normalizeAssessmentType(value: unknown): "quiz" | "exam" {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "exam" || raw === "examination" ? "exam" : "quiz";
}

function sanitizeStudentId(value: unknown): string {
  return String(value ?? "").replace(/[^A-Za-z0-9]/g, "");
}

function getActivityStatus(deadline?: string | null): "no_deadline" | "upcoming" | "overdue" {
  if (!deadline) return "no_deadline";
  const time = new Date(deadline).getTime();
  if (Number.isNaN(time)) return "no_deadline";
  return time < Date.now() ? "overdue" : "upcoming";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ sectionId: string }> }
) {
  const teacherId = await getTeacherId();
  if (!teacherId) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  const { sectionId } = await context.params;
  const normalizedSectionId = String(sectionId ?? "").trim();
  if (!normalizedSectionId) {
    return noStoreJson({ error: "Section ID is required." }, { status: 400 });
  }

  const supabase = getSupabase();

  const sectionWithTeacherRes = await supabase
    .from("sections")
    .select("id, sectionname, section_code, teacherid")
    .eq("id", normalizedSectionId)
    .maybeSingle();

  let section = (sectionWithTeacherRes.data ?? null) as SectionRow | null;
  let sectionError = sectionWithTeacherRes.error;

  if (sectionError?.message?.toLowerCase().includes("teacherid")) {
    const sectionFallbackRes = await supabase
      .from("sections")
      .select("id, sectionname, section_code")
      .eq("id", normalizedSectionId)
      .maybeSingle();
    section = (sectionFallbackRes.data ?? null) as SectionRow | null;
    sectionError = sectionFallbackRes.error;
  }

  if (sectionError) {
    return noStoreJson({ error: sectionError.message }, { status: 500 });
  }
  if (!section) {
    return noStoreJson({ error: "Section not found." }, { status: 404 });
  }

  const sectionOwnerId = String(section.teacherid ?? "").trim();
  let canAccess = sectionOwnerId === teacherId;
  if (!canAccess) {
    const fallbackOwnership = await supabase
      .from("quiztbl")
      .select("id")
      .eq("teacherid", teacherId)
      .eq("sectionid", normalizedSectionId)
      .limit(1)
      .maybeSingle();
    if (fallbackOwnership.error) {
      return noStoreJson({ error: fallbackOwnership.error.message }, { status: 500 });
    }
    canAccess = Boolean(fallbackOwnership.data);
  }

  if (!canAccess) {
    return noStoreJson({ error: "Forbidden" }, { status: 403 });
  }

  const sectionPayload = {
    id: String(section.id ?? ""),
    name: String(section.sectionname ?? "").trim() || "Section",
    joinCode: String(section.section_code ?? "").trim() || getSectionJoinCode(String(section.id ?? "")),
  };

  const membersRes = await supabase
    .from("student_sections")
    .select("student_id")
    .eq("section_id", normalizedSectionId);

  const membersErr = String((membersRes.error as { message?: string } | null)?.message ?? "");
  if (membersErr && membersErr.toLowerCase().includes("student_sections")) {
    return noStoreJson({
      section: sectionPayload,
      activities: [],
      students: [],
      relationAvailable: false,
    });
  }
  if (membersRes.error) {
    return noStoreJson({ error: membersRes.error.message }, { status: 500 });
  }

  const memberDbIds = ((membersRes.data ?? []) as StudentSectionRow[])
    .map((row) => String(row.student_id ?? "").trim())
    .filter(Boolean);

  const activitiesWithDeadlineRes = await supabase
    .from("quiztbl")
    .select("id, quizcode, quizname, assessment_type, period, submission_deadline")
    .eq("teacherid", teacherId)
    .eq("sectionid", normalizedSectionId)
    .order("created_at", { ascending: true });

  let activitiesData = (activitiesWithDeadlineRes.data ?? null) as ActivityRow[] | null;
  let activitiesError = activitiesWithDeadlineRes.error;

  if (activitiesError?.message?.toLowerCase().includes("submission_deadline")) {
    const fallbackActivitiesRes = await supabase
      .from("quiztbl")
      .select("id, quizcode, quizname, assessment_type, period")
      .eq("teacherid", teacherId)
      .eq("sectionid", normalizedSectionId)
      .order("created_at", { ascending: true });
    activitiesData = (fallbackActivitiesRes.data ?? null) as ActivityRow[] | null;
    activitiesError = fallbackActivitiesRes.error;
  }

  if (activitiesError) {
    return noStoreJson({ error: activitiesError.message }, { status: 500 });
  }

  const activities = (activitiesData ?? []).map((row) => ({
    id: String(row.id ?? "").trim(),
    quizcode: String(row.quizcode ?? "").trim(),
    quizname: String(row.quizname ?? "").trim(),
    assessmentType: normalizeAssessmentType(row.assessment_type),
    period: String(row.period ?? "").trim(),
    submissionDeadline: row.submission_deadline ?? null,
    status: getActivityStatus(row.submission_deadline ?? null),
  }));

  if (memberDbIds.length === 0) {
    return noStoreJson({
      section: sectionPayload,
      activities,
      students: [],
      relationAvailable: true,
    });
  }

  const studentsRes = await supabase
    .from("studenttbl")
    .select("id, studentname, studentid")
    .in("id", memberDbIds);

  if (studentsRes.error) {
    return noStoreJson({ error: studentsRes.error.message }, { status: 500 });
  }

  const studentsByDbId = new Map(
    ((studentsRes.data ?? []) as StudentRow[]).map((row) => [
      String(row.id ?? "").trim(),
      {
        dbId: String(row.id ?? "").trim(),
        studentName: String(row.studentname ?? "").trim(),
        studentId: String(row.studentid ?? "").trim(),
        normalizedStudentId: sanitizeStudentId(row.studentid),
      },
    ])
  );
  const studentIdToDbId = new Map(
    Array.from(studentsByDbId.values())
      .filter((student) => student.normalizedStudentId)
      .map((student) => [student.normalizedStudentId, student.dbId])
  );

  const activityIds = activities.map((row) => row.id).filter(Boolean);
  const completedByStudentDbId = new Map<string, Set<string>>();
  const memberStudentIds = Array.from(studentIdToDbId.keys());

  if (activityIds.length > 0 && memberStudentIds.length > 0) {
    const attemptsLogRes = await supabase
      .from("student_attempts_log")
      .select("quizid, student_id")
      .in("quizid", activityIds)
      .in("student_id", memberStudentIds)
      .eq("is_submitted", true);

    const attemptsLogErr = String((attemptsLogRes.error as { message?: string } | null)?.message ?? "");
    let attemptsData = (attemptsLogRes.data ?? []) as AttemptRow[];

    if (attemptsLogErr && attemptsLogErr.toLowerCase().includes("student_attempts_log")) {
      const fallbackAttempts = await supabase
        .from("student_attempts")
        .select("quizid, student_id")
        .in("quizid", activityIds)
        .in("student_id", memberStudentIds);
      if (fallbackAttempts.error) {
        return noStoreJson({ error: fallbackAttempts.error.message }, { status: 500 });
      }
      attemptsData = (fallbackAttempts.data ?? []) as AttemptRow[];
    } else if (attemptsLogRes.error) {
      return noStoreJson({ error: attemptsLogRes.error.message }, { status: 500 });
    }

    for (const row of attemptsData) {
      const studentId = sanitizeStudentId(row.student_id);
      const quizId = String(row.quizid ?? "").trim();
      const dbId = studentIdToDbId.get(studentId);
      if (!dbId || !quizId) continue;
      const set = completedByStudentDbId.get(dbId) ?? new Set<string>();
      set.add(quizId);
      completedByStudentDbId.set(dbId, set);
    }
  }

  const students = memberDbIds
    .map((dbId) => studentsByDbId.get(dbId) ?? { dbId, studentName: "", studentId: "" })
    .map((student) => {
      const completed = completedByStudentDbId.get(student.dbId) ?? new Set<string>();
      const completedActivities = activities.filter((activity) => completed.has(activity.id));
      const missingActivities = activities.filter((activity) => !completed.has(activity.id));
      const overdueActivities = missingActivities.filter((activity) => activity.status === "overdue");
      return {
        dbId: student.dbId,
        studentName: student.studentName || "Student",
        studentId: student.studentId,
        completedCount: completed.size,
        completedActivities,
        missingCount: missingActivities.length,
        overdueCount: overdueActivities.length,
        missingActivities,
        overdueActivities,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName, undefined, { sensitivity: "base", numeric: true }));

  return noStoreJson({
    section: sectionPayload,
    activities,
    students,
    relationAvailable: true,
  });
}
