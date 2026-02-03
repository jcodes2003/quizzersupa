"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import supabase from "../supabase-client";
import type {
  MultipleChoiceQuestion,
  IdentificationQuestion,
  EnumerationQuestion,
  QuizData,
} from "../quiz-data";

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

function checkIdentification(user: string, correct: string | string[]): boolean {
  const userNorm = normalizeAnswer(user);
  const answers = Array.isArray(correct) ? correct : [correct];
  return answers.some((a) => normalizeAnswer(a) === userNorm);
}

const ATTEMPT_KEY = "quiz_attempts";

function getAttemptKey(topic: string, section: string, studentId: string): string {
  const normalized = (studentId || "anonymous").trim().toLowerCase().replace(/\s+/g, "_");
  return `${ATTEMPT_KEY}_${topic}_${section}_${normalized}`;
}

function getAttemptCount(topic: string, section: string, studentId: string): number {
  if (typeof window === "undefined") return 0;
  const key = getAttemptKey(topic, section, studentId);
  return parseInt(localStorage.getItem(key) || "0", 10);
}

function incrementAttemptCount(topic: string, section: string, studentId: string): number {
  const key = getAttemptKey(topic, section, studentId);
  const next = getAttemptCount(topic, section, studentId) + 1;
  localStorage.setItem(key, String(next));
  return next;
}

interface QuizResults {
  studentName: string;
  section: string;
  attempts: number;
  mcScore: number;
  idScore: number;
  enumScore: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
}

interface QuizProps {
  topic: string;
  section: string;
  quizTitle: string;
  quizData: QuizData;
  /** When set (quiz taken by code), score is saved to student_quiz with this quizid and quiztbl.score is updated */
  quizId?: string | null;
}

const SECTION_MC = 0;
const SECTION_ID = 1;
const SECTION_ENUM = 2;

