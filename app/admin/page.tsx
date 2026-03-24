"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Section = { id: string; name: string; joinCode?: string };
type Subject = {
  id: string;
  name: string;
  slug?: string;
  archived?: boolean;
  yearLevel?: number | null;
  semester?: string | null;
  code?: string | null;
};
type Teacher = { id: string; name: string; email: string; approved?: boolean; created_at?: string };
type Student = { id: string; name: string; studentId: string; username: string };
type AdminTab = "sections" | "subjects" | "teachers" | "students" | "storage";

const ADMIN_NAV_ITEMS: Array<{ id: AdminTab; label: string; caption: string }> = [
  { id: "sections", label: "Sections", caption: "Manage join groups and section codes." },
  { id: "subjects", label: "Subjects", caption: "Create, archive, and maintain subject records." },
  { id: "teachers", label: "Teachers", caption: "Approve accounts and maintain teacher access." },
  { id: "students", label: "Students", caption: "Reset passwords and review learner accounts." },
  { id: "storage", label: "Storage", caption: "Clean up uploaded quiz image assets." },
];

const PAGE_SIZE = 8;

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [tab, setTab] = useState<AdminTab>("sections");
  const [navOpen, setNavOpen] = useState(false);
  const [pages, setPages] = useState<Record<AdminTab, number>>({
    sections: 1,
    subjects: 1,
    teachers: 1,
    students: 1,
    storage: 1,
  });
  const [sectionName, setSectionName] = useState("");
  const [sectionCode, setSectionCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [subjectYearLevel, setSubjectYearLevel] = useState<number | "">("");
  const [subjectSemester, setSubjectSemester] = useState("");
  const [bulkSubjectYearLevel, setBulkSubjectYearLevel] = useState<number | "">("");
  const [bulkSubjectSemester, setBulkSubjectSemester] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editSectionCode, setEditSectionCode] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editSubjectYearLevel, setEditSubjectYearLevel] = useState<number | "">("");
  const [editSubjectSemester, setEditSubjectSemester] = useState("");
  const [editSubjectArchived, setEditSubjectArchived] = useState(false);
  const [editTeacherPass, setEditTeacherPass] = useState("");
  const [imageDeleteStatus, setImageDeleteStatus] = useState("");
  const [storageImages, setStorageImages] = useState<string[]>([]);
  const [storageSelected, setStorageSelected] = useState<string[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [resettingStudentId, setResettingStudentId] = useState<string | null>(null);
  const [studentResetStatus, setStudentResetStatus] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  const fetchData = useCallback(async () => {
    const base = "/api/admin";
    try {
      const [sRes, subRes, tRes, studentRes] = await Promise.all([
        fetch(`${base}/sections`, { credentials: "include" }),
        fetch(`${base}/subjects`, { credentials: "include" }),
        fetch(`${base}/teachers`, { credentials: "include" }),
        fetch(`${base}/students`, { credentials: "include" }),
      ]);
      if (sRes.status === 401 || subRes.status === 401 || tRes.status === 401 || studentRes?.status === 401) {
        setAuthenticated(false);
        return;
      }
      setAuthenticated(true);
      if (sRes.ok) setSections(await sRes.json());
      if (subRes.ok) setSubjects(await subRes.json());
      if (tRes.ok) setTeachers(await tRes.json());
      if (studentRes?.ok) setStudents(await studentRes.json());
    } catch {
      setAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/sections", { credentials: "include" });
      if (res.status === 401) setAuthenticated(false);
      else if (res.ok) {
        setAuthenticated(true);
        fetchData();
      } else setAuthenticated(false);
    })();
  }, [fetchData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      setAuthenticated(true);
      fetchData();
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin-logout", { method: "POST", credentials: "include" });
    setAuthenticated(false);
  };

  const addSection = async () => {
    if (!sectionName.trim()) return;
    const res = await fetch("/api/admin/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: sectionName.trim(), sectionCode: sectionCode.trim() || undefined }),
    });
    if (res.ok) {
      setSectionName("");
      setSectionCode("");
      fetchData();
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed");
    }
  };

  const addSubject = async () => {
    if (!subjectName.trim()) return;
    const slug = subjectSlug.trim() || subjectName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const res = await fetch("/api/admin/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: subjectName.trim(),
        slug,
        yearLevel: subjectYearLevel === "" ? null : subjectYearLevel,
        semester: subjectSemester.trim() || null,
      }),
    });
    if (res.ok) {
      setSubjectName("");
      setSubjectSlug("");
      setSubjectYearLevel("");
      setSubjectSemester("");
      fetchData();
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed");
    }
  };

  const addTeacher = async () => {
    if (!teacherName.trim() || !teacherEmail.trim() || !teacherPassword) return;
    if (teacherPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    const res = await fetch("/api/admin/teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: teacherName.trim(),
        email: teacherEmail.trim(),
        password: teacherPassword,
      }),
    });
    if (res.ok) {
      setTeacherName("");
      setTeacherEmail("");
      setTeacherPassword("");
      fetchData();
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed");
    }
  };

  const updateSection = async (id: string) => {
    const name = editValue.trim();
    const code = editSectionCode.trim();
    if (!name && !code) return;
    const res = await fetch(`/api/admin/sections/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: name || undefined, sectionCode: code }),
    });
    if (res.ok) {
      setEditingId(null);
      setEditSectionCode("");
      fetchData();
    }
  };

  const regenerateSectionCodes = async () => {
    const ok = confirm("Generate new section codes for ALL sections? Students will need the new codes to re-join.");
    if (!ok) return;
    const res = await fetch("/api/admin/sections/regenerate-codes", {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) fetchData();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to regenerate codes");
    }
  };

  const updateSubject = async (id: string) => {
    const name = (editValue ?? "").trim();
    if (!name) return;
    const res = await fetch(`/api/admin/subjects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name,
        yearLevel: editSubjectYearLevel === "" ? null : editSubjectYearLevel,
        semester: editSubjectSemester.trim() || null,
        archived: editSubjectArchived,
      }),
    });
    if (res.ok) {
      setEditingId(null);
      fetchData();
    }
  };

  const regenerateSubjectCode = async (id: string) => {
    const ok = confirm("Generate a new code for this subject?");
    if (!ok) return;
    const res = await fetch(`/api/admin/subjects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ regenerateCode: true }),
    });
    if (res.ok) fetchData();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to regenerate code");
    }
  };

  const bulkArchiveSubjects = async (archived: boolean) => {
    if (bulkSubjectYearLevel === "" && !bulkSubjectSemester.trim()) {
      setError("Select a year level and/or semester first.");
      return;
    }
    const label = archived ? "archive" : "unarchive";
    const ok = confirm(`This will ${label} all matching subjects. Continue?`);
    if (!ok) return;
    const res = await fetch("/api/admin/subjects/archive-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        yearLevel: bulkSubjectYearLevel === "" ? null : bulkSubjectYearLevel,
        semester: bulkSubjectSemester.trim() || null,
        archived,
      }),
    });
    if (res.ok) fetchData();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed");
    }
  };

  const updateTeacher = async (id: string) => {
    const body: { name?: string; email?: string; password?: string } = {};
    if (editValue.trim()) body.name = editValue.trim();
    if (editSlug.trim()) body.email = editSlug.trim();
    if (editTeacherPass.length >= 6) body.password = editTeacherPass;
    if (Object.keys(body).length === 0) return;
    const res = await fetch(`/api/admin/teachers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setEditingId(null);
      setEditTeacherPass("");
      fetchData();
    }
  };

  const approveTeacher = async (id: string) => {
    const res = await fetch(`/api/admin/teachers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ approved: true }),
    });
    if (res.ok) fetchData();
  };

  const disapproveTeacher = async (id: string) => {
    const res = await fetch(`/api/admin/teachers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ approved: false }),
    });
    if (res.ok) fetchData();
  };

  const deleteSection = async (id: string) => {
    if (!confirm("Delete this section?")) return;
    const res = await fetch(`/api/admin/sections/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) fetchData();
  };

  const deleteSubject = async (id: string) => {
    if (!confirm("Delete this subject? Questions will be deleted too.")) return;
    const res = await fetch(`/api/admin/subjects/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) fetchData();
  };

  const deleteTeacher = async (id: string) => {
    if (!confirm("Delete this teacher?")) return;
    const res = await fetch(`/api/admin/teachers/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) fetchData();
  };

  const resetStudentPassword = async (student: Student) => {
    const ok = confirm(`Reset ${student.name || student.studentId || student.username}'s password to quizzer2025?`);
    if (!ok) return;
    setStudentResetStatus("");
    setResettingStudentId(student.id);
    try {
      const res = await fetch(`/api/admin/students/${student.id}/reset-password`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to reset password");
        return;
      }
      setStudentResetStatus(`Password reset for ${student.name || student.studentId || student.username}. Default password: quizzer2025`);
    } finally {
      setResettingStudentId(null);
    }
  };

  const loadStorageImages = async () => {
    setStorageLoading(true);
    try {
      const res = await fetch("/api/admin/quiz-images", { credentials: "include" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImageDeleteStatus(d.error ?? "Failed to load images");
        return;
      }
      setStorageImages(Array.isArray(d.urls) ? d.urls : []);
      setStorageSelected([]);
    } finally {
      setStorageLoading(false);
    }
  };

  const deleteSelectedImages = async () => {
    if (storageSelected.length === 0) return;
    if (!confirm(`Delete ${storageSelected.length} selected image(s)? This cannot be undone.`)) return;
    setImageDeleteStatus("");
    const res = await fetch("/api/admin/quiz-images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ urls: storageSelected }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setImageDeleteStatus(d.error ?? "Failed to delete images");
      return;
    }
    setImageDeleteStatus(`Deleted ${d.deleted ?? storageSelected.length} image(s).`);
    await loadStorageImages();
  };

  const deleteAllImages = async () => {
    if (!confirm("Delete ALL images from the bucket? This cannot be undone.")) return;
    setImageDeleteStatus("");
    const res = await fetch("/api/admin/quiz-images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ all: true }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setImageDeleteStatus(d.error ?? "Failed to delete all images");
      return;
    }
    setImageDeleteStatus(`Deleted ${d.deleted ?? 0} image(s).`);
    await loadStorageImages();
  };

  const selectTab = (nextTab: AdminTab) => {
    setTab(nextTab);
    setNavOpen(false);
  };

  const setPageFor = (target: AdminTab, nextPage: number) => {
    setPages((prev) => ({ ...prev, [target]: nextPage }));
  };

  const paginateItems = <T,>(items: T[], target: AdminTab) => {
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const currentPage = Math.min(pages[target], totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    return {
      currentPage,
      totalPages,
      items: items.slice(start, start + PAGE_SIZE),
      totalItems: items.length,
      startItem: items.length === 0 ? 0 : start + 1,
      endItem: Math.min(start + PAGE_SIZE, items.length),
    };
  };

  const normalizedStudentSearch = studentSearch.trim().toLowerCase();
  const filteredStudents = normalizedStudentSearch
    ? students.filter((student) =>
        [student.name, student.studentId, student.username]
          .map((value) => String(value ?? "").toLowerCase())
          .some((value) => value.includes(normalizedStudentSearch))
      )
    : students;

  const sectionsPage = paginateItems(sections, "sections");
  const subjectsPage = paginateItems(subjects, "subjects");
  const teachersPage = paginateItems(teachers, "teachers");
  const studentsPage = paginateItems(filteredStudents, "students");
  const storagePage = paginateItems(storageImages, "storage");
  const activeNavItem = ADMIN_NAV_ITEMS.find((item) => item.id === tab) ?? ADMIN_NAV_ITEMS[0];

  const renderPagination = (target: AdminTab, currentPage: number, totalPages: number, totalItems: number, startItem: number, endItem: number) => {
    if (totalItems === 0) return null;
    return (
      <div className="mt-4 flex flex-col gap-3 border-t border-slate-700/70 pt-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing <span className="text-slate-200">{startItem}</span> to <span className="text-slate-200">{endItem}</span> of{" "}
          <span className="text-slate-200">{totalItems}</span>
        </p>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setPageFor(target, Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-700 bg-slate-800/70 px-3 text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="min-w-[72px] text-center text-slate-300">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPageFor(target, Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-700 bg-slate-800/70 px-3 text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
        <p className="text-slate-400">Checking access...</p>
      </div>
    );
  }

  if (authenticated !== true) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
        <div className="w-full max-w-sm rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 shadow-2xl">
          <h1 className="text-xl font-bold text-center mb-2 text-amber-400">Admin</h1>
          <p className="text-slate-400 text-sm text-center mb-6">Enter admin password</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold"
            >
              {loading ? "Checking..." : "Enter"}
            </button>
          </form>
          <p className="mt-6 text-center">
            <Link href="/" className="text-slate-500 hover:text-cyan-400 text-sm">← Home</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 p-6 text-slate-100 md:p-10">
      {navOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[18rem] transform border-r border-slate-800 bg-slate-950/95 px-4 py-5 shadow-2xl shadow-amber-950/20 backdrop-blur transition-transform duration-300 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-800/80 pb-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/75">Admin Workspace</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">System Control</h2>
            <p className="mt-2 text-sm text-slate-400">{activeNavItem.caption}</p>
          </div>
          <nav className="mt-5 flex-1 space-y-2 overflow-y-auto pr-1">
            {ADMIN_NAV_ITEMS.map((item, index) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`group w-full rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-amber-500/60 bg-amber-500/15 text-white shadow-lg shadow-amber-950/20"
                      : "border-slate-800 bg-slate-900/55 text-slate-300 hover:border-slate-700 hover:bg-slate-900/85"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        active ? "bg-amber-300 text-slate-950" : "bg-slate-800 text-slate-400 group-hover:bg-slate-700"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className={`font-semibold ${active ? "text-white" : "text-slate-200"}`}>{item.label}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-400">{item.caption}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
          <div className="mt-5 border-t border-slate-800/80 pt-4">
            {/* <Link href="/" className="text-sm font-medium text-amber-300 hover:text-amber-200">
              â† Back Home
            </Link> */}
            <button
              type="button"
              onClick={handleLogout}
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>
      <div className="mx-auto max-w-[96rem]">
	        <div className="mb-6 px-1 py-1 sm:px-2">
	          <div className="flex items-start justify-between gap-3">
	            <div className="flex min-w-0 items-start gap-3">
	              <button
	                type="button"
	                onClick={() => setNavOpen((open) => !open)}
	                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
	                aria-label="Toggle navigation"
	              >
	                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
	                  <path
	                    strokeLinecap="round"
	                    strokeLinejoin="round"
	                    strokeWidth={2}
	                    d={navOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
	                  />
	                </svg>
	              </button>
	              <div className="min-w-0">
	                <h1 className="break-words text-2xl font-bold text-amber-300">Admin</h1>
	                <p className="mt-1 text-sm text-slate-400">{activeNavItem.caption}</p>
	              </div>
	            </div>
	          </div>
	          <div className="hidden">
            <Link href="/" className="text-slate-500 hover:text-cyan-400 text-sm">← Home</Link>
            <h1 className="text-2xl font-bold text-amber-300">Admin</h1>
          </div>
		          <button
		            onClick={handleLogout}
		            className="hidden px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium"
		          >
	            Logout
	          </button>
	          </div>
	        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/50 text-red-200 text-sm">
            {error}
          </div>
        )}

	        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/20 sm:p-6">
	          {tab === "sections" && (
	            <>
	              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
	                <h2 className="text-lg font-semibold text-slate-200">Sections</h2>
	                <button
	                  type="button"
	                  onClick={regenerateSectionCodes}
	                  className="px-3 py-2 rounded-xl bg-amber-700/70 hover:bg-amber-700 text-white text-sm font-semibold"
	                >
	                  Regenerate All Codes
	                </button>
	              </div>
	              <div className="flex gap-2 mb-4">
	                <input
	                  value={sectionName}
	                  onChange={(e) => setSectionName(e.target.value)}
	                  placeholder="Section name (e.g. 01-P)"
	                  className="flex-1 px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
	                />
	                <input
	                  value={sectionCode}
	                  onChange={(e) => setSectionCode(e.target.value)}
	                  placeholder="Section code (optional)"
	                  className="w-56 px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase"
	                />
	                <button onClick={addSection} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium">
	                  Add
	                </button>
	              </div>
	              <ul className="space-y-2">
		                {sectionsPage.items.map((s) => (
	                  <li key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50">
	                    {editingId === s.id ? (
	                      <>
	                        <input
	                          value={editValue}
	                          onChange={(e) => setEditValue(e.target.value)}
	                          className="flex-1 px-3 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200"
	                        />
	                        <input
	                          value={editSectionCode}
	                          onChange={(e) => setEditSectionCode(e.target.value)}
	                          placeholder="Section code"
	                          className="ml-2 w-40 px-3 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200 uppercase"
	                        />
	                        <button onClick={() => updateSection(s.id)} className="ml-2 px-3 py-1 rounded bg-amber-600 text-white text-sm">Save</button>
	                        <button onClick={() => { setEditingId(null); setEditSectionCode(""); }} className="ml-1 px-3 py-1 rounded bg-slate-600 text-sm">Cancel</button>
	                      </>
	                    ) : (
	                      <>
	                        <div>
	                          <div className="font-medium text-slate-200">{s.name}</div>
	                          {s.joinCode && (
	                            <div className="text-slate-400 text-xs">
	                              Join code: <span className="font-mono">{s.joinCode}</span>
	                            </div>
	                          )}
	                        </div>
	                        <div>
	                          <button onClick={() => { setEditingId(s.id); setEditValue(s.name); setEditSectionCode(s.joinCode ?? ""); }} className="px-3 py-1 rounded bg-slate-600 text-sm mr-1">Edit</button>
	                          <button onClick={() => deleteSection(s.id)} className="px-3 py-1 rounded bg-red-600/80 text-sm">Delete</button>
	                        </div>
	                      </>
	                    )}
                  </li>
                ))}
	              </ul>
	              {renderPagination("sections", sectionsPage.currentPage, sectionsPage.totalPages, sectionsPage.totalItems, sectionsPage.startItem, sectionsPage.endItem)}
	            </>
	          )}

	          {tab === "subjects" && (
	            <>
	              <h2 className="text-lg font-semibold text-slate-200 mb-4">Subjects</h2>
                <div className="rounded-xl bg-slate-900/30 border border-slate-700/40 p-4 mb-4">
                  <div className="flex flex-wrap items-end gap-2 justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={bulkSubjectYearLevel}
                        onChange={(e) => setBulkSubjectYearLevel(e.target.value ? Number(e.target.value) : "")}
                        className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Year level</option>
                        <option value={1}>1st year</option>
                        <option value={2}>2nd year</option>
                        <option value={3}>3rd year</option>
                        <option value={4}>4th year</option>
                      </select>
                      <select
                        value={bulkSubjectSemester}
                        onChange={(e) => setBulkSubjectSemester(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Semester</option>
                        <option value="1">1st sem</option>
                        <option value="2">2nd sem</option>
                        <option value="summer">Summer</option>
                      </select>
                      <span className="text-xs text-slate-500">
                        Bulk actions: archive/unarchive by year/semester (use at semester end).
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => bulkArchiveSubjects(true)}
                        className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium"
                      >
                        Archive
                      </button>
                      <button
                        onClick={() => bulkArchiveSubjects(false)}
                        className="px-3 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium"
                      >
                        Unarchive
                      </button>
                    </div>
                  </div>
                </div>
	              <div className="space-y-2 mb-4">
	                <input
	                  value={subjectName}
	                  onChange={(e) => setSubjectName(e.target.value)}
	                  placeholder="Subject name (e.g. Human Computer Interaction)"
	                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
	                />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      value={subjectSlug}
                      onChange={(e) => setSubjectSlug(e.target.value)}
                      placeholder="Slug (optional, e.g. hci)"
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <select
                      value={subjectYearLevel}
                      onChange={(e) => setSubjectYearLevel(e.target.value ? Number(e.target.value) : "")}
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">Year level (optional)</option>
                      <option value={1}>1st year</option>
                      <option value={2}>2nd year</option>
                      <option value={3}>3rd year</option>
                      <option value={4}>4th year</option>
                    </select>
                    <select
                      value={subjectSemester}
                      onChange={(e) => setSubjectSemester(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">Semester (optional)</option>
                      <option value="1">1st sem</option>
                      <option value="2">2nd sem</option>
                      <option value="summer">Summer</option>
                    </select>
                  </div>
	                <button onClick={addSubject} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium">
	                  Add Subject
	                </button>
	              </div>
	              <ul className="space-y-2">
		                {subjectsPage.items.map((s) => (
	                  <li key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50">
	                    {editingId === s.id ? (
	                      <>
	                        <div className="flex-1 space-y-1">
	                          <input
	                            value={editValue}
	                            onChange={(e) => setEditValue(e.target.value)}
	                            placeholder="Name"
	                            className="w-full px-3 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200"
	                          />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <select
                                value={editSubjectYearLevel}
                                onChange={(e) => setEditSubjectYearLevel(e.target.value ? Number(e.target.value) : "")}
                                className="w-full px-3 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200"
                              >
                                <option value="">Year level</option>
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                                <option value={3}>3</option>
                                <option value={4}>4</option>
                              </select>
                              <select
                                value={editSubjectSemester}
                                onChange={(e) => setEditSubjectSemester(e.target.value)}
                                className="w-full px-3 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200"
                              >
                                <option value="">Semester</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="summer">summer</option>
                              </select>
                              <label className="flex items-center gap-2 px-3 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200">
                                <input
                                  type="checkbox"
                                  checked={editSubjectArchived}
                                  onChange={(e) => setEditSubjectArchived(e.target.checked)}
                                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500"
                                />
                                <span className="text-xs">Archived</span>
                              </label>
                            </div>
	                        </div>
	                        <button onClick={() => updateSubject(s.id)} className="ml-2 px-3 py-1 rounded bg-amber-600 text-white text-sm">Save</button>
	                        <button onClick={() => setEditingId(null)} className="ml-1 px-3 py-1 rounded bg-slate-600 text-sm">Cancel</button>
	                      </>
	                    ) : (
	                      <>
                          <div className="min-w-0">
                            <div className="text-slate-200 font-medium truncate">
                              {s.name}{" "}
                              {s.archived ? (
                                <span className="ml-2 px-2 py-0.5 rounded border text-xs bg-amber-600/15 text-amber-200 border-amber-500/40">
                                  Archived
                                </span>
                              ) : null}
                            </div>
                            <div className="text-slate-400 text-xs mt-0.5">
                              {s.yearLevel ? <span>Year {s.yearLevel}</span> : <span>Year —</span>}
                              {" · "}
                              {s.semester ? <span>Sem {s.semester}</span> : <span>Sem —</span>}
                              {" · "}
                              Code: <span className="font-mono">{s.code ?? "—"}</span>
                            </div>
                          </div>
	                        <div>
	                          <button
                              onClick={() => regenerateSubjectCode(s.id)}
                              className="px-3 py-1 rounded bg-slate-600 text-sm mr-1"
                            >
                              New code
                            </button>
	                          <button
                              onClick={() => {
                                setEditingId(s.id);
                                setEditValue(s.name);
                                setEditSubjectYearLevel(s.yearLevel ?? "");
                                setEditSubjectSemester(s.semester ?? "");
                                setEditSubjectArchived(Boolean(s.archived));
                              }}
                              className="px-3 py-1 rounded bg-slate-600 text-sm mr-1"
                            >
                              Edit
                            </button>
	                          <button onClick={() => deleteSubject(s.id)} className="px-3 py-1 rounded bg-red-600/80 text-sm">Delete</button>
	                        </div>
	                      </>
	                    )}
	                  </li>
	                ))}
		              </ul>
		              {renderPagination("subjects", subjectsPage.currentPage, subjectsPage.totalPages, subjectsPage.totalItems, subjectsPage.startItem, subjectsPage.endItem)}
	            </>
	          )}

	          {tab === "teachers" && (
            <>
              <h2 className="text-lg font-semibold text-slate-200 mb-4">Teachers</h2>
              <div className="space-y-2 mb-4">
                <input
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  placeholder="Teacher name"
                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="email"
                  value={teacherEmail}
                  onChange={(e) => setTeacherEmail(e.target.value)}
                  placeholder="Email (used to log in)"
                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="password"
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  placeholder="Password (min 6 characters)"
                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button onClick={addTeacher} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium">
                  Add Teacher
                </button>
              </div>
              <ul className="space-y-2">
	                {teachersPage.items.map((t) => (
                  <li key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50">
                    {editingId === t.id ? (
                      <>
                        <div className="flex-1 space-y-1">
                          <input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="Name"
                            className="w-full px-3 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200"
                          />
                          <input
                            value={editSlug}
                            onChange={(e) => setEditSlug(e.target.value)}
                            placeholder="Email"
                            className="w-full px-3 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200"
                          />
                          <input
                            type="password"
                            value={editTeacherPass}
                            onChange={(e) => setEditTeacherPass(e.target.value)}
                            placeholder="New password (optional)"
                            className="w-full px-3 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200"
                          />
                        </div>
                        <button onClick={() => updateTeacher(t.id)} className="ml-2 px-3 py-1 rounded bg-amber-600 text-white text-sm">Save</button>
                        <button onClick={() => setEditingId(null)} className="ml-1 px-3 py-1 rounded bg-slate-600 text-sm">Cancel</button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-200">
                            {t.name} <span className="text-slate-500 text-sm">({t.email})</span>
                          </span>
                          {t.approved ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-300 border border-emerald-500/40">
                              Approved
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-300 border border-amber-500/40">
                              Pending
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {!t.approved && (
                            <button
                              onClick={() => approveTeacher(t.id)}
                              className="px-3 py-1 rounded bg-emerald-600 text-sm text-white"
                            >
                              Approve
                            </button>
                          )}
                          {t.approved && (
                            <button
                              onClick={() => disapproveTeacher(t.id)}
                              className="px-3 py-1 rounded bg-amber-600 text-sm text-white"
                            >
                              Disapprove
                            </button>
                          )}
                          <button onClick={() => { setEditingId(t.id); setEditValue(t.name); setEditSlug(t.email); }} className="px-3 py-1 rounded bg-slate-600 text-sm">
                            Edit
                          </button>
                          <button onClick={() => deleteTeacher(t.id)} className="px-3 py-1 rounded bg-red-600/80 text-sm">
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
	              </ul>
	              {renderPagination("teachers", teachersPage.currentPage, teachersPage.totalPages, teachersPage.totalItems, teachersPage.startItem, teachersPage.endItem)}
            </>
	          )}
          {tab === "students" && (
            <>
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">Students</h2>
                  <p className="text-sm text-slate-400">Admin can reset a student password back to <span className="font-mono text-slate-200">quizzer2025</span>.</p>
                </div>
                <button
                  onClick={fetchData}
                  className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm"
                >
                  Refresh
                </button>
              </div>
	              {studentResetStatus && (
	                <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
	                  {studentResetStatus}
	                </div>
	              )}
	              <div className="mb-4">
	                <input
	                  type="search"
	                  value={studentSearch}
	                  onChange={(e) => {
	                    setStudentSearch(e.target.value);
	                    setPageFor("students", 1);
	                  }}
	                  placeholder="Search by student name, ID, or username"
	                  className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
	                />
	              </div>
	              <ul className="space-y-2">
		                {studentsPage.items.map((student) => (
                  <li key={student.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-700/50">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-200 truncate">
                        {student.name || "Unnamed student"}
                      </div>
                      <div className="text-slate-400 text-xs mt-0.5">
                        ID: <span className="font-mono">{student.studentId || "N/A"}</span>
                        {" · "}
                        Username: <span>{student.username || "N/A"}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => resetStudentPassword(student)}
                      disabled={resettingStudentId === student.id}
                      className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {resettingStudentId === student.id ? "Resetting..." : "Reset Password"}
                    </button>
                  </li>
                ))}
	              </ul>
	              {renderPagination("students", studentsPage.currentPage, studentsPage.totalPages, studentsPage.totalItems, studentsPage.startItem, studentsPage.endItem)}
	              {filteredStudents.length === 0 && (
	                <p className="text-slate-400 text-sm">
	                  {studentSearch.trim() ? "No students match your search." : "No students found."}
	                </p>
	              )}
            </>
          )}
          {tab === "storage" && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-200">Storage Cleanup</h2>
                <button
                  onClick={loadStorageImages}
                  className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm"
                >
                  Refresh
                </button>
              </div>
              <p className="text-sm text-slate-400 mb-4">
                Select images to delete, or delete all images in the bucket.
              </p>
              {storageLoading ? (
                <p className="text-slate-400">Loading images...</p>
              ) : storageImages.length === 0 ? (
                <p className="text-slate-400">No images found.</p>
              ) : (
                <div className="rounded-lg border border-slate-600/60 bg-slate-900/40 p-3 max-h-80 overflow-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => setStorageSelected(storageImages)}
                      className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setStorageSelected([])}
                      className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200"
                    >
                      Clear
                    </button>
                    <span className="text-xs text-slate-400">
                      Selected {storageSelected.length} of {storageImages.length}
                    </span>
                  </div>
                  <ul className="space-y-2">
	                    {storagePage.items.map((url) => (
                      <li key={url} className="flex items-start gap-2 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={storageSelected.includes(url)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setStorageSelected((prev) =>
                              checked ? [...prev, url] : prev.filter((u) => u !== url)
                            );
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                        />
                        <span className="break-all">{url}</span>
                      </li>
                    ))}
	                  </ul>
	                  {renderPagination("storage", storagePage.currentPage, storagePage.totalPages, storagePage.totalItems, storagePage.startItem, storagePage.endItem)}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={deleteSelectedImages}
                  disabled={storageSelected.length === 0}
                  className="px-4 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-medium disabled:opacity-50"
                >
                  Delete Selected
                </button>
                <button
                  onClick={deleteAllImages}
                  className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white font-medium"
                >
                  Delete All Images
                </button>
                {imageDeleteStatus && (
                  <span className="text-sm text-slate-300">{imageDeleteStatus}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
