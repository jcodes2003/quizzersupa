"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const FALLBACK_TOPICS = [
  { id: "hci", label: "Human Computer Interaction" },
  { id: "cp2", label: "Computer Programming 2" },
  { id: "itera", label: "Living in IT Era" },
] as const;

const FALLBACK_SECTIONS = ["01-P", "02-P", "03-P"] as const;

type SubjectFromApi = { id: string; name: string; slug: string };
type SectionFromApi = { id: string; name: string };

export default function HomePage() {
  const [selectedQuiz, setSelectedQuiz] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [quizCode, setQuizCode] = useState("");
  const [subjects, setSubjects] = useState<SubjectFromApi[]>([]);
  const [sections, setSections] = useState<SectionFromApi[]>([]);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const [subRes, secRes] = await Promise.all([
          fetch("/api/subjects"),
          fetch("/api/sections"),
        ]);
        if (subRes.ok) {
          const data = await subRes.json();
          if (Array.isArray(data) && data.length > 0) setSubjects(data);
        }
        if (secRes.ok) {
          const data = await secRes.json();
          if (Array.isArray(data) && data.length > 0) setSections(data);
        }
      } catch {
        // use fallbacks
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const topics = subjects.length > 0
    ? subjects.map((s) => ({ id: s.slug, label: s.name }))
    : FALLBACK_TOPICS.map((t) => ({ id: t.id, label: t.label }));
  const sectionOptions = sections.length > 0
    ? sections.map((s) => s.name)
    : [...FALLBACK_SECTIONS];

  const handleStart = () => {
    if (!selectedQuiz || !selectedSection) return;
    const params = new URLSearchParams({ topic: selectedQuiz, section: selectedSection });
    router.push(`/quiz?${params.toString()}`);
  };

  const sanitizeCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const handleQuizCode = () => {
    const code = sanitizeCode(quizCode.trim());
    if (!code) return;
    router.push(`/quiz?code=${encodeURIComponent(code)}`);
  };

  const canStart = selectedQuiz && selectedSection;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 md:p-10 flex items-center justify-center">
      <div className="max-w-xl w-full">
        <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 shadow-2xl">
          <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Quiz Maker
          </h1>
          <p className="text-center text-slate-400 mb-8">Select your quiz and section to begin</p>

          {loaded && (
            <div className="space-y-6">
              {/* <div>
                <label className="block text-slate-300 font-semibold mb-3">Select Quiz</label>
                <div className="space-y-2">
                  {topics.map((topic) => (
                    <label
                      key={topic.id}
                      className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-colors ${
                        selectedQuiz === topic.id
                          ? "bg-emerald-600/30 border-2 border-emerald-500/50"
                          : "bg-slate-700/50 border-2 border-transparent hover:bg-slate-600/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="quiz"
                        value={topic.id}
                        checked={selectedQuiz === topic.id}
                        onChange={(e) => setSelectedQuiz(e.target.value)}
                        className="sr-only"
                      />
                      <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-slate-400 flex items-center justify-center">
                        {selectedQuiz === topic.id && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                      </span>
                      <span className="text-slate-200 font-medium">{topic.label}</span>
                    </label>
                  ))}
                </div>
              </div> */}

              {/* <div>
                <label className="block text-slate-300 font-semibold mb-3">Section</label>
                <select
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select section...</option>
                  {sectionOptions.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div> */}

              {/* <button
                onClick={handleStart}
                disabled={!canStart}
                className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg transition-colors"
              >
                Start Quiz
              </button> */}

              <div className="border-t border-slate-600 pt-6">
                <label className="block text-slate-300 font-semibold mb-2">Or enter a quiz code</label>
                <p className="text-slate-500 text-sm mb-2">Your teacher gave you a code to access their quiz.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={quizCode}
                    onChange={(e) => setQuizCode(sanitizeCode(e.target.value))}
                    placeholder="e.g. ABC12XYZ"
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleQuizCode}
                    disabled={!quizCode.trim()}
                    className="px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold"
                  >
                    Go
                  </button>
                </div>
              </div>
            </div>
          )}
          {!loaded && <p className="text-slate-400 text-center py-8">Loading...</p>}
        </div>
        <p className="mt-6 text-center text-slate-500 text-sm">
          <Link href="/admin" className="hover:text-amber-400">Admin</Link>
          {" · "}
          <Link href="/teacher" className="hover:text-cyan-400">Teacher</Link>
        </p>
      </div>
    </div>
  );
}
