"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Quiz from "../components/Quiz";
import { QUIZ_BY_TOPIC, type QuizTopic } from "../quiz-data";
import type { QuizData } from "../quiz-data";

const TOPIC_LABELS: Record<string, string> = {
  hci: "Human Computer Interaction",
  cp2: "Computer Programming 2",
  itera: "Living in IT Era",
};

type ApiQuestion = {
  id: string;
  question: string;
  quiztype: string;
  answerkey?: string | null;
  options?: string | null;
};
type ApiQuiz = {
  id: string;
  quizcode: string;
  sectionName: string;
  time_limit_minutes?: number | null;
  allow_retake?: boolean;
  max_attempts?: number | null;
};

// Ensure options, reply, etc. inside arrays in quiz data all have totally unique keys
// Even if that means sometimes using a combination of values and indices

function parseOptions(options: string | null | undefined): string[] {
  if (options == null || options === "") return [];
  try {
    const parsed = JSON.parse(options);
    return Array.isArray(parsed) ? parsed.map((o: unknown) => String(o)) : [];
  } catch {
    return [];
  }
}

function getQuizType(q: ApiQuestion): string {
  const t = (q.quiztype ?? (q as Record<string, unknown>).quizType ?? "").toString().trim().toLowerCase();
  return t;
}

// UNIQUE: Guarantee that option keys are unique per question, even if values repeat or are indices
function buildQuizDataFromApi(questions: ApiQuestion[]): QuizData {
  const list = Array.isArray(questions) ? questions : [];
  const multipleChoice = list
    .filter((q) => getQuizType(q) === "multiple_choice")
    .map((q, idx) => {
      const rawOptions =
        (q.options ?? (q as Record<string, unknown>).options) as string | null | undefined;
      const options = parseOptions(rawOptions);
      const correct =
        (q.answerkey ?? (q as Record<string, unknown>).answerkey ?? "").toString().trim();
      const id = (q.id ?? "").toString();
      const question = (q.question ?? "").toString();

      // Ensure ALL options in arrays (passed to Quiz) have unique keys in their mapped lists (e.g., use `${q.id}-${i}`)
      // Fix options edge case for less than 2 options
      let safeOptions: string[];
      if (options.length >= 2) {
        safeOptions = options;
      } else {
        // Add filler to avoid duplicate keys if "(No options)" repeats. Use idx for unique combo.
        safeOptions = [...options, `(No options) [${id}-${idx}]`];
      }

      return {
        id,
        question,
        options: safeOptions,
        correct: options.includes(correct) ? correct : (options[0] ?? ""),
      };
    })
    .filter((q) => q.options.length >= 2);
  const identification = list
    .filter((q) => {
      const t = getQuizType(q);
      return (
        t === "identification" ||
        t === "long_answer" ||
        (t === "multiple_choice" && parseOptions(q.options).length < 2)
      );
    })
    .map((q) => ({
      id: (q.id ?? "").toString(),
      question: (q.question ?? "").toString(),
      correct: (q.answerkey ?? (q as Record<string, unknown>).answerkey ?? "").toString().trim(),
    }));
  const enumeration = list
    .filter((q) => getQuizType(q) === "enumeration")
    .map((q) => {
      const answerKeyStr = (q.answerkey ?? (q as Record<string, unknown>).answerkey ?? "").toString().trim();
      // Use answer text + index as unique keys in rendering, handled later
      const answers = answerKeyStr
        .split("\n")
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
      return {
        id: (q.id ?? "").toString(),
        question: (q.question ?? "").toString(),
        correct: answers,
      };
    });
  return {
    title: "Teacher Quiz",
    multipleChoice,
    identification,
    enumeration,
  };
}

function QuizContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim()?.toUpperCase();
  const topic = (searchParams.get("topic") || "hci") as QuizTopic;
  const section = searchParams.get("section") || "";

  const [codeLoading, setCodeLoading] = useState(!!code);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [apiQuiz, setApiQuiz] = useState<ApiQuiz | null>(null);
  const [apiQuestions, setApiQuestions] = useState<ApiQuestion[]>([]);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      setCodeLoading(true);
      setCodeError(null);
      try {
        const res = await fetch(`/api/quiz-by-code?code=${encodeURIComponent(code)}`);
        if (cancelled) return;
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setCodeError(d.error || "Quiz not found");
          return;
        }
        const data = await res.json();
        setApiQuiz(data.quiz);
        setApiQuestions(data.questions ?? []);
      } catch {
        if (!cancelled) setCodeError("Failed to load quiz");
      } finally {
        if (!cancelled) setCodeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (code) {
    if (codeLoading) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
          <p className="text-slate-400">Loading quiz...</p>
        </div>
      );
    }
    if (codeError || !apiQuiz) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
          <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 max-w-md text-center">
            <h2 className="text-xl font-bold text-amber-400 mb-2">Quiz not found</h2>
            <p className="text-slate-400 mb-6">
              {codeError || "Invalid or expired quiz code."}
            </p>
            <Link href="/" className="text-cyan-400 hover:underline">
              ← Back to Home
            </Link>
          </div>
        </div>
      );
    }
    const dynamicData = buildQuizDataFromApi(apiQuestions);
    const hasAnyQuestions =
      dynamicData.multipleChoice.length > 0 ||
      dynamicData.identification.length > 0 ||
      (dynamicData.enumeration?.length ?? 0) > 0;
    if (!hasAnyQuestions) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
          <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 max-w-md text-center">
            <h2 className="text-xl font-bold text-amber-400 mb-2">No questions yet</h2>
            <p className="text-slate-400 mb-6">
              This quiz has no questions. Ask your teacher to add some.
            </p>
            <Link href="/" className="text-cyan-400 hover:underline">
              ← Back to Home
            </Link>
          </div>
        </div>
      );
    }
    return (
      <Quiz
        topic={apiQuiz.quizcode}
        section={apiQuiz.sectionName}
        quizTitle={`Quiz ${apiQuiz.quizcode}`}
        quizData={dynamicData}
        quizId={apiQuiz.id}
        timeLimitMinutes={apiQuiz.time_limit_minutes ?? null}
        allowRetake={Boolean(apiQuiz.allow_retake)}
        maxAttempts={apiQuiz.max_attempts ?? 2}
      />
    );
  }

  const quizData =
    topic && QUIZ_BY_TOPIC[topic] ? QUIZ_BY_TOPIC[topic] : null;

  if (!topic || !section) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-300 mb-4">
            Please select a quiz and section from the home page, or enter a quiz
            code.
          </p>
          <Link href="/" className="text-cyan-400 hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!quizData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
        <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-amber-400 mb-2">Coming Soon</h2>
          <p className="text-slate-400 mb-6">
            The <strong>{TOPIC_LABELS[topic] || topic}</strong> quiz is not yet
            available.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Quiz
      topic={topic}
      section={section}
      quizTitle={quizData.title}
      quizData={quizData}
    />
  );
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
          <p className="text-slate-400">Loading quiz...</p>
        </div>
      }
    >
      <QuizContent />
    </Suspense>
  );
}
