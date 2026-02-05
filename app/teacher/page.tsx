"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type QuizResponseRow = {
  id: string;
  quizid?: string;
  quizcode: string;
  period?: string;
  quizname?: string;
  subjectid: string;
  sectionid: string;
  score: number | null;
  max_score?: number;
  student_id?: string;
  attempt_number?: number;
  studentname: string | null;
  created_at?: string;
  answers?: Record<string, unknown> | null;
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
  period?: string;
  quizname?: string;
  time_limit_minutes?: number | null;
  allow_retake?: boolean;
  max_attempts?: number | null;
};

type QuestionRow = {
  id: string;
  quizid: string;
  question: string;
  quiztype: string;
  answerkey?: string | null;
  options?: string | null;
  score?: number | null;
};

type QuestionInfo = {
  text: string;
  answerkey: string;
  quiztype: string;
};

type ConsolidatedRow = {
  student_id: string;
  studentname: string;
  section: string;
  subject: string;
  sectionid: string;
  subjectid: string;
  quizzes: Map<string, { score: number; max_score: number }>;
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

function downloadConsolidatedReportCsv(
  rows: ConsolidatedRow[],
  quizColumns: { quizid: string; quizcode: string; quizname: string }[]
) {
  const headers = ["Student ID", "Student Name", "Section", "Subject", ...quizColumns.map((q) => escapeCsvCell(q.quizname || q.quizcode))];
  const lines = [
    headers.join(","),
    ...rows.map((row) => {
      const quizCells = quizColumns.map((q) => {
        const qq = row.quizzes.get(q.quizid);
        if (!qq) return escapeCsvCell("0");
        // Export only the score (number of correct answers)
        return escapeCsvCell(String(qq.score));
      });
      return [
        escapeCsvCell(row.student_id),
        escapeCsvCell(row.studentname),
        escapeCsvCell(row.section),
        escapeCsvCell(row.subject),
        ...quizCells,
      ].join(",");
    }),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `student-report-consolidated-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s/-]/g, "")
    .replace(/-/g, " ");
}

function normalizeForEnum(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s/-]/g, "")
    .replace(/\band\b/gi, " ");
}

function parseEnumerationInput(input: string): string[] {
  return input
    .split(/[,;\n]|\d+\.\s*|-\s*/)
    .map((s) => normalizeForEnum(s))
    .filter((s) => s.length > 0);
}

function parseEnumerationAnswerKey(input: string): string[] {
  return input
    .split(/[,;\n]/)
    .map((s) => normalizeForEnum(s))
    .filter((s) => s.length > 0);
}

function getCorrectVariations(correct: string): string[] {
  const norm = normalizeForEnum(correct);
  const variants = [norm];
  if (norm.includes("/")) {
    const parts = norm.split("/").map((p) => p.trim()).filter(Boolean);
    variants.push(...parts);
    variants.push(parts.join(" "));
  }
  if (norm.includes(" ")) {
    variants.push(norm.replace(/\s+/g, ""));
  }
  return [...new Set(variants)];
}

function checkEnumerationMatch(userItems: string[], correctItems: string[]): number {
  let matched = 0;
  const usedUser = new Set<number>();

  for (const correct of correctItems) {
    const variations = getCorrectVariations(correct);

    for (let i = 0; i < userItems.length; i++) {
      if (usedUser.has(i)) continue;
      const userNorm = userItems[i];

      const matches = variations.some(
        (v) =>
          userNorm === v ||
          (userNorm.length >= 3 && v.includes(userNorm)) ||
          (v.length >= 3 && userNorm.includes(v)) ||
          (userNorm.length >= 4 && v.startsWith(userNorm)) ||
          (v.length >= 4 && userNorm.startsWith(v))
      );

      if (matches) {
        matched++;
        usedUser.add(i);
        break;
      }
    }
  }
  return matched;
}

function isCorrectAnswer(studentAnswer: string, answerKey: string, quizType: string): { ok: boolean; detail?: string } {
  if (!answerKey.trim()) return { ok: false };
  if (quizType === "enumeration") {
    const studentItems = parseEnumerationInput(studentAnswer);
    const correctItems = parseEnumerationAnswerKey(answerKey);
    const matched = checkEnumerationMatch(studentItems, correctItems);
    const expected = correctItems.length || 0;
    const ok = expected > 0 && matched / expected >= 0.8;
    return { ok, detail: expected > 0 ? `Matched ${matched}/${expected}` : undefined };
  }
  const ok = normalizeAnswer(studentAnswer) === normalizeAnswer(answerKey);
  return { ok };
}

function renderAnswerBlock(
  title: string,
  items: Array<{ questionId: string; answer: string }>,
  questionMap: Record<string, QuestionInfo>
) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-slate-200 mb-2">{title}</h4>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={`${title}-${item.questionId}-${idx}`} className="rounded-lg bg-slate-800 border border-slate-700 p-3">
            <div className="text-xs text-slate-500 mb-1">Question ID: {item.questionId}</div>
            {questionMap[item.questionId] ? (
              <div className="text-sm text-slate-200 mb-2 whitespace-pre-wrap">
                {questionMap[item.questionId]?.text}
              </div>
            ) : (
              <div className="text-xs text-slate-500 mb-2">Question text not found.</div>
            )}
            {(() => {
              const info = questionMap[item.questionId];
              const answerKey = info?.answerkey ?? "";
              const quizType = info?.quiztype ?? "";
              const hasKey = Boolean(answerKey.trim());
              const result = hasKey ? isCorrectAnswer(item.answer || "", answerKey, quizType) : { ok: false };
              const answerClass = hasKey ? (result.ok ? "text-emerald-400" : "text-red-400") : "text-slate-100";
              return (
                <>
                  <div className="text-xs text-slate-500 mb-1">Student Answer</div>
                  <div className={`text-sm whitespace-pre-wrap ${answerClass}`}>{item.answer || "--"}</div>
                  {result.detail && (
                    <div className="text-xs text-slate-500 mt-1">{result.detail}</div>
                  )}
                  <div className="text-xs text-slate-500 mt-2">Answer Key</div>
                  <div className="text-sm text-emerald-400 whitespace-pre-wrap">{answerKey || "--"}</div>
                </>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
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
  const [reportFilterPeriod, setReportFilterPeriod] = useState<string>("");
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
  const [newQuizPeriod, setNewQuizPeriod] = useState("");
  const [newQuizQuizName, setNewQuizQuizName] = useState("");
  const [newQuizTimeLimit, setNewQuizTimeLimit] = useState("");
  const [newQuizAllowRetake, setNewQuizAllowRetake] = useState(false);
  const [newQuizMaxAttempts, setNewQuizMaxAttempts] = useState("2");
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [editQuizSubjectId, setEditQuizSubjectId] = useState("");
  const [editQuizSectionId, setEditQuizSectionId] = useState("");
  const [editQuizPeriod, setEditQuizPeriod] = useState("");
  const [editQuizName, setEditQuizName] = useState("");
  const [editQuizCode, setEditQuizCode] = useState("");
  const [editQuizTimeLimit, setEditQuizTimeLimit] = useState("");
  const [editQuizAllowRetake, setEditQuizAllowRetake] = useState(false);
  const [editQuizMaxAttempts, setEditQuizMaxAttempts] = useState("2");
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuizType, setNewQuizType] = useState<typeof QUESTION_TYPES[number]["value"]>("multiple_choice");
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>(["", ""]);
  const [newQuestionAnswerKey, setNewQuestionAnswerKey] = useState("");
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [newQuestionScore, setNewQuestionScore] = useState<string>("1");
  const [batchQuestions, setBatchQuestions] = useState<Array<{
    question: string;
    quizType: typeof QUESTION_TYPES[number]["value"];
    options?: string[];
    answerkey?: string;
    score: number;
  }>>([]);
  const [responsesPage, setResponsesPage] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [quizzesPage, setQuizzesPage] = useState(1);
  const [navOpen, setNavOpen] = useState(false);
  const [answerModal, setAnswerModal] = useState<QuizResponseRow | null>(null);
  const [answerQuestions, setAnswerQuestions] = useState<Record<string, QuestionInfo>>({});
  const [answersLoading, setAnswersLoading] = useState(false);
  const [questionTypeFilter, setQuestionTypeFilter] = useState<
    "all" | "multiple_choice" | "identification" | "enumeration" | "long_answer"
  >("all");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionText, setEditQuestionText] = useState("");
  const [editAnswerKey, setEditAnswerKey] = useState("");
  const [editScore, setEditScore] = useState<string>("1");
  const [editQuestionOptions, setEditQuestionOptions] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const PAGE_SIZE = 10;
  const QUIZ_PAGE_SIZE = 6;
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

  useEffect(() => {
    if (!answerModal?.quizid) {
      setAnswerQuestions({});
      return;
    }
    let cancelled = false;
    setAnswersLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/teacher/quizzes/${answerModal.quizid}/questions`, { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as Array<{ id: string; question: string; answerkey?: string | null; quiztype?: string | null }>;
        if (cancelled) return;
        const map: Record<string, QuestionInfo> = {};
        for (const q of data) {
          map[String(q.id)] = {
            text: String(q.question ?? ""),
            answerkey: String(q.answerkey ?? ""),
            quiztype: String(q.quiztype ?? ""),
          };
        }
        setAnswerQuestions(map);
      } finally {
        if (!cancelled) setAnswersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [answerModal?.quizid]);

  // Reset pagination when filters change
  useEffect(() => {
    setResponsesPage(1);
  }, [filterSubject]);

  useEffect(() => {
    setReportsPage(1);
  }, [reportFilterSection, reportFilterSubject, reportFilterDate]);

  useEffect(() => {
    setQuizzesPage(1);
  }, [quizzes.length]);

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
      const timeLimitMinutes = newQuizTimeLimit.trim()
        ? Number(newQuizTimeLimit.trim())
        : null;
      const maxAttempts = newQuizAllowRetake
        ? Math.max(2, Number(newQuizMaxAttempts) || 2)
        : 1;
      const res = await fetch("/api/teacher/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subjectId: newQuizSubjectId,
          sectionId: newQuizSectionId,
          period: newQuizPeriod.trim(),
          quizname: newQuizQuizName.trim(),
          timeLimitMinutes: Number.isFinite(timeLimitMinutes) ? timeLimitMinutes : null,
          allowRetake: newQuizAllowRetake,
          maxAttempts,
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
      setNewQuizPeriod("");
      setNewQuizQuizName("");
      setNewQuizTimeLimit("");
      setNewQuizAllowRetake(false);
      setNewQuizMaxAttempts("2");
      fetchQuizzes();
    } finally {
      setSavingQuiz(false);
    }
  };

  const startEditQuiz = (quiz: QuizRow) => {
    setEditingQuizId(quiz.id);
    setEditQuizSubjectId(quiz.subjectid);
    setEditQuizSectionId(quiz.sectionid);
    setEditQuizPeriod(quiz.period ?? "");
    setEditQuizName(quiz.quizname ?? "");
    setEditQuizCode(quiz.quizcode ?? "");
    setEditQuizTimeLimit(
      quiz.time_limit_minutes != null ? String(quiz.time_limit_minutes) : ""
    );
    setEditQuizAllowRetake(Boolean(quiz.allow_retake));
    setEditQuizMaxAttempts(String(quiz.max_attempts ?? 2));
    if (subjects.length === 0) fetchSubjects();
    if (sections.length === 0) fetchSections();
  };

  const handleUpdateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuizId) return;
    setError("");
    try {
      const timeLimitMinutes = editQuizTimeLimit.trim()
        ? Number(editQuizTimeLimit.trim())
        : null;
      const maxAttempts = editQuizAllowRetake
        ? Math.max(2, Number(editQuizMaxAttempts) || 2)
        : 1;
      const res = await fetch(`/api/teacher/quizzes/${editingQuizId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subjectId: editQuizSubjectId,
          sectionId: editQuizSectionId,
          period: editQuizPeriod,
          quizname: editQuizName,
          quizcode: editQuizCode,
          timeLimitMinutes: Number.isFinite(timeLimitMinutes) ? timeLimitMinutes : null,
          allowRetake: editQuizAllowRetake,
          maxAttempts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update quiz");
        return;
      }
      setEditingQuizId(null);
      fetchQuizzes();
    } catch {
      setError("Failed to update quiz");
    }
  };

  const handleAddQuestionToBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) {
      setError("Question text is required.");
      return;
    }
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
    } else {
      // For identification, enumeration, and long answer, an answer key is required
      if (!newQuestionAnswerKey.trim()) {
        setError("Answer key is required for this question type.");
        return;
      }
    }
    const scoreNumber = Number(newQuestionScore) || 1;
    if (!Number.isFinite(scoreNumber) || scoreNumber <= 0) {
      setError("Score must be a positive number.");
      return;
    }
    
    const questionToAdd: typeof batchQuestions[0] = {
      question: newQuestionText.trim(),
      quizType: newQuizType,
      score: scoreNumber,
    };
    
    if (newQuizType === "multiple_choice") {
      questionToAdd.options = newQuestionOptions.map((o) => o.trim()).filter(Boolean);
      questionToAdd.answerkey = newQuestionAnswerKey.trim();
    } else {
      questionToAdd.answerkey = newQuestionAnswerKey.trim();
    }
    
    setBatchQuestions([...batchQuestions, questionToAdd]);
    setError("");
    // Clear form for next question
    setNewQuestionText("");
    setNewQuestionOptions(["", ""]);
    setNewQuestionAnswerKey("");
    setNewQuestionScore("1");
    setNewQuizType("multiple_choice");
  };

  const handleSaveAllQuestions = async () => {
    if (!selectedQuizId || batchQuestions.length === 0) return;
    setSavingQuestion(true);
    setError("");
    try {
      const res = await fetch(`/api/teacher/quizzes/${selectedQuizId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ questions: batchQuestions }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save questions");
        return;
      }
      setBatchQuestions([]);
      setShowAddQuestion(false);
      if (selectedQuizId) fetchQuestionsForQuiz(selectedQuizId);
    } finally {
      setSavingQuestion(false);
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
    } else {
      // For identification, enumeration, and long answer, an answer key is required
      if (!newQuestionAnswerKey.trim()) {
        setError("Answer key is required for this question type.");
        return;
      }
    }
    const scoreNumber = Number(newQuestionScore) || 1;
    if (!Number.isFinite(scoreNumber) || scoreNumber <= 0) {
      setError("Score must be a positive number.");
      return;
    }
    setSavingQuestion(true);
    setError("");
    try {
      const body: { question: string; quizType: string; options?: string[]; answerkey?: string; score?: number } = {
        question: newQuestionText.trim(),
        quizType: newQuizType,
      };
      if (newQuizType === "multiple_choice") {
        body.options = newQuestionOptions.map((o) => o.trim()).filter(Boolean);
        body.answerkey = newQuestionAnswerKey.trim();
      } else if (
        newQuizType === "identification" ||
        newQuizType === "enumeration" ||
        newQuizType === "long_answer"
      ) {
        body.answerkey = newQuestionAnswerKey.trim();
      }
      body.score = scoreNumber;
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
      setNewQuestionScore("1");
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

  // Get unique periods from rows for report filter
  const periodOptionsFromRows = Array.from(
    new Set(rows.map((r) => String(r.period ?? "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // Filter for responses tab - filter by subjectid
  const filteredRows = filterSubject 
    ? rows.filter((r) => r.subjectid === filterSubject) 
    : rows;

  const responsesTotalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentResponsesPage = Math.min(responsesPage, responsesTotalPages);
  const responsesStartIndex = (currentResponsesPage - 1) * PAGE_SIZE;
  const responsesEndIndex = responsesStartIndex + PAGE_SIZE;
  const pagedResponsesRows = filteredRows.slice(responsesStartIndex, responsesEndIndex);

  // Filter for reports tab - cascade filters using IDs and period
  let reportFilteredRows = rows;
  if (reportFilterSection) {
    reportFilteredRows = reportFilteredRows.filter((r) => r.sectionid === reportFilterSection);
  }
  if (reportFilterSubject) {
    reportFilteredRows = reportFilteredRows.filter((r) => r.subjectid === reportFilterSubject);
  }
  if (reportFilterPeriod) {
    reportFilteredRows = reportFilteredRows.filter((r) => String(r.period ?? "") === reportFilterPeriod);
  }
  if (reportFilterDate) {
    reportFilteredRows = reportFilteredRows.filter((r) => {
      const rowDate = r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "";
      return rowDate === reportFilterDate;
    });
  }

  // Latest attempt per (student_id, quizid) for consolidated report
  const latestByStudentQuiz = new Map<string, QuizResponseRow>();
  for (const r of reportFilteredRows) {
    const key = `${r.student_id ?? ""}-${r.quizid ?? r.quizcode}`;
    const existing = latestByStudentQuiz.get(key);
    if (!existing || (r.created_at && existing.created_at && r.created_at > existing.created_at)) {
      latestByStudentQuiz.set(key, r);
    }
  }
  const latestRows = Array.from(latestByStudentQuiz.values());

  // Consolidated: one row per student; columns = Student ID, Name, Section, Subject, then one column per quiz (score/max or —)
  type QuizColumn = { quizid: string; quizcode: string; quizname: string };
  const quizColumns: QuizColumn[] = Array.from(
    new Map(
      latestRows
        .filter((r) => r.quizid || r.quizcode)
        .map((r) => [
          r.quizid ?? r.quizcode,
          { quizid: r.quizid ?? r.quizcode, quizcode: r.quizcode, quizname: (r.quizname ?? r.quizcode).trim() || r.quizcode },
        ])
    ).values()
  );

  const consolidatedByStudent = new Map<string, ConsolidatedRow>();
  for (const r of latestRows) {
    const sid = r.student_id ?? "";
    if (!sid) continue;
    let row = consolidatedByStudent.get(sid);
    if (!row) {
      row = {
        student_id: sid,
        studentname: r.studentname ?? "",
        section: r.sectionname ?? r.section ?? "",
        subject: r.subjectname ?? r.subject ?? "",
        sectionid: r.sectionid ?? "",
        subjectid: r.subjectid ?? "",
        quizzes: new Map(),
      };
      consolidatedByStudent.set(sid, row);
    }
    const qid = r.quizid ?? r.quizcode;
    if (qid && r.score != null) {
      row.quizzes.set(qid, { score: r.score, max_score: r.max_score ?? 0 });
    }
  }
  const consolidatedRows = Array.from(consolidatedByStudent.values());

  const reportsTotalPages = Math.max(1, Math.ceil(consolidatedRows.length / PAGE_SIZE));
  const currentReportsPage = Math.min(reportsPage, reportsTotalPages);
  const reportsStartIndex = (currentReportsPage - 1) * PAGE_SIZE;
  const reportsEndIndex = reportsStartIndex + PAGE_SIZE;
  const pagedReportRows = consolidatedRows.slice(reportsStartIndex, reportsEndIndex);

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
          <p className="mt-4 text-center">
            <Link href="/teacher/register" className="text-cyan-400 hover:text-cyan-300 text-sm">
              Need an account? Register here
            </Link>
          </p>
          <p className="mt-2 text-center">
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
            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setNavOpen((open) => !open)}
              className="md:hidden inline-flex items-center justify-center p-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              aria-label="Toggle navigation"
            >
              <svg
                className="h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={navOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
                />
              </svg>
            </button>
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-2">
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
        </div>

        {/* Mobile nav menu */}
        {navOpen && (
          <div className="mb-4 flex flex-col gap-2 md:hidden">
            <button
              onClick={() => {
                setTab("responses");
                setNavOpen(false);
              }}
              className={`w-full px-4 py-2 rounded-xl text-left font-medium ${
                tab === "responses"
                  ? "bg-cyan-600 text-white"
                  : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
            >
              Responses
            </button>
            <button
              onClick={() => {
                setTab("reports");
                setNavOpen(false);
              }}
              className={`w-full px-4 py-2 rounded-xl text-left font-medium ${
                tab === "reports"
                  ? "bg-cyan-600 text-white"
                  : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
            >
              Reports
            </button>
            <button
              onClick={() => {
                setTab("questions");
                setNavOpen(false);
              }}
              className={`w-full px-4 py-2 rounded-xl text-left font-medium ${
                tab === "questions"
                  ? "bg-cyan-600 text-white"
                  : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
            >
              Question Bank
            </button>
            <button
              onClick={() => {
                setNavOpen(false);
                handleLogout();
              }}
              className="w-full px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-left"
            >
              Logout
            </button>
          </div>
        )}

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
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[640px] text-left">
                    <thead>
                      <tr className="border-b border-slate-600 bg-slate-700/50">
                        <th className="px-4 py-3 text-slate-300 font-semibold">Quiz Code</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Student Name</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Score</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Attempt</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Section</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Subject</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Answers</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedResponsesRows.map((r) => (
                        <tr key={r.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="px-4 py-3 text-slate-200 font-mono">{r.quizcode}</td>
                          <td className="px-4 py-3 text-slate-200">{r.studentname ?? "—"}</td>
                          <td className="px-4 py-3 text-emerald-400 font-medium">{r.score ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-300">{r.attempt_number ?? "-"}</td>
                          <td className="px-4 py-3 text-slate-300">
                            {r.sectionname || r.section || getSectionName(r.sectionid)}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {r.subjectname || r.subject || getSubjectName(r.subjectid)}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {r.answers ? (
                              <button
                                type="button"
                                onClick={() => setAnswerModal(r)}
                                className="px-3 py-1 rounded bg-slate-600 hover:bg-slate-500 text-xs text-white"
                              >
                                View
                              </button>
                            ) : (
                              "-"
                            )}
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

            {filteredRows.length > 0 && (
              <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm text-slate-400">
                <p>
                  Showing{" "}
                  {filteredRows.length === 0
                    ? "0"
                    : `${responsesStartIndex + 1}-${Math.min(responsesEndIndex, filteredRows.length)}`}{" "}
                  of {filteredRows.length} responses
                </p>
                <div className="flex items-center gap-2 self-end md:self-auto">
                  <button
                    type="button"
                    onClick={() => setResponsesPage((p) => Math.max(1, p - 1))}
                    disabled={currentResponsesPage === 1}
                    className="px-3 py-1 rounded-lg border border-slate-600 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700 text-xs"
                  >
                    Previous
                  </button>
                  <span className="text-slate-300 text-xs">
                    Page {currentResponsesPage} of {responsesTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setResponsesPage((p) => Math.min(responsesTotalPages, p + 1))}
                    disabled={currentResponsesPage === responsesTotalPages}
                    className="px-3 py-1 rounded-lg border border-slate-600 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700 text-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            <p className="mt-4 text-slate-500 text-sm text-center">
              One row per attempt (from student_attempts_log). Export includes all visible rows.
            </p>
          </>
        )}

        {tab === "reports" && (
          <>
            <h2 className="text-xl font-semibold text-cyan-300 mb-6">Student Score Report</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* Period Filter */}
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Filter by Period</label>
                <select
                  value={reportFilterPeriod}
                  onChange={(e) => setReportFilterPeriod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">All periods</option>
                  {periodOptionsFromRows.map((p) => (
                    <option key={p} value={p}>Period {p}</option>
                  ))}
                </select>
              </div>
              {/* Section Filter */}
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Filter by Section</label>
                <select
                  value={reportFilterSection}
                  onChange={(e) => {
                    setReportFilterSection(e.target.value);
                    setReportFilterSubject("");
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
                onClick={() => downloadConsolidatedReportCsv(consolidatedRows, quizColumns)}
                disabled={consolidatedRows.length === 0}
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
            ) : consolidatedRows.length === 0 ? (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-12 text-center text-slate-400">
                <p>No data matching selected filters.</p>
                <p className="text-sm mt-2">
                  Total records: {rows.length} | Period:{" "}
                  {reportFilterPeriod || "All"} | Section:{" "}
                  {reportFilterSection ? getSectionLabelFromRows(reportFilterSection) : "None"} | Subject:{" "}
                  {reportFilterSubject ? getSubjectLabelFromRows(reportFilterSubject) : "None"} | Date:{" "}
                  {reportFilterDate || "None"}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[640px] text-left">
                    <thead>
                      <tr className="border-b border-slate-600 bg-slate-700/50">
                        <th className="px-4 py-3 text-slate-300 font-semibold whitespace-nowrap">Student ID</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold whitespace-nowrap">Student Name</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold whitespace-nowrap">Section</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold whitespace-nowrap">Subject</th>
                        {quizColumns.map((q) => (
                          <th key={q.quizid} className="px-4 py-3 text-slate-300 font-semibold whitespace-nowrap">
                            {q.quizname || q.quizcode}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedReportRows.map((r) => (
                        <tr key={r.student_id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="px-4 py-3 text-slate-200 font-mono">{r.student_id}</td>
                          <td className="px-4 py-3 text-slate-200">{r.studentname || "—"}</td>
                          <td className="px-4 py-3 text-slate-300">{r.section || "—"}</td>
                          <td className="px-4 py-3 text-slate-300">{r.subject || "—"}</td>
                          {quizColumns.map((q) => {
                            const qq = r.quizzes.get(q.quizid);
                            const cell = qq
                              ? qq.max_score
                                ? `${qq.score}/${qq.max_score}`
                                : String(qq.score)
                              : "—";
                            return (
                              <td key={q.quizid} className="px-4 py-3 text-emerald-400 font-medium">
                                {cell}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-4 text-slate-500 text-sm">
              <p>One row per student. Total students: {consolidatedRows.length}</p>
              {reportFilterPeriod && <p className="mt-1">Period: {reportFilterPeriod}</p>}
              {reportFilterSection && (
                <p className="mt-1">Section: {getSectionLabelFromRows(reportFilterSection)}</p>
              )}
              {reportFilterSubject && (
                <p className="mt-1">Subject: {getSubjectLabelFromRows(reportFilterSubject)}</p>
              )}
              {reportFilterDate && <p className="mt-1">Date: {reportFilterDate}</p>}
            </div>

            {consolidatedRows.length > 0 && (
              <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm text-slate-400">
                <p>
                  Showing{" "}
                  {consolidatedRows.length === 0
                    ? "0"
                    : `${reportsStartIndex + 1}-${Math.min(reportsEndIndex, consolidatedRows.length)}`}{" "}
                  of {consolidatedRows.length} students
                </p>
                <div className="flex items-center gap-2 self-end md:self-auto">
                  <button
                    type="button"
                    onClick={() => setReportsPage((p) => Math.max(1, p - 1))}
                    disabled={currentReportsPage === 1}
                    className="px-3 py-1 rounded-lg border border-slate-600 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700 text-xs"
                  >
                    Previous
                  </button>
                  <span className="text-slate-300 text-xs">
                    Page {currentReportsPage} of {reportsTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReportsPage((p) => Math.min(reportsTotalPages, p + 1))}
                    disabled={currentReportsPage === reportsTotalPages}
                    className="px-3 py-1 rounded-lg border border-slate-600 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700 text-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
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
                  <div>
                    <label className="block text-slate-400 text-sm mb-1">Period</label>
                    <input
                      type="text"
                      value={newQuizPeriod}
                      onChange={(e) => setNewQuizPeriod(e.target.value)}
                      placeholder="e.g. 1, 2, Prelim, Midterm"
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-sm mb-1">Quiz Name</label>
                    <input
                      type="text"
                      value={newQuizQuizName}
                      onChange={(e) => setNewQuizQuizName(e.target.value)}
                      placeholder="e.g. Chapter 1 Quiz"
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-sm mb-1">Time Limit (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      value={newQuizTimeLimit}
                      onChange={(e) => setNewQuizTimeLimit(e.target.value)}
                      placeholder="Leave blank for no limit"
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      id="allow-retake"
                      type="checkbox"
                      checked={newQuizAllowRetake}
                      onChange={(e) => setNewQuizAllowRetake(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                    />
                    <label htmlFor="allow-retake" className="text-slate-300 text-sm">
                      Allow retake attempts
                    </label>
                  </div>
                  {newQuizAllowRetake && (
                    <div>
                      <label className="block text-slate-400 text-sm mb-1">Max Attempts</label>
                      <input
                        type="number"
                        min={2}
                        value={newQuizMaxAttempts}
                        onChange={(e) => setNewQuizMaxAttempts(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  )}
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
                    {(() => {
                      const totalPages = Math.max(1, Math.ceil(quizzes.length / QUIZ_PAGE_SIZE));
                      const currentPage = Math.min(quizzesPage, totalPages);
                      const start = (currentPage - 1) * QUIZ_PAGE_SIZE;
                      const end = start + QUIZ_PAGE_SIZE;
                      const pageQuizzes = quizzes.slice(start, end);
                      return pageQuizzes.map((quiz) => (
                      <li
                        key={quiz.id}
                        className={`flex flex-wrap items-center justify-between gap-4 p-3 rounded-lg transition-colors ${selectedQuizId === quiz.id ? "bg-cyan-600/30 border border-cyan-500/50" : "bg-slate-700/50 hover:bg-slate-700"}`}
                      >
                        <div className="w-full flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setSelectedQuizId(selectedQuizId === quiz.id ? null : quiz.id)}
                            className="text-left text-slate-200"
                          >
                            {quiz.quizname ? (
                              <><strong>{quiz.quizname}</strong> {quiz.period ? `(Period ${quiz.period})` : ""} · {quiz.quizcode}</>
                            ) : (
                              <>{getSubjectName(quiz.subjectid)} · {getSectionName(quiz.sectionid)} · <strong>{quiz.quizcode}</strong></>
                            )}
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEditQuiz(quiz)}
                              className="px-3 py-1 rounded bg-slate-600 hover:bg-slate-500 text-xs text-white"
                            >
                              Edit
                            </button>
                            <span className="text-slate-500 text-xs">Select to add questions</span>
                          </div>
                        </div>
                        {editingQuizId === quiz.id && (
                          <div className="w-full mt-3 rounded-xl bg-slate-800/80 border border-slate-700 p-4">
                            <h4 className="text-sm font-semibold text-cyan-200 mb-3">Edit Quiz</h4>
                            <form onSubmit={handleUpdateQuiz} className="space-y-3">
                              <div>
                                <label className="block text-slate-400 text-xs mb-1">Subject</label>
                                <select
                                  value={editQuizSubjectId}
                                  onChange={(e) => setEditQuizSubjectId(e.target.value)}
                                  required
                                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                >
                                  <option value="">Select subject...</option>
                                  {subjects.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-slate-400 text-xs mb-1">Section</label>
                                <select
                                  value={editQuizSectionId}
                                  onChange={(e) => setEditQuizSectionId(e.target.value)}
                                  required
                                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                >
                                  <option value="">Select section...</option>
                                  {sections.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-slate-400 text-xs mb-1">Period</label>
                                <input
                                  type="text"
                                  value={editQuizPeriod}
                                  onChange={(e) => setEditQuizPeriod(e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-400 text-xs mb-1">Quiz Name</label>
                                <input
                                  type="text"
                                  value={editQuizName}
                                  onChange={(e) => setEditQuizName(e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-400 text-xs mb-1">Quiz Code</label>
                                <input
                                  type="text"
                                  value={editQuizCode}
                                  onChange={(e) => setEditQuizCode(e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-400 text-xs mb-1">Time Limit (minutes)</label>
                                <input
                                  type="number"
                                  min={1}
                                  value={editQuizTimeLimit}
                                  onChange={(e) => setEditQuizTimeLimit(e.target.value)}
                                  placeholder="Leave blank for no limit"
                                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                                />
                              </div>
                              <div className="flex items-center gap-3">
                                <input
                                  id="edit-allow-retake-inline"
                                  type="checkbox"
                                  checked={editQuizAllowRetake}
                                  onChange={(e) => setEditQuizAllowRetake(e.target.checked)}
                                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                                />
                                <label htmlFor="edit-allow-retake-inline" className="text-slate-300 text-xs">
                                  Allow retake attempts
                                </label>
                              </div>
                              {editQuizAllowRetake && (
                                <div>
                                  <label className="block text-slate-400 text-xs mb-1">Max Attempts</label>
                                  <input
                                    type="number"
                                    min={2}
                                    value={editQuizMaxAttempts}
                                    onChange={(e) => setEditQuizMaxAttempts(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                                  />
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
                                >
                                  Save Changes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingQuizId(null)}
                                  className="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </div>
                        )}
                      </li>
                    ));
                    })()}
                  </ul>
                  {quizzes.length > QUIZ_PAGE_SIZE && (
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span>
                        Page {quizzesPage} of {Math.max(1, Math.ceil(quizzes.length / QUIZ_PAGE_SIZE))}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQuizzesPage((p) => Math.max(1, p - 1))}
                          disabled={quizzesPage === 1}
                          className="px-2 py-1 rounded border border-slate-600 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setQuizzesPage((p) =>
                              Math.min(Math.max(1, Math.ceil(quizzes.length / QUIZ_PAGE_SIZE)), p + 1)
                            )
                          }
                          disabled={quizzesPage >= Math.max(1, Math.ceil(quizzes.length / QUIZ_PAGE_SIZE))}
                          className="px-2 py-1 rounded border border-slate-600 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {selectedQuizId && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-slate-200">Questions in this quiz</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Question type sections */}
                        <div className="inline-flex rounded-xl bg-slate-800/80 border border-slate-600/60 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setQuestionTypeFilter("all")}
                            className={`px-3 py-1.5 text-xs md:text-sm font-medium ${
                              questionTypeFilter === "all"
                                ? "bg-cyan-600 text-white"
                                : "text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuestionTypeFilter("multiple_choice")}
                            className={`px-3 py-1.5 text-xs md:text-sm font-medium ${
                              questionTypeFilter === "multiple_choice"
                                ? "bg-cyan-600 text-white"
                                : "text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            Multiple Choice
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuestionTypeFilter("identification")}
                            className={`px-3 py-1.5 text-xs md:text-sm font-medium ${
                              questionTypeFilter === "identification"
                                ? "bg-cyan-600 text-white"
                                : "text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            Identification
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuestionTypeFilter("enumeration")}
                            className={`px-3 py-1.5 text-xs md:text-sm font-medium ${
                              questionTypeFilter === "enumeration"
                                ? "bg-cyan-600 text-white"
                                : "text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            Enumeration
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuestionTypeFilter("long_answer")}
                            className={`px-3 py-1.5 text-xs md:text-sm font-medium ${
                              questionTypeFilter === "long_answer"
                                ? "bg-cyan-600 text-white"
                                : "text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            Long Answer
                          </button>
                        </div>
                        <button
                          onClick={() => setShowAddQuestion(true)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold relative"
                        >
                          Add Question
                          {batchQuestions.length > 0 && (
                            <span className="absolute -top-2 -right-2 bg-cyan-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                              {batchQuestions.length}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                    {showAddQuestion && (
                      <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6 mb-6">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-cyan-300 font-semibold">Add Questions (Batch Mode)</h4>
                          {batchQuestions.length > 0 && (
                            <span className="text-slate-400 text-sm">
                              {batchQuestions.length} question{batchQuestions.length !== 1 ? "s" : ""} ready to save
                            </span>
                          )}
                        </div>
                        
                        {batchQuestions.length > 0 && (
                          <div className="mb-4 p-4 rounded-lg bg-slate-700/50 border border-slate-600/50">
                            <h5 className="text-slate-300 font-medium mb-2 text-sm">Questions to be saved ({batchQuestions.length}):</h5>
                            <ul className="space-y-2 max-h-40 overflow-y-auto">
                              {batchQuestions.map((q, idx) => (
                                <li key={idx} className="text-sm text-slate-400 flex items-start gap-2">
                                  <span className="text-cyan-400">{idx + 1}.</span>
                                  <span className="flex-1">
                                    {q.question.substring(0, 60)}{q.question.length > 60 ? "..." : ""}
                                    <span className="text-slate-500 ml-2">({q.quizType.replace("_", " ")}, {q.score} pt{q.score !== 1 ? "s" : ""})</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setBatchQuestions(batchQuestions.filter((_, i) => i !== idx))}
                                    className="text-red-400 hover:text-red-300 text-xs"
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={handleSaveAllQuestions}
                                disabled={savingQuestion}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm"
                              >
                                {savingQuestion ? "Saving..." : `Save All ${batchQuestions.length} Question${batchQuestions.length !== 1 ? "s" : ""}`}
                              </button>
                              <button
                                type="button"
                                onClick={() => setBatchQuestions([])}
                                className="px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 text-slate-200 font-medium text-sm"
                              >
                                Clear All
                              </button>
                            </div>
                          </div>
                        )}
                        
                        <form onSubmit={handleAddQuestionToBatch} className="space-y-4">
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
                                const nextType = e.target.value as typeof newQuizType;
                                setNewQuizType(nextType);
                                if (nextType === "multiple_choice" && newQuestionOptions.length === 0) {
                                  setNewQuestionOptions(["", ""]);
                                }
                                // Clear previous answer key when switching type to avoid confusion
                                setNewQuestionAnswerKey("");
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
                          {newQuizType !== "multiple_choice" && (
                            <div>
                              <label className="block text-slate-400 text-sm mb-1">Answer key</label>
                              <textarea
                                value={newQuestionAnswerKey}
                                onChange={(e) => setNewQuestionAnswerKey(e.target.value)}
                                required
                                rows={newQuizType === "enumeration" ? 3 : 2}
                                className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                placeholder={
                                  newQuizType === "enumeration"
                                    ? "Enter the correct items (one per line). Matching will be case-insensitive."
                                    : "Enter the correct answer. Matching will be case-insensitive."
                                }
                              />
                              {newQuizType === "enumeration" && (
                                <p className="mt-1 text-xs text-slate-500">
                                  Tip: put one correct item per line. Students&apos; answers are compared in a
                                  case-insensitive way.
                                </p>
                              )}
                            </div>
                          )}
                          <div>
                            <label className="block text-slate-400 text-sm mb-1">Score</label>
                            <input
                              type="number"
                              min={0.5}
                              step={0.5}
                              value={newQuestionScore}
                              onChange={(e) => setNewQuestionScore(e.target.value)}
                              className="w-32 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                            <p className="mt-1 text-xs text-slate-500">Default is 1 point per question.</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                            >
                              Add to Batch
                            </button>
                            {batchQuestions.length > 0 && (
                              <button
                                type="button"
                                onClick={handleSaveAllQuestions}
                                disabled={savingQuestion}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
                              >
                                {savingQuestion ? "Saving..." : `Save All ${batchQuestions.length}`}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddQuestion(false);
                                setNewQuestionText("");
                                setNewQuestionOptions(["", ""]);
                                setNewQuestionAnswerKey("");
                                setNewQuestionScore("1");
                              }}
                              className="px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 text-slate-200 font-medium"
                            >
                              Close Form
                            </button>
                            {batchQuestions.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm("Clear all unsaved questions?")) {
                                    setBatchQuestions([]);
                                  }
                                }}
                                className="px-4 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-medium"
                              >
                                Clear Batch
                              </button>
                            )}
                          </div>
                        </form>
                        <p className="mt-3 text-slate-500 text-xs">
                          💡 Tip: Add multiple questions to the batch, then click &quot;Save All&quot; to save them at once.
                        </p>
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
                        {questionsForQuiz
                          .filter((q) =>
                            questionTypeFilter === "all" ? true : q.quiztype === questionTypeFilter
                          )
                          .map((q) => {
                          let optionsParsed: string[] = [];
                          try {
                            if (q.options) optionsParsed = JSON.parse(q.options);
                          } catch {
                            // ignore
                          }
                            return (
                            <li key={q.id} className="p-3 rounded-lg bg-slate-700/50 border border-slate-600/60">
                              {editingQuestionId === q.id ? (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-500 text-xs uppercase">
                                      Editing {q.quiztype.replace("_", " ")}
                                    </span>
                                    <span className="text-slate-400 text-xs">
                                      Score:&nbsp;
                                      <input
                                        type="number"
                                        min={0.5}
                                        step={0.5}
                                        value={editScore}
                                        onChange={(e) => setEditScore(e.target.value)}
                                        className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                      />
                                    </span>
                                  </div>
                                  <div>
                                    <label className="block text-slate-400 text-xs mb-1">Question</label>
                                    <textarea
                                      value={editQuestionText}
                                      onChange={(e) => setEditQuestionText(e.target.value)}
                                      rows={3}
                                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-slate-400 text-xs mb-1">Answer key</label>
                                    {q.quiztype === "multiple_choice" && editQuestionOptions.length > 0 ? (
                                      <select
                                        value={editAnswerKey}
                                        onChange={(e) => setEditAnswerKey(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                      >
                                        <option value="">Select the correct option...</option>
                                        {editQuestionOptions.map((opt) => (
                                          <option key={opt} value={opt}>
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <textarea
                                        value={editAnswerKey}
                                        onChange={(e) => setEditAnswerKey(e.target.value)}
                                        rows={q.quiztype === "enumeration" ? 3 : 2}
                                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                      />
                                    )}
                                  </div>
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      type="button"
                                      disabled={savingEdit}
                                      onClick={async () => {
                                        setError("");
                                        const trimmedQuestion = editQuestionText.trim();
                                        const trimmedAnswer = editAnswerKey.trim();
                                        const scoreNumber = Number(editScore) || 1;
                                        if (!trimmedQuestion) {
                                          setError("Question text is required.");
                                          return;
                                        }
                                        if (!trimmedAnswer) {
                                          setError("Answer key is required.");
                                          return;
                                        }
                                        if (!Number.isFinite(scoreNumber) || scoreNumber <= 0) {
                                          setError("Score must be a positive number.");
                                          return;
                                        }
                                        setSavingEdit(true);
                                        try {
                                          const res = await fetch(`/api/teacher/questions/${q.id}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            credentials: "include",
                                            body: JSON.stringify({
                                              question: trimmedQuestion,
                                              answerkey: trimmedAnswer,
                                              score: scoreNumber,
                                            }),
                                          });
                                          if (!res.ok) {
                                            const d = await res.json().catch(() => ({}));
                                            setError(d.error ?? "Failed to update question");
                                          } else if (selectedQuizId) {
                                            await fetchQuestionsForQuiz(selectedQuizId);
                                            setEditingQuestionId(null);
                                          }
                                        } finally {
                                          setSavingEdit(false);
                                        }
                                      }}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
                                    >
                                      {savingEdit ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={savingEdit}
                                      onClick={() => setEditingQuestionId(null)}
                                      className="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-slate-500 text-xs uppercase">
                                        {q.quiztype.replace("_", " ")}
                                      </span>
                                      <span className="text-xs text-emerald-300">
                                        {q.score && q.score !== 1 ? `${q.score} pts` : "1 pt"}
                                      </span>
                                    </div>
                                    <p className="text-slate-200">{q.question}</p>
                                    {q.quiztype === "multiple_choice" && (optionsParsed.length > 0 || q.answerkey) && (
                                      <p className="text-slate-500 text-sm mt-1">
                                        Options: {optionsParsed.join(", ")}
                                        {q.answerkey && (
                                          <span className="text-emerald-400 ml-2">Answer: {q.answerkey}</span>
                                        )}
                                      </p>
                                    )}
                                    {q.quiztype !== "multiple_choice" && q.answerkey && (
                                      <p className="text-slate-500 text-sm mt-1">
                                        <span className="text-slate-400">Answer key:</span>{" "}
                                        <span className="text-emerald-400 whitespace-pre-line">
                                          {q.answerkey}
                                        </span>
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-1 shrink-0">
                                    <button
                                      onClick={() => {
                                        setEditingQuestionId(q.id);
                                        setEditQuestionText(q.question);
                                        setEditAnswerKey(q.answerkey ?? "");
                                        setEditScore(String(q.score ?? 1));
                                        // Parse options for multiple choice questions
                                        if (q.quiztype === "multiple_choice" && q.options) {
                                          try {
                                            const parsed = JSON.parse(q.options);
                                            setEditQuestionOptions(
                                              Array.isArray(parsed) ? parsed.map((o: unknown) => String(o)) : []
                                            );
                                          } catch {
                                            setEditQuestionOptions([]);
                                          }
                                        } else {
                                          setEditQuestionOptions([]);
                                        }
                                      }}
                                      className="px-3 py-1 rounded bg-slate-600 hover:bg-slate-500 text-white text-xs"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => deleteQuestion(q.id)}
                                      className="px-3 py-1 rounded bg-red-600/80 hover:bg-red-600 text-white text-xs"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              )}
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
      {answerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-cyan-300">Student Answers</h3>
              <button
                type="button"
                onClick={() => setAnswerModal(null)}
                className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm"
              >
                Close
              </button>
            </div>
            <div className="text-sm text-slate-300 mb-3">
              <div>Student: <span className="text-slate-100">{answerModal.studentname ?? "—"}</span></div>
              <div>Quiz: <span className="text-slate-100">{answerModal.quizcode}</span></div>
              <div>Attempt: <span className="text-slate-100">{answerModal.attempt_number ?? "—"}</span></div>
            </div>
            {(() => {
              const raw = (answerModal.answers ?? {}) as Record<string, unknown>;
              const mc = Array.isArray(raw.multiple_choice) ? raw.multiple_choice : [];
              const id = Array.isArray(raw.identification) ? raw.identification : [];
              const en = Array.isArray(raw.enumeration) ? raw.enumeration : [];
              const hasAny = mc.length + id.length + en.length > 0;
              if (!hasAny) {
                return (
                  <div className="rounded-lg bg-slate-800 p-4 text-sm text-slate-400">
                    No saved answers for this attempt.
                  </div>
                );
              }
              return (
                <div className="max-h-[60vh] overflow-auto rounded-lg bg-slate-900/40 p-2">
                  {answersLoading && (
                    <div className="mb-3 text-xs text-slate-500">Loading questions…</div>
                  )}
                  {renderAnswerBlock("Multiple Choice", mc as Array<{ questionId: string; answer: string }>, answerQuestions)}
                  {renderAnswerBlock("Identification", id as Array<{ questionId: string; answer: string }>, answerQuestions)}
                  {renderAnswerBlock("Enumeration", en as Array<{ questionId: string; answer: string }>, answerQuestions)}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
