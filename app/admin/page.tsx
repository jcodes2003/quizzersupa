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

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [tab, setTab] = useState<"sections" | "subjects" | "teachers" | "storage">("sections");
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

  const fetchData = useCallback(async () => {
    const base = "/api/admin";
    try {
      const [sRes, subRes, tRes] = await Promise.all([
        fetch(`${base}/sections`, { credentials: "include" }),
        fetch(`${base}/subjects`, { credentials: "include" }),
        fetch(`${base}/teachers`, { credentials: "include" }),
      ]);
      if (sRes.status === 401 || subRes.status === 401 || tRes.status === 401) {
        setAuthenticated(false);
        return;
      }
      setAuthenticated(true);
      if (sRes.ok) setSections(await sRes.json());
      if (subRes.ok) setSubjects(await subRes.json());
      if (tRes.ok) setTeachers(await tRes.json());
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-slate-500 hover:text-cyan-400 text-sm">← Home</Link>
            <h1 className="text-2xl font-bold text-amber-400">Admin</h1>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium"
          >
            Logout
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/50 text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {(["sections", "subjects", "teachers", "storage"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl font-medium capitalize ${tab === t ? "bg-amber-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6 shadow-2xl">
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
	                {sections.map((s) => (
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
	                {subjects.map((s) => (
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
                {teachers.map((t) => (
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
                    {storageImages.map((url) => (
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