export default function Quiz({ topic, section, quizTitle, quizData, quizId }: QuizProps) {
  const { multipleChoice: multipleChoiceQuestions, identification: identificationQuestions, enumeration: enumerationQuestions = [], programming: programmingSection } = quizData;
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [mcAnswers, setMcAnswers] = useState<Record<string, string>>({});
  const [idAnswers, setIdAnswers] = useState<Record<string, string>>({});
  const [enumAnswers, setEnumAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<QuizResults | null>(null);
  const [tabLeft, setTabLeft] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const hasMc = multipleChoiceQuestions.length > 0;
  const hasId = identificationQuestions.length > 0;
  const hasEnumOrProg = !!programmingSection || enumerationQuestions.length > 0;
  const sectionOrder = useMemo(
    () => [
      ...(hasMc ? [SECTION_MC] : []),
      ...(hasId ? [SECTION_ID] : []),
      ...(hasEnumOrProg ? [SECTION_ENUM] : []),
    ],
    [hasMc, hasId, hasEnumOrProg]
  );
  const totalPages = sectionOrder.length;
  const currentSection = totalPages > 0 && currentPage < totalPages ? sectionOrder[currentPage]! : SECTION_MC;

  const getSetLabelForSection = (sectionConst: number): string => {
    const idx = sectionOrder.indexOf(sectionConst);
    return idx >= 0 ? String.fromCharCode(65 + idx) : "?";
  };

  useEffect(() => {
    if (submitError) errorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [submitError]);

  const getUnansweredPages = useCallback((): number[] => {
    const pages: number[] = [];
    const mcUnanswered = hasMc && multipleChoiceQuestions.some((q) => !(mcAnswers[q.id] || "").trim());
    const idUnanswered = hasId && identificationQuestions.some((q) => !(idAnswers[q.id] || "").trim());
    const enumUnanswered = hasEnumOrProg && !programmingSection && enumerationQuestions.some((q) => !(enumAnswers[q.id] || "").trim());
    if (mcUnanswered) pages.push(sectionOrder.indexOf(SECTION_MC));
    if (idUnanswered) pages.push(sectionOrder.indexOf(SECTION_ID));
    if (enumUnanswered) pages.push(sectionOrder.indexOf(SECTION_ENUM));
    return pages.filter((p) => p >= 0);
  }, [hasMc, hasId, hasEnumOrProg, mcAnswers, idAnswers, enumAnswers, multipleChoiceQuestions, identificationQuestions, enumerationQuestions, programmingSection, sectionOrder]);

  const isComplete = useCallback(() => {
    if (!studentName.trim()) return false;
    return getUnansweredPages().length === 0;
  }, [studentName, getUnansweredPages]);

  const gradeQuiz = useCallback(async () => {
    const name = studentName.trim();
    const id = studentId.trim();
    if (!id) {
      setSubmitError("Please enter your student ID.");
      setCurrentPage(0);
      return;
    }

    // Check attempt count from server if quizId is available (quiz taken by code)
    let currentAttempts = getAttemptCount(topic, section, id);
    if (quizId) {
      try {
        const res = await fetch(`/api/student-attempts-count?quizId=${quizId}&studentId=${encodeURIComponent(id)}`);
        if (res.ok) {
          const data = await res.json();
          currentAttempts = data.attemptCount ?? 0;
        }
      } catch (err) {
        console.error("Failed to fetch attempt count:", err);
        // Fall back to localStorage count if server check fails
      }
    }

    if (currentAttempts >= 2) {
      setSubmitError("You've used all 2 attempts for this quiz. You cannot retake it.");
      setCurrentPage(0);
      return;
    }

    let mcScore = 0;
    for (const q of multipleChoiceQuestions) {
      if (normalizeAnswer(mcAnswers[q.id] || "") === normalizeAnswer(q.correct)) {
        mcScore++;
      }
    }

    let idScore = 0;
    for (const q of identificationQuestions) {
      const userAnswer = idAnswers[q.id] || "";
      // Use the answer key if available from API; if empty, fall back to old behavior
      const hasAnswerKey = Array.isArray(q.correct)
        ? q.correct.length > 0
        : !!q.correct && q.correct.trim().length > 0;

      if (hasAnswerKey) {
        if (checkIdentification(userAnswer, q.correct)) {
          idScore++;
        }
      } else if (checkIdentification(userAnswer, q.correct)) {
        idScore++;
      }
    }

    let enumPoints = 0;
    if (!programmingSection) {
      for (const q of enumerationQuestions) {
        const userItems = parseEnumerationInput(enumAnswers[q.id] || "");
        // Use the answer key if available from API; if empty, fall back to old behavior
        if (Array.isArray(q.correct) && q.correct.length > 0) {
          const matched = checkEnumerationMatch(userItems, q.correct);
          const expected = q.correct.length;
          enumPoints += expected > 0 && matched / expected >= 0.8 ? 1 : 0;
        } else {
          const matched = checkEnumerationMatch(userItems, q.correct);
          const expected = q.correct.length;
          enumPoints += expected > 0 && matched / expected >= 0.8 ? 1 : 0;
        }
      }
    }

    const maxScore = programmingSection
      ? multipleChoiceQuestions.length + identificationQuestions.length
      : multipleChoiceQuestions.length + identificationQuestions.length + (enumerationQuestions?.length ?? 0);
    const totalScore = mcScore + idScore + enumPoints;
    const percentage = Math.round((totalScore / maxScore) * 100);

    const attempts = incrementAttemptCount(topic, section, id);

    setResults({
      studentName: name,
      section,
      attempts,
      mcScore,
      idScore,
      enumScore: enumPoints,
      totalScore,
      maxScore,
      percentage,
    });
    setSubmitted(true);

    // Save attempt and update score if this is the best attempt for this student
    if (quizId) {
      if (!supabase) {
        // Supabase client isn't available (e.g. during static prerender); skip saving.
        console.warn("Supabase client not available; skipping score save.");
      } else {
        // Save the attempt record and let the API handle the best score logic
        (async () => {
          try {
            const res = await fetch("/api/student-attempts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                quizId,
                studentName: name,
                studentId: id,
                score: totalScore,
                maxScore,
                attemptNumber: currentAttempts + 1,
              }),
            });

            if (!res.ok) {
              const errorData = await res.json();
              console.error("Failed to save attempt:", errorData.error);
            }
          } catch (err) {
            console.error("Error saving attempt:", err);
          }
        })();
      }
    }
  }, [topic, studentName, studentId, section, mcAnswers, idAnswers, enumAnswers, multipleChoiceQuestions, identificationQuestions, enumerationQuestions, programmingSection, quizId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && !submitted) {
        setTabLeft(true);
        gradeQuiz();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [submitted, gradeQuiz]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!studentName.trim()) {
      setSubmitError("Please enter your name.");
      setCurrentPage(0);
      return;
    }
    if (!studentId.trim()) {
      setSubmitError("Please enter your student ID.");
      setCurrentPage(0);
      return;
    }
    const unansweredPages = getUnansweredPages();
    if (unansweredPages.length > 0) {
      const firstPage = unansweredPages[0]!;
      setCurrentPage(firstPage);
      const partNames = sectionOrder.map((s) =>
        s === SECTION_MC ? "Multiple Choice" : s === SECTION_ID ? "Identification" : programmingSection ? "Programming" : "Enumeration"
      );
      setSubmitError(`Please answer all questions. You have unanswered items in Part ${firstPage + 1}: ${partNames[firstPage] ?? "Unknown"}.`);
      return;
    }
    gradeQuiz();
  };

  if (submitted && results) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 md:p-10">
        <div className="max-w-2xl mx-auto">
          {tabLeft && (
            <div className="mb-6 p-4 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-200 text-center">
              <p className="font-semibold">⚠️ Tab switch detected — Quiz auto-submitted</p>
              <p className="text-sm mt-1 opacity-90">Your answers have been graded.</p>
            </div>
          )}
          <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 shadow-2xl">
            <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Quiz Results
            </h1>
            <p className="text-center text-slate-400 mb-2">{quizTitle}</p>
            <p className="text-center text-cyan-300 font-semibold mb-2">Answered by: {results.studentName}</p>
            <p className="text-center text-slate-400 mb-2">Section: {results.section}</p>
            <p className="text-center text-slate-500 text-sm mb-8">Attempt {results.attempts} of 2</p>

            <div className="grid gap-4 mb-8">
              <div className="flex justify-between items-center p-4 rounded-xl bg-slate-700/50">
                <span className="text-slate-300">Part I: Multiple Choice</span>
                <span className="font-bold text-emerald-400">{results.mcScore} / {multipleChoiceQuestions.length}</span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-xl bg-slate-700/50">
                <span className="text-slate-300">Part II: Identification</span>
                <span className="font-bold text-emerald-400">{results.idScore} / {identificationQuestions.length}</span>
              </div>
              {programmingSection ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <span className="text-slate-300">Part III: Programming Problem (10 pts)</span>
                  <p className="text-amber-200 text-sm mt-2">Submit your code and this score to GCR.</p>
                </div>
              ) : (
                <div className="flex justify-between items-center p-4 rounded-xl bg-slate-700/50">
                  <span className="text-slate-300">Part III: Enumeration</span>
                  <span className="font-bold text-emerald-400">{results.enumScore} / {enumerationQuestions?.length ?? 0}</span>
                </div>
              )}
            </div>

            <div className="text-center p-6 rounded-xl bg-gradient-to-r from-emerald-600/30 to-cyan-600/30 border border-emerald-500/30">
              <p className="text-slate-400 text-sm uppercase tracking-wider mb-1">Total Score</p>
              <p className="text-4xl font-bold text-emerald-400">
                {results.totalScore} / {results.maxScore}
              </p>
              <p className="text-2xl font-semibold mt-2 text-cyan-300">{results.percentage}%</p>
            </div>

            <div className="mt-8 space-y-4">
              {results.attempts >= 2 && (
                <div className="p-4 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-200 text-center">
                  <p className="font-semibold">You've used all 2 attempts. You cannot retake this quiz.</p>
                </div>
              )}
              <div className="flex gap-4">
                <Link
                  href="/"
                  className="flex-1 py-3 px-6 rounded-xl bg-slate-600 hover:bg-slate-500 text-white font-semibold text-center transition-colors"
                >
                  ← Back to Home
                </Link>
                {results.attempts < 2 && (
                  <button
                    onClick={() => {
                      setSubmitted(false);
                      setResults(null);
                      setMcAnswers({});
                      setIdAnswers({});
                      setEnumAnswers({});
                      setTabLeft(false);
                      setCurrentPage(0);
                    }}
                    className="flex-1 py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
                  >
                    Retake Quiz
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <Link href="/" className="text-slate-500 hover:text-cyan-400 text-sm mb-2 inline-block">← Back to Home</Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            {quizTitle} Quiz
          </h1>
          <p className="text-slate-400 mt-2">Stay on this tab — switching tabs will auto-submit</p>
          <p className="text-slate-500 text-sm mt-1">Section {section} · Page {currentPage + 1} of {totalPages || 1}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-4 md:p-6 shadow-2xl space-y-4">
            <div>
              <label className="block text-slate-300 font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Enter your full name..."
                className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-2">Student ID</label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Enter your student ID..."
                className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          {submitError && (
            <div ref={errorRef} className="p-4 rounded-xl bg-red-500/20 border border-red-500/50 text-red-200 text-center">
              {submitError}
            </div>
          )}

          <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6 md:p-8 shadow-2xl">
            {currentSection === SECTION_MC && (
              <>
                <h2 className="text-xl font-bold text-emerald-400 mb-1">
                  Set {getSetLabelForSection(SECTION_MC)}: Multiple Choice
                </h2>
                <p className="text-slate-400 text-sm mb-6">{multipleChoiceQuestions.length} items — Choose the best answer</p>
                <div className="space-y-6">
                  {multipleChoiceQuestions.map((q, i) => (
                    <MCQuestion
                      key={q.id}
                      question={q}
                      index={i + 1}
                      value={mcAnswers[q.id] ?? ""}
                      onChange={(v) => setMcAnswers((prev) => ({ ...prev, [q.id]: v }))}
                    />
                  ))}
                </div>
              </>
            )}

            {currentSection === SECTION_ID && (
              <>
                <h2 className="text-xl font-bold text-cyan-400 mb-1">
                  Set {getSetLabelForSection(SECTION_ID)}: Identification
                </h2>
                <p className="text-slate-400 text-sm mb-6">{identificationQuestions.length} items — Write the correct term</p>
                <div className="space-y-6">
                  {identificationQuestions.map((q, i) => (
                    <IdQuestion
                      key={q.id}
                      question={q}
                      index={i + 1}
                      value={idAnswers[q.id] ?? ""}
                      onChange={(v) => setIdAnswers((prev) => ({ ...prev, [q.id]: v }))}
                    />
                  ))}
                </div>
              </>
            )}

            {currentSection === SECTION_ENUM && programmingSection ? (
              <>
                <h2 className="text-xl font-bold text-amber-400 mb-1">
                  Set {getSetLabelForSection(SECTION_ENUM)}: Real-Life Programming Problem (10 points)
                </h2>
                <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-100">
                  <p className="font-semibold mb-3">📋 Instructions:</p>
                  <p className="text-sm mb-4">{programmingSection.instructions}</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/30">
                  <p className="font-semibold text-slate-200 mb-3">Problem:</p>
                  <pre className="text-slate-300 whitespace-pre-wrap font-sans text-sm">{programmingSection.problem}</pre>
                </div>
              </>
            ) : currentSection === SECTION_ENUM && (
              <>
                <h2 className="text-xl font-bold text-amber-400 mb-1">
                  Set {getSetLabelForSection(SECTION_ENUM)}: Enumeration
                </h2>
                <p className="text-slate-400 text-sm mb-4">3 items — 1 point each</p>
                <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-100">
                  <p className="font-semibold mb-2">📋 How to answer enumeration questions:</p>
                  <ul className="text-sm space-y-1 list-disc list-inside mb-3">
                    <li>List each item on a new line, OR separate with commas or semicolons</li>
                    <li>Order does not matter — list items in any sequence</li>
                    <li>Capital or small letters are both accepted</li>
                    <li>Each question is worth 1 point (you need most items correct to earn the point)</li>
                  </ul>
                  <p className="text-sm font-medium mb-1">Example:</p>
                  <p className="text-sm text-slate-300 bg-slate-800/50 p-3 rounded-lg font-mono">
                    Line, Shape, Color, Value<br />
                    texture space
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Both formats above are valid.</p>
                </div>
                <div className="space-y-6">
                  {enumerationQuestions.map((q, i) => (
                    <EnumQuestion
                      key={q.id}
                      question={q}
                      index={i + 1}
                      value={enumAnswers[q.id] ?? ""}
                      onChange={(v) => setEnumAnswers((prev) => ({ ...prev, [q.id]: v }))}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-between items-center gap-4">
            <button
              type="button"
              onClick={() => { setSubmitError(null); setCurrentPage((p) => Math.max(0, p - 1)); }}
              disabled={currentPage === 0}
              className="px-6 py-3 rounded-xl bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
            >
              ← Previous
            </button>
            {currentPage < totalPages - 1 ? (
              <button
                type="button"
                onClick={() => { setSubmitError(null); setCurrentPage((p) => Math.min(totalPages - 1, p + 1)); }}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                type="submit"
                className="px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
              >
                Submit Quiz
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function MCQuestion({
  question,
  index,
  value,
  onChange,
}: {
  question: MultipleChoiceQuestion;
  index: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/30">
      <p className="font-medium text-slate-200 mb-3">
        {index}. {question.question}
      </p>
      <div className="grid gap-2">
        {question.options.map((opt) => (
          <label
            key={opt}
            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
              value === opt ? "bg-emerald-600/30 border border-emerald-500/50" : "bg-slate-700/50 hover:bg-slate-600/50"
            }`}
          >
            <input
              type="radio"
              name={question.id}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="sr-only"
            />
            <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-slate-400 flex items-center justify-center">
              {value === opt && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
            </span>
            <span className="text-slate-200">{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function IdQuestion({
  question,
  index,
  value,
  onChange,
}: {
  question: IdentificationQuestion;
  index: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/30">
      <p className="font-medium text-slate-200 mb-3">
        {index}. {question.question}
      </p>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your answer..."
        className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />
    </div>
  );
}

function EnumQuestion({
  question,
  index,
  value,
  onChange,
}: {
  question: EnumerationQuestion;
  index: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/30">
      <p className="font-medium text-slate-200 mb-3">
        {index}. {question.question}
      </p>
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="List items (separate with comma, new line, or semicolon)..."
        rows={4}
        className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
      />
    </div>
  );
}
