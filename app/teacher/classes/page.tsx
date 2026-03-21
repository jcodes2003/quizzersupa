import SectionsManagerClient from "./SectionsManagerClient";
import { getSectionJoinCode } from "../../lib/section-join";
import { getSupabase } from "../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SectionRow = {
  id: string;
  name: string;
  joinCode?: string;
};

export default async function TeacherSectionsPage() {
  let initialSections: SectionRow[] = [];

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("sections").select("*");
    if (!error) {
      initialSections = ((data ?? []) as Record<string, unknown>[])
        .map((row) => ({
          id: String(row.id ?? ""),
          name: String((row.sectionname ?? row.sectionName ?? row.name ?? "") || "").trim() || "Section",
          joinCode: String((row.section_code ?? row.sectionCode ?? "") || "").trim() || getSectionJoinCode(String(row.id ?? "")),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
    }
  } catch {
    initialSections = [];
  }

  return <SectionsManagerClient initialSections={initialSections} />;
}
