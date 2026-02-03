"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type QuizResponseRow = {
  id: string;
  quizcode: string;
  subjectid: string;
  sectionid: string;
  score: number | null;
  max_score?: number;
  student_id?: string;
  attempt_number?: number;
  studentname: string | null;
  created_at?: string;
  // Joined, human-readable names from API
  section?: string;
  subject?: string;
  sectionname?: string;
  subjectname?: string;
};

type Subject = { id: string; name: string; slug: string };
type Section = { id: string; name: string };

type QuizRow = {
  id: string;
  teacherid: string;
  subjectid: string;
  quizcode: string;
  sectionid: string;
};

type QuestionRow = {
  id: string;
  quizid: string;
  question: string;
  quiztype: string;
  answerkey?: string | null;
  options?: string | null;
};

const SUBJECT_LABELS: Record<string, string> = {
  hci: "Human Computer Interaction",
  cp2: "Computer Programming 2",
  itera: "Living in IT Era",
};

function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(rows: QuizResponseRow[]) {
  const headers = ["Quiz Code", "Student Name", "Student ID", "Score", "Max Score", "Attempt #", "Section", "Subject", "Created"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(r.quizcode),
        escapeCsvCell(r.studentname ?? ""),
        escapeCsvCell(r.student_id ?? ""),
        escapeCsvCell(r.score ?? ""),
        escapeCsvCell(r.max_score ?? ""),
        escapeCsvCell(r.attempt_number ?? ""),
        escapeCsvCell(r.section ?? ""),
        escapeCsvCell(r.subject ?? ""),
        escapeCsvCell(r.created_at ? new Date(r.created_at).toLocaleString() : ""),
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quiz-responses-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadReportCsv(rows: QuizResponseRow[]) {
  const headers = ["Quiz Code", "Student Name", "Student ID", "Section", "Subject", "Score", "Max Score", "Percentage", "Date"];
  const lines = [
    headers.join(","),
    ...rows.map((r) => {
      const percentage = r.max_score ? Math.round((r.score! / r.max_score) * 100) : 0;
      return [
        escapeCsvCell(r.quizcode),
        escapeCsvCell(r.studentname ?? ""),
        escapeCsvCell(r.student_id ?? ""),
        escapeCsvCell(r.section ?? ""),
        escapeCsvCell(r.subject ?? ""),
        escapeCsvCell(r.score ?? ""),
        escapeCsvCell(r.max_score ?? ""),
        escapeCsvCell(percentage),
        escapeCsvCell(r.created_at ? new Date(r.created_at).toLocaleDateString() : ""),
      ].join(",");
    }),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `student-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const QUESTION_TYPES = [
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "identification", label: "Identification" },
  { value: "enumeration", label: "Enumeration" },
  { value: "long_answer", label: "Long Answer" },
] as const;

export default function TeacherPage() {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [canCreateQuestions, setCanCreateQuestions] = useState(false);
  const [teacherName, setTeacherName] = useState("");
  const [rows, setRows] = useState<QuizResponseRow[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [filterSubject, setFilterSubject] = useState<string>("");
  const [reportFilterSection, setReportFilterSection] = useState<string>("");
  const [reportFilterSubject, setReportFilterSubject] = useState<string>("");
  const [reportFilterDate, setReportFilterDate] = useState<string>("");
  const [tab, setTab] = useState<"responses" | "questions" | "reports">("responses");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [questionsForQuiz, setQuestionsForQuiz] = useState<QuestionRow[]>([]);
  const [quizzesLoading, setQuizzesLoading] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [showCreateQuiz, setShowCreateQuiz] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuizSubjectId, setNewQuizSubjectId] = useState("");
  const [newQuizSectionId, setNewQuizSectionId] = useState("");
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuizType, setNewQuizType] = useState<typeof QUESTION_TYPES[number]["value"]>("multiple_choice");
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>(["", ""]);
  const [newQuestionAnswerKey, setNewQuestionAnswerKey] = useState("");
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const fetchScores = useCallback(async () => {
    setScoresLoading(true);
    try {
      const res = await fetch("/api/teacher-attempts", { credentials: "include" });
      if (res.status === 401) {
        setAuthenticated(false);
        setRows([]);
        return false;
      }
      if (!res.ok) {
        setError("Failed to load responses.");
        return false;
      }
      const data = await res.json();
      setRows(data.rows ?? []);
      setAuthenticated(true);
      return true;
    } catch {
      setError("Failed to load responses.");
      return false;
    } finally {
      setScoresLoading(false);
    }
  }, []);

  const fetchQuizzes = useCallback(async () => {
    setQuizzesLoading(true);
    try {
      const res = await fetch("/api/teacher/quizzes", { credentials: "include" });
      if (res.status === 401) return;
      if (res.ok) {
        setQuizzes(await res.json());
        setCanCreateQuestions(true);
      }
    } finally {
      setQuizzesLoading(false);
    }
  }, []);

  const fetchQuestionsForQuiz = useCallback(async (quizId: string) => {
    setQuestionsLoading(true);
    try {
      const res = await fetch(`/api/teacher/quizzes/${quizId}/questions`, { credentials: "include" });
      if (res.ok) setQuestionsForQuiz(await res.json());
      else setQuestionsForQuiz([]);
    } finally {
      setQuestionsLoading(false);
    }
  }, []);

  const fetchSubjects = useCallback(async () => {
    const res = await fetch("/api/subjects", { credentials: "include" });
    if (res.ok) setSubjects(await res.json());
  }, []);

  const fetchSections = useCallback(async () => {
    const res = await fetch("/api/sections", { credentials: "include" });
    if (res.ok) setSections(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/teacher-attempts", { credentials: "include" });
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows ?? []);
        setAuthenticated(true);
        const qRes = await fetch("/api/teacher/quizzes", { credentials: "include" });
        if (qRes.ok) {
          setQuizzes(await qRes.json());
          setCanCreateQuestions(true);
        }
        const sRes = await fetch("/api/subjects", { credentials: "include" });
        if (sRes.ok) setSubjects(await sRes.json());
        const secRes = await fetch("/api/sections", { credentials: "include" });
        if (secRes.ok) setSections(await secRes.json());
      } else setAuthenticated(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (selectedQuizId) fetchQuestionsForQuiz(selectedQuizId);
    else setQuestionsForQuiz([]);
  }, [selectedQuizId, fetchQuestionsForQuiz]);

  useEffect(() => {
    if (showCreateQuiz) {
      fetchSections();
      fetchSubjects();
    }
  }, [showCreateQuiz, fetchSections, fetchSubjects]);

  useEffect(() => {
    if (showAddQuestion && newQuizType === "multiple_choice") {
      setNewQuestionOptions((prev) => (prev.length >= 2 ? prev : ["", ""]));
    }
  }, [showAddQuestion, newQuizType]);

  useEffect(() => {
    if (tab === "responses" && rows.length > 0 && (subjects.length === 0 || sections.length === 0)) {
      if (subjects.length === 0) fetchSubjects();
      if (sections.length === 0) fetchSections();
    }
  }, [tab, rows.length, subjects.length, sections.length, fetchSubjects, fetchSections]);

  // Debug: log retrieved section/subject names from API rows
  useEffect(() => {
    if (rows.length === 0) return;
    const debugSample = rows.map((r) => ({
      id: r.id,
      sectionid: r.sectionid,
      sectionname: r.sectionname,
      section: r.section,
      subjectid: r.subjectid,
      subjectname: r.subjectname,
      subject: r.subject,
    }));
    // This will appear in the browser devtools console
    console.log("[teacher] attempts rows (section/subject names):", debugSample);
  }, [rows]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body = email.trim() ? { email: email.trim(), password } : { password };
      const res = await fetch("/api/teacher-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      if (data.teacher) {
        setTeacherName(data.teacher.name);
        setCanCreateQuestions(true);
      }
      setAuthenticated(true);
      await fetchScores();
      if (email.trim()) {
        await fetchQuizzes();
        await fetchSubjects();
        await fetchSections();
      } else {
        await fetchSections();
      }
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/teacher-logout", { method: "POST", credentials: "include" });
    setAuthenticated(false);
    setRows([]);
    setCanCreateQuestions(false);
    setQuizzes([]);
    setSelectedQuizId(null);
    setQuestionsForQuiz([]);
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuizSubjectId || !newQuizSectionId) return;
    setSavingQuiz(true);
    setError("");
    try {
      const res = await fetch("/api/teacher/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subjectId: newQuizSubjectId,
          sectionId: newQuizSectionId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to create quiz");
        return;
      }
      setShowCreateQuiz(false);
      setNewQuizSubjectId("");
      setNewQuizSectionId("");
      fetchQuizzes();
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuizId || !newQuestionText.trim()) return;
    if (newQuizType === "multiple_choice") {
      const opts = newQuestionOptions.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) {
        setError("Multiple choice needs at least 2 options.");
        return;
      }
      if (!newQuestionAnswerKey.trim() || !opts.includes(newQuestionAnswerKey.trim())) {
        setError("Select the correct answer from the options.");
        return;
      }
    }
    setSavingQuestion(true);
    setError("");
    try {
      const body: { question: string; quizType: string; options?: string[]; answerkey?: string } = {
        question: newQuestionText.trim(),
        quizType: newQuizType,
      };
      if (newQuizType === "multiple_choice") {
        body.options = newQuestionOptions.map((o) => o.trim()).filter(Boolean);
        body.answerkey = newQuestionAnswerKey.trim();
      }
      const res = await fetch(`/api/teacher/quizzes/${selectedQuizId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save");
        return;
      }
      setShowAddQuestion(false);
      setNewQuestionText("");
      setNewQuestionOptions(["", ""]);
      setNewQuestionAnswerKey("");
      if (selectedQuizId) fetchQuestionsForQuiz(selectedQuizId);
    } finally {
      setSavingQuestion(false);
    }
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    const res = await fetch(`/api/teacher/questions/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok && selectedQuizId) fetchQuestionsForQuiz(selectedQuizId);
  };

  const getSubjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;
  const getSectionName = (id: string) => sections.find((s) => s.id === id)?.name ?? id;

  // Prefer names coming from attempts rows (joined via API), fall back to master lists/ID
  const getSubjectLabelFromRows = (id: string) => {
    const row = rows.find((r) => r.subjectid === id);
    return row?.subjectname || row?.subject || getSubjectName(id);
  };

  const getSectionLabelFromRows = (id: string) => {
    const row = rows.find((r) => r.sectionid === id);
    return row?.sectionname || row?.section || getSectionName(id);
  };
  
  // Get unique subjects from rows by subjectid, use getSubjectName for display names
  const subjectOptionsFromRows = Array.from(
    new Map(
      rows
        .filter((r) => r.subjectid)
        .map((r) => [
          r.subjectid,
          {
            id: r.subjectid,
            name: r.subjectname || r.subject || getSubjectName(r.subjectid),
          },
        ])
    ).values()
  );

  // Get unique sections from rows by sectionid, use getSectionName for display names
  const sectionOptionsFromRows = Array.from(
    new Map(
      rows
        .filter((r) => r.sectionid)
        .map((r) => [
          r.sectionid,
          {
            id: r.sectionid,
            name: r.sectionname || r.section || getSectionName(r.sectionid),
          },
        ])
    ).values()
  );

  // Filter for responses tab - filter by subjectid
  const filteredRows = filterSubject 
    ? rows.filter((r) => r.subjectid === filterSubject) 
    : rows;

  // Filter for reports tab - cascade filters using IDs
  let reportFilteredRows = rows;
  if (reportFilterSection) {
    reportFilteredRows = reportFilteredRows.filter((r) => r.sectionid === reportFilterSection);
  }
  if (reportFilterSubject) {
    reportFilteredRows = reportFilteredRows.filter((r) => r.subjectid === reportFilterSubject);
  }
  if (reportFilterDate) {
    reportFilteredRows = reportFilteredRows.filter((r) => {
      const rowDate = r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "";
      return rowDate === reportFilterDate;
    });
  }

  // Get unique subjects for current section in reports (filter by sectionid)
  const reportSubjectsForSection = reportFilterSection
    ? Array.from(
        new Map(
          rows
            .filter((r) => r.sectionid === reportFilterSection && r.subjectid)
            .map((r) => [
              r.subjectid,
              {
                id: r.subjectid,
                name: r.subjectname || r.subject || getSubjectName(r.subjectid),
              },
            ])
        ).values()
      )
    : [];

  if (authenticated === null && !scoresLoading) {
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
          <h1 className="text-xl font-bold text-center mb-2 text-cyan-300">Teacher Access</h1>
          <p className="text-slate-400 text-sm text-center mb-6">
            View only: enter password. Create questions: enter email + password (created by admin).
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional, for question bank)"
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              autoFocus
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold"
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
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-slate-500 hover:text-cyan-400 text-sm">← Home</Link>
            <h1 className="text-2xl font-bold text-cyan-300">
              {teacherName ? `Teacher: ${teacherName}` : "Quiz Responses"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab("responses")}
              className={`px-4 py-2 rounded-xl font-medium ${tab === "responses" ? "bg-cyan-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
            >
              Responses
            </button>
            <button
              onClick={() => setTab("reports")}
              className={`px-4 py-2 rounded-xl font-medium ${tab === "reports" ? "bg-cyan-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
            >
              Reports
            </button>
            <button
              onClick={() => setTab("questions")}
              className={`px-4 py-2 rounded-xl font-medium ${tab === "questions" ? "bg-cyan-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
            >
              Question Bank
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium"
            >
              Logout
            </button>
          </div>
        </div>

        {tab === "responses" && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">All subjects</option>
                {subjectOptionsFromRows.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={() => downloadCsv(filteredRows)}
                disabled={filteredRows.length === 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
              >
                Export CSV
              </button>
              <button
                onClick={() => fetchScores()}
                disabled={scoresLoading}
                className="px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white font-semibold"
              >
                {scoresLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {scoresLoading && rows.length === 0 ? (
              <p className="text-slate-400 text-center py-12">Loading responses...</p>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-12 text-center text-slate-400">
                <p>No responses yet.</p>
                <p className="text-sm mt-2">Total records loaded: {rows.length}</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-12 text-center text-slate-400">
                <p>No responses matching the selected filter.</p>
                <p className="text-sm mt-2">
                  Total records: {rows.length} | Filter:{" "}
                  {filterSubject ? `Subject: ${getSubjectLabelFromRows(filterSubject)}` : "None"}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-600 bg-slate-700/50">
                        <th className="px-4 py-3 text-slate-300 font-semibold">Quiz Code</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Student Name</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Score</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Section</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Subject</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r) => (
                        <tr key={r.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="px-4 py-3 text-slate-200 font-mono">{r.quizcode}</td>
                          <td className="px-4 py-3 text-slate-200">{r.studentname ?? "—"}</td>
                          <td className="px-4 py-3 text-emerald-400 font-medium">{r.score ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-300">
                            {r.sectionname || r.section || getSectionName(r.sectionid)}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {r.subjectname || r.subject || getSubjectName(r.subjectid)}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-sm">
                            {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <p className="mt-4 text-slate-500 text-sm text-center">
              One row per quiz (from quiztbl). Score is the latest submission. Export includes all visible rows.
            </p>
          </>
        )}

        {tab === "reports" && (
          <>
            <h2 className="text-xl font-semibold text-cyan-300 mb-6">Student Score Report</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Section Filter */}
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Filter by Section</label>
                <select
                  value={reportFilterSection}
                  onChange={(e) => {
                    setReportFilterSection(e.target.value);
                    setReportFilterSubject(""); // Reset subject when section changes
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">All sections</option>
                  {sectionOptionsFromRows.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Subject Filter */}
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Filter by Subject</label>
                <select
                  value={reportFilterSubject}
                  onChange={(e) => setReportFilterSubject(e.target.value)}
                  disabled={!reportFilterSection}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                >
                  <option value="">All subjects</option>
                  {reportSubjectsForSection.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Filter by Date</label>
                <input
                  type="date"
                  value={reportFilterDate}
                  onChange={(e) => setReportFilterDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Export and Refresh Buttons */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <button
                onClick={() => downloadReportCsv(reportFilteredRows)}
                disabled={reportFilteredRows.length === 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
              >
                Export to CSV
              </button>
              <button
                onClick={() => fetchScores()}
                disabled={scoresLoading}
                className="px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white font-semibold"
              >
                {scoresLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {/* Results */}
            {scoresLoading && reportFilteredRows.length === 0 ? (
              <p className="text-slate-400 text-center py-12">Loading reports...</p>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-12 text-center text-slate-400">
                <p>No data available.</p>
                <p className="text-sm mt-2">Total records loaded: {rows.length}</p>
              </div>
            ) : reportFilteredRows.length === 0 ? (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-12 text-center text-slate-400">
                <p>No data matching selected filters.</p>
                <p className="text-sm mt-2">
                  Total records: {rows.length} | Section:{" "}
                  {reportFilterSection ? getSectionLabelFromRows(reportFilterSection) : "None"} | Subject:{" "}
                  {reportFilterSubject ? getSubjectLabelFromRows(reportFilterSubject) : "None"} | Date:{" "}
                  {reportFilterDate || "None"}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-600 bg-slate-700/50">
                        <th className="px-4 py-3 text-slate-300 font-semibold">Quiz Code</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Student Name</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Student ID</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Section</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Subject</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Score</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Max Score</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">%</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportFilteredRows.map((r) => {
                        const percentage = r.max_score ? Math.round((r.score! / r.max_score) * 100) : 0;
                        return (
                          <tr key={r.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                            <td className="px-4 py-3 text-slate-200 font-mono">{r.quizcode}</td>
                            <td className="px-4 py-3 text-slate-200">{r.studentname ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-300 font-mono">{r.student_id ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-300">{r.section ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-300">{r.subject ?? "—"}</td>
                            <td className="px-4 py-3 text-emerald-400 font-medium">{r.score ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-300">{r.max_score ?? "—"}</td>
                            <td className="px-4 py-3 text-cyan-400 font-semibold">{percentage}%</td>
                            <td className="px-4 py-3 text-slate-400 text-sm">
                              {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-4 text-slate-500 text-sm">
              <p>Total records: {reportFilteredRows.length}</p>
              {reportFilterSection && (
                <p className="mt-1">Section: {getSectionLabelFromRows(reportFilterSection)}</p>
              )}
              {reportFilterSubject && (
                <p className="mt-1">Subject: {getSubjectLabelFromRows(reportFilterSubject)}</p>
              )}
              {reportFilterDate && <p className="mt-1">Date: {reportFilterDate}</p>}
            </div>
          </>
        )}

        {tab === "questions" && (
          <>
            {!canCreateQuestions ? (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 text-center">
                <h2 className="text-lg font-semibold text-cyan-300 mb-3">Question Bank</h2>
                <p className="text-slate-400 mb-4">
                  To create quizzes and questions, log out and sign in with your <strong>teacher email and password</strong> (the account the admin created for you).
                </p>
                <p className="text-slate-500 text-sm">
                  If you only entered a password, you are in view-only mode. Use the email + password from your admin-created teacher account to access the Question Bank.
                </p>
              </div>
            ) : (
              <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-200">My Quizzes & Questions</h2>
              <button
                onClick={() => setShowCreateQuiz(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                Create Quiz
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/50 text-red-200 text-sm">
                {error}
              </div>
            )}

            {showCreateQuiz && (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6 mb-6">
                <h3 className="text-lg font-semibold text-cyan-300 mb-4">New Quiz</h3>
                <form onSubmit={handleCreateQuiz} className="space-y-4">
                  <div>
                    <label className="block text-slate-400 text-sm mb-1">Subject</label>
                    <select
                      value={newQuizSubjectId}
                      onChange={(e) => setNewQuizSubjectId(e.target.value)}
                      required
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">Select subject...</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-sm mb-1">Section</label>
                    <select
                      value={newQuizSectionId}
                      onChange={(e) => setNewQuizSectionId(e.target.value)}
                      required
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">{sections.length === 0 ? "No sections yet — add in Admin" : "Select section..."}</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {showCreateQuiz && sections.length === 0 && (
                      <button type="button" onClick={() => fetchSections()} className="mt-2 text-sm text-cyan-400 hover:underline">
                        Refresh sections
                      </button>
                    )}
                  </div>
                  <p className="text-slate-500 text-sm">A unique quiz code will be generated for students to enter.</p>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={savingQuiz}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
                    >
                      {savingQuiz ? "Creating..." : "Create Quiz"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateQuiz(false)}
                      className="px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 text-slate-200 font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {quizzesLoading ? (
              <p className="text-slate-400 text-center py-8">Loading quizzes...</p>
            ) : quizzes.length === 0 ? (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-12 text-center text-slate-400">
                No quizzes yet. Create a quiz, then add questions to it.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-4">Your quizzes</h3>
                  <ul className="space-y-2">
                    {quizzes.map((quiz) => (
                      <li
                        key={quiz.id}
                        className={`flex items-center justify-between gap-4 p-3 rounded-lg cursor-pointer transition-colors ${selectedQuizId === quiz.id ? "bg-cyan-600/30 border border-cyan-500/50" : "bg-slate-700/50 hover:bg-slate-700"}`}
                        onClick={() => setSelectedQuizId(selectedQuizId === quiz.id ? null : quiz.id)}
                      >
                        <span className="text-slate-200">
                          {getSubjectName(quiz.subjectid)} · {getSectionName(quiz.sectionid)} · <strong>{quiz.quizcode}</strong>
                        </span>
                        <span className="text-slate-500 text-sm">Select to add questions</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {selectedQuizId && (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-slate-200">Questions in this quiz</h3>
                      <button
                        onClick={() => setShowAddQuestion(true)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                      >
                        Add Question
                      </button>
                    </div>
                    {showAddQuestion && (
                      <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6 mb-6">
                        <h4 className="text-cyan-300 font-semibold mb-4">New question</h4>
                        <form onSubmit={handleAddQuestion} className="space-y-4">
                          <div>
                            <label className="block text-slate-400 text-sm mb-1">Question</label>
                            <textarea
                              value={newQuestionText}
                              onChange={(e) => setNewQuestionText(e.target.value)}
                              required
                              rows={3}
                              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                              placeholder="Enter the question..."
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 text-sm mb-1">Type</label>
                            <select
                              value={newQuizType}
                              onChange={(e) => {
                                setNewQuizType(e.target.value as typeof newQuizType);
                                if (e.target.value === "multiple_choice" && newQuestionOptions.length === 0) setNewQuestionOptions(["", ""]);
                              }}
                              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            >
                              {QUESTION_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                          </div>
                          {newQuizType === "multiple_choice" && (
                            <>
                              <div>
                                <label className="block text-slate-400 text-sm mb-1">Options (add as many as you want)</label>
                                <div className="space-y-2">
                                  {newQuestionOptions.map((opt, i) => (
                                    <div key={i} className="flex gap-2">
                                      <input
                                        type="text"
                                        value={opt}
                                        onChange={(e) => {
                                          const next = [...newQuestionOptions];
                                          next[i] = e.target.value;
                                          setNewQuestionOptions(next);
                                        }}
                                        placeholder={`Option ${i + 1}`}
                                        className="flex-1 px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (newQuestionOptions.length > 2) {
                                            const next = newQuestionOptions.filter((_, j) => j !== i);
                                            setNewQuestionOptions(next);
                                            if (newQuestionAnswerKey === opt) setNewQuestionAnswerKey("");
                                          }
                                        }}
                                        disabled={newQuestionOptions.length <= 2}
                                        className="px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => setNewQuestionOptions([...newQuestionOptions, ""])}
                                    className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm font-medium"
                                  >
                                    + Add option
                                  </button>
                                </div>
                              </div>
                              <div>
                                <label className="block text-slate-400 text-sm mb-1">Correct answer (answer key)</label>
                                <select
                                  value={newQuestionAnswerKey}
                                  onChange={(e) => setNewQuestionAnswerKey(e.target.value)}
                                  required={newQuizType === "multiple_choice"}
                                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                >
                                  <option value="">Select the correct option...</option>
                                  {newQuestionOptions.filter((o) => o.trim()).map((o) => (
                                    <option key={o} value={o.trim()}>{o.trim()}</option>
                                  ))}
                                </select>
                              </div>
                            </>
                          )}
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={savingQuestion}
                              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
                            >
                              {savingQuestion ? "Saving..." : "Save Question"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowAddQuestion(false)}
                              className="px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 text-slate-200 font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                    {questionsLoading ? (
                      <p className="text-slate-400 py-4">Loading questions...</p>
                    ) : questionsForQuiz.length === 0 ? (
                      <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 text-center text-slate-400">
                        No questions in this quiz yet. Click &quot;Add Question&quot; above.
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {questionsForQuiz.map((q) => {
                          let optionsParsed: string[] = [];
                          try {
                            if (q.options) optionsParsed = JSON.parse(q.options);
                          } catch {
                            // ignore
                          }
                          return (
                          <li key={q.id} className="flex items-start justify-between gap-4 p-3 rounded-lg bg-slate-700/50">
                            <div className="flex-1 min-w-0">
                              <span className="text-slate-500 text-xs uppercase mr-2">{q.quiztype.replace("_", " ")}</span>
                              <p className="text-slate-200">{q.question}</p>
                              {q.quiztype === "multiple_choice" && (optionsParsed.length > 0 || q.answerkey) && (
                                <p className="text-slate-500 text-sm mt-1">
                                  Options: {optionsParsed.join(", ")}
                                  {q.answerkey && (
                                    <span className="text-emerald-400 ml-2">Answer: {q.answerkey}</span>
                                  )}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => deleteQuestion(q.id)}
                              className="px-3 py-1 rounded bg-red-600/80 text-white text-sm shrink-0"
                            >
                              Delete
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
