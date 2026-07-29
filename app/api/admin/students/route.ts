import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "../../../lib/admin-auth";
import { getSupabase } from "../../../lib/supabase-server";

type StudentRow = {
  id: string;
  studentname?: string | null;
  studentid?: string | null;
  stud_username?: string | null;
};

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("studenttbl")
    .select("id, studentname, studentid, stud_username")
    .order("studentname");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as StudentRow[];
  const sortedRows = [...rows].sort((a, b) => {
    const aId = Number(a.id);
    const bId = Number(b.id);
    if (!Number.isNaN(aId) && !Number.isNaN(bId) && aId !== bId) {
      return bId - aId;
    }
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
  return NextResponse.json(
    sortedRows.map((row) => ({
      id: row.id,
      name: String(row.studentname ?? "").trim(),
      studentId: String(row.studentid ?? "").trim(),
      username: String(row.stud_username ?? "").trim().toLowerCase(),
    }))
  );
}
