import { getSupabase } from "./supabase-server";

function isMissingRelation(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("relation") && (m.includes("does not exist") || m.includes("not found"));
}

function isMissingColumn(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("not found"));
}

export async function getStudentSectionIds(studentDbId: string): Promise<string[] | null> {
  const supabase = getSupabase();
  const res = await supabase
    .from("student_sections")
    .select("section_id")
    .eq("student_id", studentDbId);

  const errMsg = (res.error as { message?: string } | null)?.message ?? "";
  if (errMsg && (isMissingRelation(errMsg) || isMissingColumn(errMsg))) return null;
  if (res.error) throw res.error;

  const rows = (res.data ?? []) as Array<{ section_id?: string | null }>;
  return rows.map((r) => String(r.section_id ?? "").trim()).filter(Boolean);
}

export async function addStudentToSection(studentDbId: string, sectionId: string): Promise<boolean | null> {
  const supabase = getSupabase();
  const insert = await supabase
    .from("student_sections")
    .insert({ student_id: studentDbId, section_id: sectionId });

  const errMsg = (insert.error as { message?: string } | null)?.message ?? "";
  if (errMsg && (isMissingRelation(errMsg) || isMissingColumn(errMsg))) return null;

  // If duplicate constraint exists, treat duplicate as ok.
  if (errMsg && errMsg.toLowerCase().includes("duplicate")) return true;
  if (insert.error) throw insert.error;
  return true;
}

