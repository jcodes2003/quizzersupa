"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Section = { id: string; name: string };
type Subject = { id: string; name: string; slug: string };
type Teacher = { id: string; name: string; email: string; created_at?: string };

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [tab, setTab] = useState<"sections" | "subjects" | "teachers">("sections");
  const [sectionName, setSectionName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editTeacherPass, setEditTeacherPass] = useState("");

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
      body: JSON.stringify({ name: sectionName.trim() }),
    });
    if (res.ok) {
      setSectionName("");
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
      body: JSON.stringify({ name: subjectName.trim(), slug }),
    });
    if (res.ok) {
      setSubjectName("");
      setSubjectSlug("");
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
    if (!editValue.trim()) return;
    const res = await fetch(`/api/admin/sections/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: editValue.trim() }),
    });
    if (res.ok) {
      setEditingId(null);
      fetchData();
    }
  };

  const updateSubject = async (id: string) => {
    const res = await fetch(`/api/admin/subjects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: editValue.trim(), slug: editSlug.trim() }),
    });
    if (res.ok) {
      setEditingId(null);
      fetchData();
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
          {(["sections", "subjects", "teachers"] as const).map((t) => (
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
              <h2 className="text-lg font-semibold text-slate-200 mb-4">Sections</h2>
              <div className="flex gap-2 mb-4">
                <input
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  placeholder="Section name (e.g. 01-P)"
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                        <button onClick={() => updateSection(s.id)} className="ml-2 px-3 py-1 rounded bg-amber-600 text-white text-sm">Save</button>
                        <button onClick={() => setEditingId(null)} className="ml-1 px-3 py-1 rounded bg-slate-600 text-sm">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-slate-200">{s.name}</span>
                        <div>
                          <button onClick={() => { setEditingId(s.id); setEditValue(s.name); }} className="px-3 py-1 rounded bg-slate-600 text-sm mr-1">Edit</button>
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
              <div className="space-y-2 mb-4">
                <input
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="Subject name (e.g. Human Computer Interaction)"
                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  value={subjectSlug}
                  onChange={(e) => setSubjectSlug(e.target.value)}
                  placeholder="Slug (optional, e.g. hci)"
                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
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
                          <input
                            value={editSlug}
                            onChange={(e) => setEditSlug(e.target.value)}
                            placeholder="Slug"
                            className="w-full px-3 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200"
                          />
                        </div>
                        <button onClick={() => updateSubject(s.id)} className="ml-2 px-3 py-1 rounded bg-amber-600 text-white text-sm">Save</button>
                        <button onClick={() => setEditingId(null)} className="ml-1 px-3 py-1 rounded bg-slate-600 text-sm">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-200">{s.name} <span className="text-slate-500 text-sm">({s.slug})</span></span>
                        <div>
                          <button onClick={() => { setEditingId(s.id); setEditValue(s.name); setEditSlug(s.slug); }} className="px-3 py-1 rounded bg-slate-600 text-sm mr-1">Edit</button>
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
                        <span className="text-slate-200">{t.name} <span className="text-slate-500 text-sm">({t.email})</span></span>
                        <div>
                          <button onClick={() => { setEditingId(t.id); setEditValue(t.name); setEditSlug(t.email); }} className="px-3 py-1 rounded bg-slate-600 text-sm mr-1">Edit</button>
                          <button onClick={() => deleteTeacher(t.id)} className="px-3 py-1 rounded bg-red-600/80 text-sm">Delete</button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
