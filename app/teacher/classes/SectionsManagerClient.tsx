"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type SectionRow = {
  id: string;
  name: string;
  joinCode?: string;
};

type SectionMemberActivity = {
  id: string;
  quizcode: string;
  quizname: string;
  assessmentType: "quiz" | "exam";
  period: string;
  submissionDeadline?: string | null;
  status?: "no_deadline" | "upcoming" | "overdue";
};

type SectionMemberRow = {
  dbId: string;
  studentName: string;
  studentId: string;
  completedCount: number;
  missingCount: number;
  overdueCount?: number;
  missingActivities: SectionMemberActivity[];
  overdueActivities?: SectionMemberActivity[];
};

type SectionMembersPayload = {
  section: SectionRow;
  activities: SectionMemberActivity[];
  students: SectionMemberRow[];
  relationAvailable: boolean;
};

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  try {
    const text = await res.text();
    if (!text) return {};
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readStringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

export default function SectionsManagerClient({ initialSections }: { initialSections: SectionRow[] }) {
  const [sections, setSections] = useState<SectionRow[]>(initialSections);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [sectionCode, setSectionCode] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const [sectionMembersById, setSectionMembersById] = useState<Record<string, SectionMembersPayload>>({});
  const [loadingSectionId, setLoadingSectionId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleSections = useMemo(() => {
    return sections
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  }, [sections]);

  const handleCopy = async (code: string) => {
    const value = String(code ?? "").trim();
    if (!value) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedCode(value);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      setError("Failed to copy section code");
    }
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = sectionName.trim();
    const code = sectionCode.trim().toUpperCase();
    if (!name) {
      setError("Section name required.");
      setMessage(null);
      return;
    }

    setSaving(true);
    setError("");
    setMessage(null);
    try {
      const res = await fetch("/api/teacher/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, sectionCode: code }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        setError(readStringField(data, "error") ?? "Failed to create section");
        return;
      }

      const createdSection: SectionRow = {
        id: readStringField(data, "id") ?? "",
        name: readStringField(data, "name") ?? name,
        joinCode: readStringField(data, "joinCode") ?? undefined,
      };

      setSections((prev) =>
        [...prev.filter((item) => item.id !== createdSection.id), createdSection].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
        )
      );
      setSectionName("");
      setSectionCode("");
      setMessage(
        createdSection.joinCode
          ? `Section created. Share code ${createdSection.joinCode} with your students.`
          : "Section created."
      );
    } catch {
      setError("Failed to create section");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMembers = async (section: SectionRow) => {
    const isOpen = expandedSectionId === section.id;
    if (isOpen) {
      setExpandedSectionId(null);
      return;
    }

    setExpandedSectionId(section.id);
    if (sectionMembersById[section.id]) return;

    setLoadingSectionId(section.id);
    setError("");
    try {
      const res = await fetch(`/api/teacher/classes/${encodeURIComponent(section.id)}/members`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        setError(readStringField(data, "error") ?? "Failed to load joined students");
        return;
      }
      setSectionMembersById((prev) => ({
        ...prev,
        [section.id]: data as unknown as SectionMembersPayload,
      }));
    } catch {
      setError("Failed to load joined students");
    } finally {
      setLoadingSectionId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-300/80">Teacher</p>
            <h1 className="text-3xl font-semibold text-white">Manage Sections</h1>
            <p className="mt-2 text-sm text-slate-400">
              Create sections, view section codes, and share the right code with your students.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/teacher/guide"
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
            >
              Teacher Guide
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
            >
              Refresh
            </button>
            <Link
              href="/teacher"
              className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600"
            >
              Back To Dashboard
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/15 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-3 text-sm text-emerald-200">
            {message}
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
          <h2 className="mb-4 text-lg font-semibold text-cyan-300">Add Section</h2>
          <form onSubmit={handleCreateSection} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
            <input
              type="text"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="Section name"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <input
              type="text"
              value={sectionCode}
              onChange={(e) => setSectionCode(e.target.value.toUpperCase())}
              placeholder="Custom section code (optional)"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Add Section"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-cyan-300">Section Codes</h2>
              <p className="text-sm text-slate-400">
                Students use the section code to join the correct section before accessing quizzes.
              </p>
            </div>
            <div className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-400">
              {visibleSections.length} section{visibleSections.length === 1 ? "" : "s"}
            </div>
          </div>

          {visibleSections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-8 text-center text-sm text-slate-500">
              No sections yet. Create one above to get a shareable code.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {visibleSections.map((section) => (
                <div
                  key={section.id}
                  className="rounded-2xl border border-slate-700 bg-slate-950/80 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white">{section.name}</p>
                      <p className="mt-1 font-mono text-sm tracking-[0.15em] text-cyan-300">{section.joinCode}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleMembers(section)}
                        className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
                      >
                        {expandedSectionId === section.id ? "Hide Joined" : "View Joined"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(section.joinCode ?? "")}
                        className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
                      >
                        {copiedCode === section.joinCode ? "Copied!" : "Copy Code"}
                      </button>
                    </div>
                  </div>

                  {expandedSectionId === section.id && (
                    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      {loadingSectionId === section.id ? (
                        <p className="text-sm text-slate-400">Loading joined students...</p>
                      ) : (() => {
                        const details = sectionMembersById[section.id];
                        if (!details) {
                          return <p className="text-sm text-slate-400">No details loaded yet.</p>;
                        }
                        if (!details.relationAvailable) {
                          return (
                            <p className="text-sm text-slate-400">
                              Student-section membership data is not available yet because the `student_sections` table is missing.
                            </p>
                          );
                        }
                        return (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm text-slate-300">
                                {details.students.length} joined student{details.students.length === 1 ? "" : "s"}
                              </p>
                              <p className="text-xs text-slate-500">
                                Activity tracking is available in the Section Status modal on the main dashboard.
                              </p>
                            </div>

                            {details.students.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-5 text-sm text-slate-500">
                                No students have joined this section yet.
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {details.students.map((student) => (
                                  <div key={`${section.id}-${student.dbId}`} className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-white">{student.studentName}</p>
                                        <p className="text-xs text-slate-400">
                                          {student.studentId ? `Student ID: ${student.studentId}` : "No student ID"}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-cyan-200">
                                          Joined
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
