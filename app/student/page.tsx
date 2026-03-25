"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type MeResponse = {
  ok: boolean;
  student?: { id: string; name: string; studentId?: string; username?: string };
  sections?: Array<{ id: string; name: string; joinCode: string }>;
  error?: string;
};

type QuizRow = {
  id: string;
  quizcode: string;
  quizname: string;
  period: string;
  sectionid: string;
  sectionName: string;
  subjectid?: string;
  subjectName?: string;
  assessment_type: string;
  max_attempts: number;
  submission_deadline?: string | null;
  submissions_open?: boolean;
  status: "open" | "closed" | "missing" | "completed";
  submitted: boolean;
  submittedAt?: string | null;
  score?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  attemptsUsed?: number;
  attemptsRemaining?: number;
  openAttemptId?: string | null;
  latestAttemptId?: string | null;
  latestSubmissionSource?: string | null;
  recoveryRequestStatus?: string | null;
  canRequestRecovery?: boolean;
};

function clampRemainingAttempts(value?: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.trunc(value));
}

export default function StudentDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [requestingRecoveryFor, setRequestingRecoveryFor] = useState<string | null>(null);
  const [finishingAttemptFor, setFinishingAttemptFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");

  const [pageSize, setPageSize] = useState(3);
  const [openPage, setOpenPage] = useState(1);
  const [missingPage, setMissingPage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);

  const router = useRouter();

  const loadMe = async () => {
    const res = await fetch("/api/student-me", { credentials: "include", cache: "no-store" });
    if (res.status === 401) {
      router.push("/student/login");
      return null;
    }
    const data = (await res.json().catch(() => null)) as MeResponse | null;
    if (!data?.ok) {
      setError(data?.error ?? "Failed to load profile");
      return null;
    }
    setMe(data);
    const firstSectionId = data.sections?.[0]?.id ?? "";
    setSelectedSectionId((prev) => prev || firstSectionId);
    return data;
  };

  const loadQuizzes = async (sectionId?: string) => {
    setQuizLoading(true);
    try {
      const sid = (sectionId ?? selectedSectionId).trim();
      const url = sid ? `/api/student-quizzes?sectionId=${encodeURIComponent(sid)}` : "/api/student-quizzes";
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        router.push("/student/login");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && Array.isArray(data.quizzes)) setQuizzes(data.quizzes);
      else setQuizzes([]);
      setSelectedSubjectId("");
      setOpenPage(1);
      setMissingPage(1);
      setClosedPage(1);
    } finally {
      setQuizLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const profile = await loadMe();
        if (cancelled) return;
        if (profile?.ok) await loadQuizzes(profile.sections?.[0]?.id ?? "");
      } catch {
        if (!cancelled) setError("Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const code = joinCode.trim();
    if (!code) return;
    setJoinLoading(true);
    try {
      const res = await fetch("/api/student-join-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ joinCode: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to join section");
        return;
      }
      setJoinCode("");
      const next = await loadMe();
      const first = next?.sections?.[0]?.id ?? "";
      await loadQuizzes(first);
    } finally {
      setJoinLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/student-logout", { method: "POST", credentials: "include" });
    router.push("/student/login");
  };

  const handleRecoveryRequest = async (quiz: QuizRow) => {
    const attemptId = String(quiz.latestAttemptId ?? "").trim();
    if (!attemptId) return;
    setError(null);
    setRequestingRecoveryFor(quiz.id);
    try {
      const res = await fetch("/api/student-attempt-recovery-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ attemptId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to send recovery request.");
        return;
      }
      await loadQuizzes(selectedSectionId);
    } finally {
      setRequestingRecoveryFor(null);
    }
  };

  const handleMarkDone = async (quiz: QuizRow) => {
    const attemptId = String(quiz.openAttemptId ?? "").trim();
    if (!attemptId) return;
    setError(null);
    setNotice(null);
    setFinishingAttemptFor(quiz.id);
    try {
      const res = await fetch("/api/student-attempt-force-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ attemptId, quizId: quiz.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to mark attempt as done.");
        return;
      }
      setNotice(`Done submitted for ${quiz.quizname || `Quiz ${quiz.quizcode}`}.`);
      await loadQuizzes(selectedSectionId);
    } finally {
      setFinishingAttemptFor(null);
    }
  };

  const joinedSections = me?.sections ?? [];
  const activeSection = joinedSections.find((s) => s.id === selectedSectionId) ?? null;

  const formatCloseLabel = (iso?: string | null, submissionsOpen?: boolean) => {
    if (submissionsOpen === false) return "Closed by teacher";
    if (!iso) return "No deadline";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "No deadline";
    return `Closes: ${d.toLocaleString()}`;
  };

  const statusBadge = (q: QuizRow) => {
    if (q.status === "missing") return { text: "Overdue", cls: "bg-red-600/20 text-red-200 border-red-600/40" };
    if (q.status === "open") return { text: "Open", cls: "bg-emerald-600/20 text-emerald-200 border-emerald-600/40" };
    if (q.status === "completed" || q.submitted) return { text: "Completed", cls: "bg-cyan-600/20 text-cyan-200 border-cyan-600/40" };
    return { text: "Closed", cls: "bg-slate-600/20 text-slate-200 border-slate-600/40" };
  };

  const subjectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          quizzes
            .filter((q) => String(q.subjectid ?? "").trim())
            .map((q) => [
              String(q.subjectid ?? "").trim(),
              String(q.subjectName ?? "").trim() || "Subject",
            ])
        ).entries()
      )
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [quizzes]
  );

  const filteredQuizzes = useMemo(() => {
    if (!selectedSubjectId) return quizzes;
    return quizzes.filter((q) => String(q.subjectid ?? "").trim() === selectedSubjectId);
  }, [quizzes, selectedSubjectId]);

  const openList = filteredQuizzes.filter((q) => q.status === "open");
  const missingList = filteredQuizzes.filter((q) => q.status === "missing");
  const closedList = filteredQuizzes
    .filter((q) => q.status === "closed" || q.status === "completed")
    .slice()
    .sort((a, b) => {
      const at = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const bt = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return bt - at;
    });

  useEffect(() => {
    setOpenPage(1);
    setMissingPage(1);
    setClosedPage(1);
  }, [pageSize, selectedSubjectId]);

  const clampPage = (page: number, totalPages: number) => Math.min(Math.max(1, page), Math.max(1, totalPages));

  const openTotalPages = Math.ceil(openList.length / pageSize);
  const missingTotalPages = Math.ceil(missingList.length / pageSize);
  const closedTotalPages = Math.ceil(closedList.length / pageSize);

  const openPageSafe = clampPage(openPage, openTotalPages);
  const missingPageSafe = clampPage(missingPage, missingTotalPages);
  const closedPageSafe = clampPage(closedPage, closedTotalPages);

  const openPageItems = openList.slice((openPageSafe - 1) * pageSize, openPageSafe * pageSize);
  const missingPageItems = missingList.slice((missingPageSafe - 1) * pageSize, missingPageSafe * pageSize);
  const closedPageItems = closedList.slice((closedPageSafe - 1) * pageSize, closedPageSafe * pageSize);

	  const Pagination = ({
	    page,
	    totalPages,
	    onChange,
	  }: {
	    page: number;
	    totalPages: number;
	    onChange: (next: number) => void;
	  }) => {
	    if (totalPages <= 0) return null;
	    const safeTotal = Math.max(1, totalPages);
	    const safePage = clampPage(page, safeTotal);
	    return (
		      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		        <button
		          type="button"
		          onClick={() => onChange(safePage - 1)}
	          disabled={safePage <= 1}
	          className="w-full sm:w-auto px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-200 text-xs font-semibold disabled:opacity-50"
	        >
	          Prev
	        </button>
	        <div className="text-center text-slate-500 text-xs">
	          Page <span className="text-slate-200">{safePage}</span> / <span className="text-slate-200">{safeTotal}</span>
	        </div>
	        <button
	          type="button"
	          onClick={() => onChange(safePage + 1)}
	          disabled={safePage >= safeTotal}
	          className="w-full sm:w-auto px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-200 text-xs font-semibold disabled:opacity-50"
	        >
	          Next
	        </button>
	      </div>
    );
  };

  const formatSubmittedLabel = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `Submitted: ${d.toLocaleString()}`;
  };

  const isAutoSubmittedQuiz = (q: QuizRow) => {
    const source = String(q.latestSubmissionSource ?? "").trim().toLowerCase();
    return source === "auto_tab_switch" || source === "auto_close_tab" || source === "auto_time_expired";
  };

  const subjectPerformance = useMemo(() => {
    const bySubject = new Map<
      string,
      { subjectId: string; subjectName: string; earned: number; total: number; quizCount: number }
    >();

    for (const q of quizzes) {
      const subjectId = String(q.subjectid ?? "").trim();
      if (!subjectId) continue;
      if (!q.submitted) continue;

      const earnedNum = Number(q.score);
      const totalNum = Number(q.maxScore);
      if (!Number.isFinite(earnedNum) || !Number.isFinite(totalNum) || totalNum <= 0) continue;

      const prev = bySubject.get(subjectId) ?? {
        subjectId,
        subjectName: String(q.subjectName ?? "").trim(),
        earned: 0,
        total: 0,
        quizCount: 0,
      };
      prev.earned += earnedNum;
      prev.total += totalNum;
      prev.quizCount += 1;
      if (!prev.subjectName) prev.subjectName = String(q.subjectName ?? "").trim();
      bySubject.set(subjectId, prev);
    }

    return Array.from(bySubject.values())
      .map((s) => ({
        ...s,
        percentage: s.total > 0 ? Math.round((s.earned / s.total) * 100) : 0,
      }))
      .sort((a, b) => {
        const an = a.subjectName || a.subjectId;
        const bn = b.subjectName || b.subjectId;
        return an.localeCompare(bn);
      });
  }, [quizzes]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 md:p-10">
	      <div className="max-w-5xl mx-auto space-y-6">
	        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link href="/" className="text-slate-500 hover:text-cyan-400 text-sm">← Home</Link>
            <h1 className="text-3xl font-bold mt-2 text-emerald-300">Student Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">
              Signed in as <span className="text-slate-200 font-semibold">{me?.student?.name ?? "Student"}</span>
              {me?.student?.studentId ? <span className="text-slate-500"> · {me.student.studentId}</span> : null}
            </p>
          </div>
		          <div className="flex w-full sm:w-auto gap-2">
		            <Link
		              href="/student/account"
		              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white font-semibold text-center"
		            >
		              Account Settings
		            </Link>
		            <button
		              type="button"
		              onClick={handleLogout}
		              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold"
		            >
		              Log out
		            </button>
		          </div>
		        </div>

        {error && (
          <div className="rounded-xl bg-red-900/20 border border-red-700/30 p-4 text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl bg-emerald-900/20 border border-emerald-700/30 p-4 text-emerald-200">
            {notice}
          </div>
        )}

        <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-lg font-semibold text-slate-200">Performance by Subject</h2>
            <span className="text-xs text-slate-500">
              {activeSection?.name ? `Section: ${activeSection.name}` : "Select a section to see your progress"}
            </span>
          </div>
          <p className="text-slate-500 text-sm mb-4">
            Your progress is based on submitted quizzes/exams in the selected section (total earned points ÷ total possible points per subject).
          </p>
          {!selectedSectionId ? (
            <p className="text-slate-500 text-sm">Select a section to view your subject progress.</p>
          ) : subjectPerformance.length === 0 ? (
            <p className="text-slate-500 text-sm">No submitted scores yet for this section.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subjectPerformance.map((s) => (
                <div
                  key={s.subjectId}
                  className="rounded-2xl bg-slate-900/30 border border-slate-700/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-slate-200 font-semibold truncate">
                        {s.subjectName || "Subject"}
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5">
                        {Math.round(s.earned)}/{Math.round(s.total)} points &middot; {s.quizCount} submitted
                      </div>
                    </div>
                    <div className="shrink-0 text-cyan-300 font-bold text-lg">
                      {s.percentage}%
                    </div>
                  </div>
                  <div className="mt-3 h-3 w-full rounded-full overflow-hidden bg-slate-950/40 border border-slate-700/40">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                      style={{ width: `${Math.min(100, Math.max(0, s.percentage))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-200 mb-2">Join Your Section</h2>
            <p className="text-slate-500 text-sm mb-4">
              Enter the section code your teacher gave you.
            </p>
	            <form onSubmit={handleJoin} className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-[minmax(0,1fr)_auto]">
	              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Section code"
		                className="w-full min-w-0 px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
	              />
	              <button
	                type="submit"
	                disabled={joinLoading}
		                className="w-full min-[430px]:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
	              >
	                {joinLoading ? "Joining..." : "Join"}
	              </button>
	            </form>

	            <div className="mt-6">
	              <h3 className="text-slate-300 font-semibold mb-2">Joined Sections</h3>
	              {joinedSections.length === 0 ? (
	                <p className="text-slate-500 text-sm">No sections joined yet.</p>
	              ) : (
	                <ul className="space-y-2">
	                  {joinedSections.map((s) => (
	                    <li key={s.id}>
	                      <button
	                        type="button"
	                        onClick={() => {
	                          setSelectedSectionId(s.id);
	                          void loadQuizzes(s.id);
	                        }}
	                        className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
	                          s.id === selectedSectionId
	                            ? "bg-cyan-600/15 border-cyan-500/40"
	                            : "bg-slate-900/30 border-slate-700/40 hover:bg-slate-900/40"
	                        }`}
	                      >
	                        <div className="min-w-0">
	                          <div className="text-slate-200 font-medium truncate">{s.name}</div>
	                          <div className="text-slate-500 text-xs">
	                            Section code: <span className="font-mono">{s.joinCode}</span>
	                          </div>
	                        </div>
	                        <span className="text-slate-500 text-xs shrink-0">View</span>
	                      </button>
	                    </li>
	                  ))}
	                </ul>
	              )}
	            </div>
          </div>

	          <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6 shadow-2xl">
	            <h2 className="text-lg font-semibold text-slate-200 mb-2">Assigned Work</h2>
	            <p className="text-slate-500 text-sm mb-4">
	              Click a section above to see all quizzes/exams assigned to that section.
	            </p>

	            {quizLoading ? (
	              <p className="text-slate-500 text-sm">Loading quizzes...</p>
	            ) : joinedSections.length === 0 ? (
	              <p className="text-slate-500 text-sm">
	                Join your section first to see quizzes and exams.
	              </p>
	            ) : !selectedSectionId ? (
	              <p className="text-slate-500 text-sm">
	                Select a section from the list to view assigned work.
	              </p>
	            ) : quizzes.length === 0 ? (
	              <p className="text-slate-500 text-sm">
	                No quizzes assigned yet for this section.
	              </p>
	            ) : (
		              <div className="space-y-3">
			                <div className="flex flex-col gap-3">
			                  <div className="grid grid-cols-1 gap-2 text-xs sm:flex sm:flex-wrap sm:items-center">
			                    <span className="px-2 py-1 rounded border border-slate-600/40 bg-slate-600/10 text-slate-200">
			                      Section: {activeSection?.name ?? "Selected"}
			                    </span>
	                        <label className="flex w-full flex-col gap-2 rounded border border-slate-600/40 bg-slate-600/10 px-2 py-2 text-slate-200 sm:w-auto sm:flex-row sm:items-center sm:py-1">
	                          <span className="text-slate-400">Subject</span>
	                          <div className="relative w-full sm:w-auto">
	                            <select
	                              value={selectedSubjectId}
	                              onChange={(e) => setSelectedSubjectId(e.target.value)}
	                              className="w-full appearance-none rounded-lg border border-slate-600/60 bg-slate-900/60 py-2 pl-2 pr-7 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 sm:w-auto sm:py-1"
	                            >
                              <option className="bg-slate-900 text-slate-100" value="">
                                All subjects
                              </option>
                              {subjectOptions.map((subject) => (
                                <option
                                  key={subject.id}
                                  className="bg-slate-900 text-slate-100"
                                  value={subject.id}
                                >
                                  {subject.name}
                                </option>
                              ))}
                            </select>
                            <svg
                              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </label>
			                    <span className="px-2 py-1 rounded border border-emerald-600/40 bg-emerald-600/10 text-emerald-200">
			                      Open: {openList.length}
			                    </span>
		                    <span className="px-2 py-1 rounded border border-red-600/40 bg-red-600/10 text-red-200">
		                      Overdue: {missingList.length}
		                    </span>
		                    <span className="px-2 py-1 rounded border border-slate-600/40 bg-slate-600/10 text-slate-200">
		                      Completed: {closedList.length}
		                    </span>
	                        <label className="flex w-full flex-col gap-2 rounded border border-slate-600/40 bg-slate-600/10 px-2 py-2 text-slate-200 sm:w-auto sm:flex-row sm:items-center sm:py-1">
	                          <span className="text-slate-400">Per list</span>
	                          <div className="relative w-full sm:w-auto">
	                            <select
	                              value={pageSize}
	                              onChange={(e) => setPageSize(Number(e.target.value) || 5)}
	                              className="w-full appearance-none rounded-lg border border-slate-600/60 bg-slate-900/60 py-2 pl-2 pr-7 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 sm:w-auto sm:py-1"
	                            >
			                          <option className="bg-slate-900 text-slate-100" value={5}>5</option>
			                          <option className="bg-slate-900 text-slate-100" value={10}>10</option>
			                          <option className="bg-slate-900 text-slate-100" value={20}>20</option>
			                        </select>
			                        <svg
			                          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300"
			                          xmlns="http://www.w3.org/2000/svg"
			                          fill="none"
			                          viewBox="0 0 24 24"
			                          stroke="currentColor"
			                        >
			                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
			                        </svg>
			                      </div>
			                    </label>
			                  </div>
			                  <button
			                    type="button"
		                    onClick={() => void loadQuizzes(selectedSectionId)}
		                    disabled={quizLoading || !selectedSectionId}
		                    className="w-full rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300 hover:bg-cyan-500/15 disabled:opacity-50 sm:w-auto"
		                  >
		                    Refresh
		                  </button>
		                </div>

		                <div className="rounded-xl bg-slate-900/20 border border-slate-700/30 p-3">
		                  <h3 className="text-slate-200 font-semibold text-sm mb-2">Open</h3>
		                  {openList.length === 0 ? (
		                    <p className="text-slate-500 text-sm">
                          {selectedSubjectId ? "No open quizzes/exams for this subject." : "No open quizzes/exams right now."}
                        </p>
			                  ) : (
		                    <ul className="space-y-2">
				                      {openPageItems.map((q) => {
				                    const badge = statusBadge(q);
				                    const closeLabel = formatCloseLabel(q.submission_deadline, q.submissions_open);
					                        const canOpen = q.status === "open";
                            const canMarkDone = Boolean(String(q.openAttemptId ?? "").trim());
				                    return (
		                      <li
		                        key={q.id}
		                        className={`flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-start sm:justify-between ${
		                          q.status === "missing"
		                            ? "bg-red-950/20 border-red-800/30"
	                            : q.status === "open"
	                              ? "bg-slate-900/30 border-slate-700/40"
	                              : "bg-slate-900/20 border-slate-700/30"
	                        }`}
	                      >
	                        <div className="min-w-0">
	                          <div className="flex items-center gap-2 flex-wrap">
	                            <div className="text-slate-200 text-sm font-medium truncate">
	                              {q.quizname || `Quiz ${q.quizcode}`}
	                            </div>
	                            <span className={`px-2 py-0.5 rounded border text-xs ${badge.cls}`}>
	                              {badge.text}
	                            </span>
	                            <span className="text-slate-500 text-xs">· {String(q.assessment_type || "quiz")}</span>
	                          </div>
	                          {q.subjectName ? (
                            <div className="text-cyan-300 text-xs mt-1 font-medium">Subject: {q.subjectName}</div>
                          ) : null}
                          <div className="text-slate-500 text-xs mt-1">
	                            Code: <span className="font-mono">{q.quizcode}</span>
	                            {q.period ? <span> · Period {q.period}</span> : null}
	                          </div>
		                          {typeof clampRemainingAttempts(q.attemptsRemaining) === "number" && typeof q.attemptsUsed === "number" ? (
		                            <div className="text-slate-400 text-xs mt-1">
		                              Attempts: {q.attemptsUsed}/{q.max_attempts} (left {clampRemainingAttempts(q.attemptsRemaining)})
		                            </div>
		                          ) : null}
	                          <div className="text-slate-400 text-xs mt-1">{closeLabel}</div>
	                        </div>
                            <div className="flex w-full flex-col gap-2 sm:w-auto">
				                          <button
				                            type="button"
				                            onClick={() => router.push(`/quiz?code=${encodeURIComponent(q.quizcode)}`)}
				                            disabled={!canOpen}
				                            className={`w-full sm:w-auto px-3 py-2 rounded-lg text-white text-sm font-semibold ${
				                              canOpen
				                                ? "bg-emerald-600 hover:bg-emerald-500"
			                                : "bg-slate-700/70 opacity-60 cursor-not-allowed"
			                            }`}
			                          >
			                            {canOpen ? "Open" : "Closed"}
			                          </button>
                              {canMarkDone ? (
                                <button
                                  type="button"
                                  onClick={() => void handleMarkDone(q)}
                                  disabled={finishingAttemptFor === q.id}
                                  className="w-full sm:w-auto px-3 py-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 text-sm font-semibold hover:bg-cyan-500/15 disabled:opacity-50"
                                >
                                  {finishingAttemptFor === q.id ? "Submitting..." : "Done"}
                                </button>
                              ) : null}
                            </div>
		                      </li>
		                      );
		                    })}
		                    </ul>
		                  )}
		                  <Pagination page={openPageSafe} totalPages={openTotalPages} onChange={setOpenPage} />
		                </div>

		                <div className="rounded-xl bg-slate-900/20 border border-slate-700/30 p-3">
			                  <h3 className="text-slate-200 font-semibold text-sm mb-2">Overdue</h3>
			                  {missingList.length === 0 ? (
			                    <p className="text-slate-500 text-sm">
                            {selectedSubjectId ? "No overdue work for this subject." : "No overdue work."}
                          </p>
				                  ) : (
		                    <ul className="space-y-2">
			                      {missingPageItems.map((q) => {
		                        const badge = statusBadge(q);
		                        const closeLabel = formatCloseLabel(q.submission_deadline, q.submissions_open);
			                        const canOpen = q.status === "open";
                              const canMarkDone = Boolean(String(q.openAttemptId ?? "").trim());
			                        const scorePill =
	                          typeof q.percentage === "number" ? (
	                            <span className="px-2 py-0.5 rounded border text-xs bg-cyan-600/15 text-cyan-200 border-cyan-500/40">
	                              Score {q.percentage}%
	                            </span>
	                          ) : null;
	                        return (
		                          <li
		                            key={q.id}
		                            className={`flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-start sm:justify-between ${
		                              q.status === "missing"
		                                ? "bg-red-950/20 border-red-800/30"
	                                : q.status === "open"
	                                  ? "bg-slate-900/30 border-slate-700/40"
	                                  : "bg-slate-900/20 border-slate-700/30"
	                            }`}
	                          >
	                            <div className="min-w-0">
	                              <div className="flex items-center gap-2 flex-wrap">
	                                <div className="text-slate-200 text-sm font-medium truncate">
	                                  {q.quizname || `Quiz ${q.quizcode}`}
	                                </div>
	                                <span className={`px-2 py-0.5 rounded border text-xs ${badge.cls}`}>
	                                  {badge.text}
	                                </span>
	                                {scorePill}
	                                <span className="text-slate-500 text-xs">· {String(q.assessment_type || "quiz")}</span>
	                              </div>
	                              {q.subjectName ? (
                            <div className="text-cyan-300 text-xs mt-1 font-medium">Subject: {q.subjectName}</div>
                          ) : null}
                          <div className="text-slate-500 text-xs mt-1">
	                                Code: <span className="font-mono">{q.quizcode}</span>
	                                {q.period ? <span> · Period {q.period}</span> : null}
	                              </div>
	                              <div className="text-slate-400 text-xs mt-1">{closeLabel}</div>
	                            </div>
                              <div className="flex w-full flex-col gap-2 sm:w-auto">
			                              <button
			                                type="button"
			                                onClick={() => router.push(`/quiz?code=${encodeURIComponent(q.quizcode)}`)}
			                                disabled={!canOpen}
			                                className={`w-full sm:w-auto px-3 py-2 rounded-lg text-white text-sm font-semibold ${
			                                  canOpen
			                                    ? "bg-emerald-600 hover:bg-emerald-500"
		                                    : "bg-slate-700/70 opacity-60 cursor-not-allowed"
		                                }`}
		                              >
		                                {canOpen ? "Open" : "Closed"}
		                              </button>
                                {canMarkDone ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleMarkDone(q)}
                                    disabled={finishingAttemptFor === q.id}
                                    className="w-full sm:w-auto px-3 py-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 text-sm font-semibold hover:bg-cyan-500/15 disabled:opacity-50"
                                  >
                                    {finishingAttemptFor === q.id ? "Submitting..." : "Done"}
                                  </button>
                                ) : null}
                              </div>
		                          </li>
		                        );
		                      })}
		                    </ul>
		                  )}
		                  <Pagination page={missingPageSafe} totalPages={missingTotalPages} onChange={setMissingPage} />
		                </div>

		                <div className="rounded-xl bg-slate-900/20 border border-slate-700/30 p-3">
		                  <h3 className="text-slate-200 font-semibold text-sm mb-2">Completed</h3>
		                  {closedList.length === 0 ? (
		                    <p className="text-slate-500 text-sm">
                          {selectedSubjectId ? "No completed quizzes/exams for this subject yet." : "No completed quizzes/exams yet."}
                        </p>
			                  ) : (
		                    <ul className="space-y-2">
		                      {closedPageItems.map((q) => {
		                        const badge = statusBadge(q);
		                        const closeLabel = formatCloseLabel(q.submission_deadline, q.submissions_open);
		                        const submittedLabel = formatSubmittedLabel(q.submittedAt);
		                        const canOpen = q.status === "open";
	                        const scorePill =
	                          typeof q.percentage === "number" ? (
	                            <span className="px-2 py-0.5 rounded border text-xs bg-cyan-600/15 text-cyan-200 border-cyan-500/40">
	                              Score {q.percentage}%
	                            </span>
	                          ) : null;
	                        return (
		                          <li
		                            key={q.id}
		                            className={`flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-start sm:justify-between ${
		                              q.status === "missing"
		                                ? "bg-red-950/20 border-red-800/30"
	                                : q.status === "open"
	                                  ? "bg-slate-900/30 border-slate-700/40"
	                                  : "bg-slate-900/20 border-slate-700/30"
	                            }`}
	                          >
	                            <div className="min-w-0">
	                              <div className="flex items-center gap-2 flex-wrap">
	                                <div className="text-slate-200 text-sm font-medium truncate">
	                                  {q.quizname || `Quiz ${q.quizcode}`}
	                                </div>
	                                <span className={`px-2 py-0.5 rounded border text-xs ${badge.cls}`}>
	                                  {badge.text}
	                                </span>
	                                {scorePill}
	                                <span className="text-slate-500 text-xs">· {String(q.assessment_type || "quiz")}</span>
	                              </div>
	                              {q.subjectName ? (
                            <div className="text-cyan-300 text-xs mt-1 font-medium">Subject: {q.subjectName}</div>
                          ) : null}
                          <div className="text-slate-500 text-xs mt-1">
	                                Code: <span className="font-mono">{q.quizcode}</span>
	                                {q.period ? <span> · Period {q.period}</span> : null}
	                              </div>
		                              {typeof clampRemainingAttempts(q.attemptsRemaining) === "number" && typeof q.attemptsUsed === "number" ? (
		                                <div className="text-slate-400 text-xs mt-1">
		                                  Attempts: {q.attemptsUsed}/{q.max_attempts} (left {clampRemainingAttempts(q.attemptsRemaining)})
		                                </div>
		                              ) : null}
	                              {typeof q.percentage === "number" ? (
	                                <div className="text-slate-300 text-xs mt-1">
	                                  Best:{" "}
	                                  <span className="font-mono">
	                                    {q.score ?? 0}/{q.maxScore ?? 0}
	                                  </span>{" "}
	                                  <span className="text-cyan-300 font-semibold">({q.percentage}%)</span>
	                                </div>
	                              ) : null}
		                              {submittedLabel ? (
		                                <div className="text-slate-400 text-xs mt-1">{submittedLabel}</div>
		                              ) : null}
		                              {q.canRequestRecovery && isAutoSubmittedQuiz(q) ? (
		                                <div className="mt-1 text-[11px] font-medium text-amber-200">
		                                  This attempt was auto-submitted. You can request recovery here so your teacher can reopen it with your saved answers.
		                                </div>
		                              ) : null}
		                              {q.recoveryRequestStatus === "pending" ? (
			                                <div className="mt-1 text-[11px] font-medium text-amber-300">
			                                  Recovery request sent. Wait for your teacher to approve it, then reopen the quiz.
			                                </div>
			                              ) : null}
			                              {q.recoveryRequestStatus === "approved" ? (
			                                <div className="mt-1 text-[11px] font-medium text-emerald-300">
			                                  Recovery approved. You can now retake the quiz from your saved attempt.
			                                </div>
			                              ) : null}
		                              <div className="text-slate-400 text-xs mt-1">{closeLabel}</div>
		                            </div>
			                            <div className="flex w-full flex-col gap-2 sm:w-auto">
			                              <button
			                                type="button"
			                                onClick={() => router.push(`/quiz?code=${encodeURIComponent(q.quizcode)}`)}
			                                disabled={!canOpen}
			                                className={`w-full sm:w-auto px-3 py-2 rounded-lg text-white text-sm font-semibold ${
			                                  canOpen
			                                    ? "bg-emerald-600 hover:bg-emerald-500"
		                                    : "bg-slate-700/70 opacity-60 cursor-not-allowed"
		                                }`}
		                              >
			                                {canOpen && q.recoveryRequestStatus === "approved" ? "Retake Quiz" : canOpen ? "Open" : "Closed"}
			                              </button>
			                              {q.canRequestRecovery ? (
			                                <button
		                                  type="button"
		                                  onClick={() => void handleRecoveryRequest(q)}
		                                  disabled={requestingRecoveryFor === q.id}
		                                  className="w-full sm:w-auto rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/15 disabled:opacity-50"
		                                >
			                                  {requestingRecoveryFor === q.id ? "Requesting..." : "Request Recovery"}
			                                </button>
			                              ) : null}
			                            </div>
		                          </li>
		                        );
		                      })}
		                    </ul>
		                  )}
		                  <Pagination page={closedPageSafe} totalPages={closedTotalPages} onChange={setClosedPage} />
		                </div>
	              </div>
	            )}
	          </div>
        </div>
      </div>
    </div>
  );
}


