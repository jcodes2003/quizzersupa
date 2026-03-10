"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";

type QuizResponseRow = {
  id: string;
  quizid?: string;
  quizcode: string;
  period?: string;
  quizname?: string;
  assessment_type?: "quiz" | "exam" | string;
  subjectid: string;
  sectionid: string;
  score: number | null;
  max_score?: number;
  student_id?: string;
  attempt_number?: number;
  studentname: string | null;
  created_at?: string;
  answers?: Record<string, unknown> | null;
  submission_source?: string;
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
  assessment_type?: "quiz" | "exam" | string;
  time_limit_minutes?: number | null;
  allow_retake?: boolean;
  max_attempts?: number | null;
  save_best_only?: boolean;
  submission_deadline?: string | null;
  submissions_open?: boolean;
  source_quiz_id?: string | null;
};

type QuestionRow = {
  id: string;
  quizid: string;
  question: string;
  quiztype: string;
  answerkey?: string | null;
  options?: string | null;
  score?: number | null;
  image_url?: string | null;
};

type QuestionInfo = {
  text: string;
  answerkey: string;
  quiztype: string;
};

type PendingQuizDraft = {
  subjectId: string;
  sectionIds: string[];
  period: string;
  quizname: string;
  assessmentType: "quiz" | "exam";
  timeLimitMinutes: number | null;
  allowRetake: boolean;
  maxAttempts: number;
  saveBestOnly: boolean;
  submissionDeadline: string | null;
  submissionsOpen: boolean;
};

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  try {
    const text = await res.text();
    if (!text) return {};
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function readStringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

type ConsolidatedRow = {
  student_id: string;
  studentname: string;
  section: string;
  subject: string;
  sectionid: string;
  subjectid: string;
  quizzes: Map<string, { score: number; max_score: number; assessment_type: "quiz" | "exam" }>;
};

type NameImportEntry = {
  raw: string;
  studentId?: string;
  name?: string;
};

const SUBJECT_LABELS: Record<string, string> = {
  hci: "Human Computer Interaction",
  cp2: "Computer Programming 2",
  itera: "Living in IT Era",
};

function normalizeAssessmentType(value?: string | null): "quiz" | "exam" {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "exam" || v === "examination" ? "exam" : "quiz";
}

function formatAssessmentTypeLabel(value?: string | null): string {
  return normalizeAssessmentType(value) === "exam" ? "Examination" : "Quiz";
}

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoOrNull(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatDeadlineLabel(value?: string | null): string {
  if (!value) return "No deadline";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "No deadline";
  return d.toLocaleString();
}

function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const flushField = () => {
    row.push(field);
    field = "";
  };
  const flushRow = () => {
    if (row.length > 1 || row[0]?.trim()) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      flushField();
    } else if (c === "\n") {
      flushField();
      flushRow();
    } else if (c === "\r") {
      continue;
    } else {
      field += c;
    }
  }
  flushField();
  flushRow();
  return rows;
}

function normalizeQuizType(value: string): typeof QUESTION_TYPES[number]["value"] | "" {
  const t = value.toLowerCase().trim().replace(/\s+/g, "_");
  if (t === "multiple_choice" || t === "mc" || t === "multiplechoice") return "multiple_choice";
  if (t === "true_false" || t === "truefalse" || t === "tf") return "multiple_choice";
  if (t === "identification" || t === "id") return "identification";
  if (t === "enumeration" || t === "enum") return "enumeration";
  if (t === "long_answer" || t === "longanswer" || t === "essay") return "long_answer";
  return "";
}

function getLastNameForSort(name?: string | null): string {
  const safe = String(name ?? "").trim();
  if (!safe) return "";
  const parts = safe.split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

function formatNameLastFirst(name?: string | null): string {
  const safe = String(name ?? "").trim();
  if (!safe) return "";
  const parts = safe.split(/\s+/);
  if (parts.length === 1) return safe;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return `${last}, ${first}`.trim();
}

function normalizeStudentNameKey(name?: string | null): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeNameLoose(name?: string | null): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNameMatchKeys(name?: string | null): string[] {
  const base = normalizeNameLoose(name);
  if (!base) return [];
  const tokens = base.split(" ").filter(Boolean);
  const withoutInitials = tokens.filter((t) => !/^[a-z]$/.test(t)).join(" ");
  return Array.from(new Set([base, withoutInitials].filter(Boolean)));
}

function getNamePartsForMatch(name?: string | null): { first: string; last: string } {
  const raw = String(name ?? "").trim();
  if (!raw) return { first: "", last: "" };

  const cleaned = raw.replace(/\./g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!cleaned) return { first: "", last: "" };

  if (cleaned.includes(",")) {
    const [lastPart, restPart = ""] = cleaned.split(",", 2);
    const last = lastPart.trim().split(/\s+/).filter(Boolean).join(" ");
    const first = restPart.trim().split(/\s+/).filter(Boolean)[0] ?? "";
    return { first, last };
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first: "", last: "" };
  if (tokens.length === 1) return { first: "", last: tokens[0]! };
  return { first: tokens[0]!, last: tokens[tokens.length - 1]! };
}

function getStudentIdentityKey(row: Pick<QuizResponseRow, "student_id" | "studentname">): string {
  const sid = sanitizeStudentId(row.student_id);
  if (sid) return `id:${sid}`;
  const nameKey = normalizeStudentNameKey(row.studentname);
  if (nameKey) return `name:${nameKey}`;
  return "";
}

function parseNameImportText(text: string): NameImportEntry[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = parseCsv(trimmed);
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => normalizeNameLoose(h));
  const hasHeader =
    header.includes("name") ||
    header.includes("student name") ||
    header.includes("full name") ||
    header.includes("student_id") ||
    header.includes("student id") ||
    header.includes("id");

  const nameHeaderIdx = header.findIndex((h) => ["name", "student name", "full name"].includes(h));
  const idHeaderIdx = header.findIndex((h) => ["student_id", "student id", "id"].includes(h));
  if (!hasHeader) {
    if (rows.every((r) => r.length <= 1)) {
      return lines.map((line) => ({ raw: line, name: line }));
    }
    if (rows.every((r) => r.length === 2)) {
      const idFirstHits = rows.filter((r) => sanitizeStudentId(r[0]).length > 0 && /[a-z]/i.test(String(r[1] ?? ""))).length;
      if (idFirstHits >= Math.ceil(rows.length / 2)) {
        const entries: NameImportEntry[] = [];
        for (const r of rows) {
          const sid = sanitizeStudentId(String(r[0] ?? ""));
          const name = String(r[1] ?? "").trim();
          const raw = name || sid;
          if (!raw) continue;
          entries.push({ raw, studentId: sid || undefined, name: name || undefined });
        }
        return entries;
      }
      const entries: NameImportEntry[] = [];
      for (const r of rows) {
        const joined = r.map((c) => String(c ?? "").trim()).filter(Boolean).join(", ");
        if (!joined) continue;
        entries.push({ raw: joined, name: joined });
      }
      return entries;
    }
    const entries: NameImportEntry[] = [];
    for (const r of rows) {
      const joined = r.map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
      if (!joined) continue;
      entries.push({ raw: joined, name: joined });
    }
    return entries;
  }

  const dataRows = rows.slice(1);
  const entries: NameImportEntry[] = [];
  for (const r of dataRows) {
    const first = String(r[0] ?? "").trim();
    const fromNameCol = nameHeaderIdx >= 0 ? String(r[nameHeaderIdx] ?? "").trim() : "";
    const fromIdCol = idHeaderIdx >= 0 ? sanitizeStudentId(String(r[idHeaderIdx] ?? "")) : "";
    const name = fromNameCol || first;
    const raw = fromNameCol || fromIdCol || first;
    if (!raw) continue;
    entries.push({
      raw,
      studentId: fromIdCol || undefined,
      name: name || undefined,
    });
  }
  return entries;
}

function sanitizeStudentId(value?: string | null): string {
  return String(value ?? "").replace(/[^A-Za-z0-9]/g, "");
}

function formatSubmissionSource(source?: string | null): string {
  const v = String(source ?? "").trim().toLowerCase();
  if (v === "auto_tab_switch") return "Auto: Tab/window changed";
  if (v === "auto_close_tab") return "Auto: Closed tab/browser";
  if (v === "auto_time_expired") return "Auto: Time expired";
  return "Manual submit";
}

function downloadCsv(rows: QuizResponseRow[]) {
  const headers = ["Quiz Code", "Student Name", "Student ID", "Score", "Max Score", "Attempt #", "Submission", "Section", "Subject", "Created"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(r.quizcode),
        escapeCsvCell(formatNameLastFirst(r.studentname)),
        escapeCsvCell(r.student_id ?? ""),
        escapeCsvCell(r.score ?? ""),
        escapeCsvCell(r.max_score ?? ""),
        escapeCsvCell(r.attempt_number ?? ""),
        escapeCsvCell(formatSubmissionSource(r.submission_source)),
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
        escapeCsvCell(formatNameLastFirst(r.studentname)),
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

function calculateWeightedGrade(
  row: ConsolidatedRow,
  quizColumns: { quizid: string; quizcode: string; quizname: string; assessment_type: "quiz" | "exam" }[]
): { quizAverage: number; examAverage: number; finalGrade: number } {
  let quizSum = 0;
  let quizCount = 0;
  let examSum = 0;
  let examCount = 0;

  for (const col of quizColumns) {
    const q = row.quizzes.get(col.quizid);
    if (!q || !q.max_score || q.max_score <= 0) continue;
    const percent = (q.score / q.max_score) * 100;
    if (normalizeAssessmentType(q.assessment_type) === "exam") {
      examSum += percent;
      examCount++;
    } else {
      quizSum += percent;
      quizCount++;
    }
  }

  const quizAverage = quizCount > 0 ? quizSum / quizCount : 0;
  const examAverage = examCount > 0 ? examSum / examCount : 0;
  const finalGrade = quizAverage * 0.6 + examAverage * 0.4;
  return { quizAverage, examAverage, finalGrade };
}

function downloadConsolidatedReportCsv(
  rows: ConsolidatedRow[],
  quizColumns: { quizid: string; quizcode: string; quizname: string; assessment_type: "quiz" | "exam" }[],
  filenamePrefix = "student-report-consolidated",
  mergeSameQuizNameColumns = false,
  splitScoreAndPercentageColumns = false
) {
  const exportColumns = mergeSameQuizNameColumns
    ? Array.from(
        new Map(
          quizColumns.map((q) => [
            (q.quizname || q.quizcode).trim().toLowerCase(),
            {
              title: (q.quizname || q.quizcode).trim() || q.quizcode,
              quizIds: quizColumns
                .filter(
                  (x) => (x.quizname || x.quizcode).trim().toLowerCase() === (q.quizname || q.quizcode).trim().toLowerCase()
                )
                .map((x) => x.quizid),
            },
          ])
        ).values()
      )
    : quizColumns.map((q) => ({
        title: q.quizname || q.quizcode,
        quizIds: [q.quizid],
      }));

  const quizHeaders = splitScoreAndPercentageColumns
    ? exportColumns.flatMap((c) => [
        escapeCsvCell(`${c.title} Score`),
        escapeCsvCell(`${c.title} Percentage`),
      ])
    : exportColumns.map((c) => escapeCsvCell(c.title));
  const headers = [
    "Student ID",
    "Student Name",
    "Section",
    "Subject",
    ...quizHeaders,
    "Quiz Avg %",
    "Exam Avg %",
    "Final Grade %",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((row) => {
      const weighted = calculateWeightedGrade(row, quizColumns);
      const quizCells = exportColumns.flatMap((col) => {
        let best: { score: number; max_score: number; assessment_type: "quiz" | "exam" } | undefined;
        for (const qid of col.quizIds) {
          const qq = row.quizzes.get(qid);
          if (!qq) continue;
          if (!best || qq.score > best.score) best = qq;
        }
        if (!best) {
          return splitScoreAndPercentageColumns
            ? [escapeCsvCell("0"), escapeCsvCell("0.00")]
            : [escapeCsvCell("0")];
        }
        if (best.max_score && best.max_score > 0) {
          const pct = ((best.score / best.max_score) * 100).toFixed(2);
          return splitScoreAndPercentageColumns
            ? [escapeCsvCell(String(best.score)), escapeCsvCell(pct)]
            : [escapeCsvCell(`${best.score} (${pct})`)];
        }
        return splitScoreAndPercentageColumns
          ? [escapeCsvCell(String(best.score)), escapeCsvCell("0.00")]
          : [escapeCsvCell(String(best.score))];
      });
      return [
        escapeCsvCell(row.student_id),
        escapeCsvCell(formatNameLastFirst(row.studentname)),
        escapeCsvCell(row.section),
        escapeCsvCell(row.subject),
        ...quizCells,
        escapeCsvCell(weighted.quizAverage.toFixed(2)),
        escapeCsvCell(weighted.examAverage.toFixed(2)),
        escapeCsvCell(weighted.finalGrade.toFixed(2)),
      ].join(",");
    }),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
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

function normalizeBooleanToken(s: string): "t" | "f" | "" {
  const n = normalizeForEnum(s);
  if (n === "t" || n === "true") return "t";
  if (n === "f" || n === "false") return "f";
  return "";
}

function checkEnumerationMatch(userItems: string[], correctItems: string[]): number {
  const correctBool = correctItems.map(normalizeBooleanToken);
  const userBool = userItems.map(normalizeBooleanToken);
  const isBooleanSequence =
    correctItems.length > 0 &&
    correctBool.every((v) => v !== "") &&
    userBool.every((v) => v !== "");
  if (isBooleanSequence) {
    const len = Math.min(userBool.length, correctBool.length);
    let matched = 0;
    for (let i = 0; i < len; i++) {
      if (userBool[i] === correctBool[i]) matched++;
    }
    return matched;
  }

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

function buildAnswerMap(items: Array<{ questionId: string; answer: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    if (!item?.questionId) continue;
    map.set(item.questionId, String(item.answer ?? ""));
  }
  return map;
}

function buildQuestionItems(
  questionMap: Record<string, QuestionInfo>,
  quiztype: string,
  answers: Map<string, string>
): Array<{ questionId: string; answer: string }> {
  return Object.entries(questionMap)
    .filter(([, info]) => info.quiztype === quiztype)
    .map(([questionId]) => ({
      questionId,
      answer: answers.get(questionId) ?? "",
    }));
}

const QUESTION_TYPES = [
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "identification", label: "Identification" },
  { value: "enumeration", label: "Enumeration" },
  { value: "long_answer", label: "Long Answer" },
] as const;

const QUIZ_FORM_DRAFT_KEY = "quiz_form_draft_v1";

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
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [recheckMessage, setRecheckMessage] = useState<string | null>(null);
  const [recheckError, setRecheckError] = useState<string | null>(null);
  const [recheckSubject, setRecheckSubject] = useState<string>("");
  const [recheckSection, setRecheckSection] = useState<string>("");
  const [filterSubject, setFilterSubject] = useState<string>("");
  const [filterSection, setFilterSection] = useState<string>("");
  const [filterQuizName, setFilterQuizName] = useState<string>("");
  const [responsesViewMode, setResponsesViewMode] = useState<"all" | "best">("all");
  const [responsesNameSort, setResponsesNameSort] = useState<"latest" | "az" | "za">("latest");
  const [responsesSearch, setResponsesSearch] = useState("");
  const [reportFilterSection, setReportFilterSection] = useState<string>("");
  const [reportFilterSubject, setReportFilterSubject] = useState<string>("");
  const [reportFilterDate, setReportFilterDate] = useState<string>("");
  const [reportFilterPeriod, setReportFilterPeriod] = useState<string>("");
  const [nameImportEntries, setNameImportEntries] = useState<NameImportEntry[]>([]);
  const [nameImportFileName, setNameImportFileName] = useState("");
  const [nameImportError, setNameImportError] = useState("");
  const [tab, setTab] = useState<"responses" | "questions" | "reports" | "recheck">("responses");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [questionsForQuiz, setQuestionsForQuiz] = useState<QuestionRow[]>([]);
  const [orderedQuestions, setOrderedQuestions] = useState<QuestionRow[]>([]);
  const [quizzesLoading, setQuizzesLoading] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [showCreateQuiz, setShowCreateQuiz] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [pendingQuizDraft, setPendingQuizDraft] = useState<PendingQuizDraft | null>(null);
  const [quizFormDraftAvailable, setQuizFormDraftAvailable] = useState(false);
  const [newQuizSubjectId, setNewQuizSubjectId] = useState("");
  const [newQuizSectionIds, setNewQuizSectionIds] = useState<string[]>([]);
  const [newQuizPeriod, setNewQuizPeriod] = useState("");
  const [newQuizQuizName, setNewQuizQuizName] = useState("");
  const [newQuizAssessmentType, setNewQuizAssessmentType] = useState<"quiz" | "exam">("quiz");
  const [newQuizTimeLimit, setNewQuizTimeLimit] = useState("");
  const [newQuizAllowRetake, setNewQuizAllowRetake] = useState(false);
  const [newQuizMaxAttempts, setNewQuizMaxAttempts] = useState("1");
  const [newQuizSaveBestOnly, setNewQuizSaveBestOnly] = useState(true);
  const [newQuizSubmissionDeadline, setNewQuizSubmissionDeadline] = useState("");
  const [newQuizSubmissionsOpen, setNewQuizSubmissionsOpen] = useState(true);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [editQuizSubjectId, setEditQuizSubjectId] = useState("");
  const [editQuizSectionId, setEditQuizSectionId] = useState("");
  const [editQuizPeriod, setEditQuizPeriod] = useState("");
  const [editQuizName, setEditQuizName] = useState("");
  const [editQuizAssessmentType, setEditQuizAssessmentType] = useState<"quiz" | "exam">("quiz");
  const [editQuizCode, setEditQuizCode] = useState("");
  const [editQuizTimeLimit, setEditQuizTimeLimit] = useState("");
  const [editQuizAllowRetake, setEditQuizAllowRetake] = useState(false);
  const [editQuizMaxAttempts, setEditQuizMaxAttempts] = useState("1");
  const [editQuizSaveBestOnly, setEditQuizSaveBestOnly] = useState(true);
  const [editQuizSubmissionDeadline, setEditQuizSubmissionDeadline] = useState("");
  const [editQuizSubmissionsOpen, setEditQuizSubmissionsOpen] = useState(true);
  const [reuseSectionIds, setReuseSectionIds] = useState<string[]>([]);
  const [reusePeriod, setReusePeriod] = useState("");
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuizType, setNewQuizType] = useState<typeof QUESTION_TYPES[number]["value"]>("multiple_choice");
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>(["", ""]);
  const [newQuestionAnswerKey, setNewQuestionAnswerKey] = useState("");
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [newQuestionScore, setNewQuestionScore] = useState<string>("1");
  const [newQuestionImageUrl, setNewQuestionImageUrl] = useState<string>("");
  const [newQuestionImageUploading, setNewQuestionImageUploading] = useState(false);
  const [newQuestionImageError, setNewQuestionImageError] = useState<string>("");
  const [enumScoreMode, setEnumScoreMode] = useState<"fixed" | "per_item">("fixed");
  const [importStatus, setImportStatus] = useState<string>("");
  const [batchQuestions, setBatchQuestions] = useState<Array<{
    question: string;
    quizType: typeof QUESTION_TYPES[number]["value"];
    options?: string[];
    answerkey?: string;
    score: number;
    imageUrl?: string;
  }>>([]);
  const [responsesPage, setResponsesPage] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [quizzesPage, setQuizzesPage] = useState(1);
  const [navOpen, setNavOpen] = useState(false);
  const [answerModal, setAnswerModal] = useState<QuizResponseRow | null>(null);
  const [copiedQuizCode, setCopiedQuizCode] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [answerQuestions, setAnswerQuestions] = useState<Record<string, QuestionInfo>>({});
  const [answersLoading, setAnswersLoading] = useState(false);
  const [questionTypeFilter, setQuestionTypeFilter] = useState<
    "all" | "multiple_choice" | "identification" | "enumeration" | "long_answer"
  >("all");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionText, setEditQuestionText] = useState("");
  const [editAnswerKey, setEditAnswerKey] = useState("");
  const [editScore, setEditScore] = useState<string>("1");
  const [editQuestionType, setEditQuestionType] = useState<QuestionRow["quiztype"] | "">("");
  const [editEnumScoreMode, setEditEnumScoreMode] = useState<"fixed" | "per_item">("fixed");
  const [editQuestionOptions, setEditQuestionOptions] = useState<string[]>([]);
  const [editQuestionImageUrl, setEditQuestionImageUrl] = useState<string>("");
  const [editQuestionImageUploading, setEditQuestionImageUploading] = useState(false);
  const [editQuestionImageError, setEditQuestionImageError] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const dragQuestionIdRef = useRef<string | null>(null);
  const PAGE_SIZE = 10;
  const QUIZ_PAGE_SIZE = 6;

  const saveQuizFormDraft = () => {
    if (typeof window === "undefined") return;
    const draft = {
      subjectId: newQuizSubjectId,
      sectionIds: newQuizSectionIds,
      period: newQuizPeriod,
      quizname: newQuizQuizName,
      assessmentType: newQuizAssessmentType,
      timeLimit: newQuizTimeLimit,
      allowRetake: newQuizAllowRetake,
      maxAttempts: newQuizMaxAttempts,
      saveBestOnly: newQuizSaveBestOnly,
      submissionDeadline: newQuizSubmissionDeadline,
      submissionsOpen: newQuizSubmissionsOpen,
    };
    const hasContent = Boolean(
      (draft.subjectId && draft.subjectId.trim()) ||
      (draft.quizname && draft.quizname.trim()) ||
      (draft.period && draft.period.trim()) ||
      (draft.timeLimit && draft.timeLimit.trim()) ||
      (Array.isArray(draft.sectionIds) && draft.sectionIds.length > 0)
    );
    try {
      if (!hasContent) {
        localStorage.removeItem(QUIZ_FORM_DRAFT_KEY);
        setQuizFormDraftAvailable(false);
        return;
      }
      localStorage.setItem(QUIZ_FORM_DRAFT_KEY, JSON.stringify(draft));
      setQuizFormDraftAvailable(true);
    } catch {
      // ignore storage errors
    }
  };

  const clearQuizFormDraft = () => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(QUIZ_FORM_DRAFT_KEY);
    } catch {
      // ignore storage errors
    }
    setQuizFormDraftAvailable(false);
  };

  const openDraftQuizForm = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(QUIZ_FORM_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        subjectId?: string;
        sectionIds?: string[];
        period?: string;
        quizname?: string;
        assessmentType?: string;
        timeLimit?: string;
        allowRetake?: boolean;
        maxAttempts?: string;
        saveBestOnly?: boolean;
        submissionDeadline?: string;
        submissionsOpen?: boolean;
      };
      setNewQuizSubjectId(draft.subjectId ?? "");
      setNewQuizSectionIds(Array.isArray(draft.sectionIds) ? draft.sectionIds : []);
      setNewQuizPeriod(draft.period ?? "");
      setNewQuizQuizName(draft.quizname ?? "");
      setNewQuizAssessmentType(normalizeAssessmentType(draft.assessmentType));
      setNewQuizTimeLimit(draft.timeLimit ?? "");
      setNewQuizAllowRetake(Boolean(draft.allowRetake));
      setNewQuizMaxAttempts(draft.maxAttempts ?? "1");
      setNewQuizSaveBestOnly(draft.saveBestOnly !== false);
      setNewQuizSubmissionDeadline(draft.submissionDeadline ?? "");
      setNewQuizSubmissionsOpen(draft.submissionsOpen !== false);
      setShowCreateQuiz(true);
    } catch {
      // ignore storage errors
    }
  };
  const batchCounts = batchQuestions.reduce(
    (acc, q) => {
      if (q.quizType === "multiple_choice") acc.mc++;
      else if (q.quizType === "identification") acc.id++;
      else if (q.quizType === "enumeration") acc.en++;
      return acc;
    },
    { mc: 0, id: 0, en: 0 }
  );
  const questionTypeCounts = questionsForQuiz.reduce(
    (acc, q) => {
      if (q.quiztype === "multiple_choice") acc.mc++;
      else if (q.quiztype === "identification") acc.id++;
      else if (q.quiztype === "enumeration") acc.en++;
      else if (q.quiztype === "long_answer") acc.la++;
      return acc;
    },
    { mc: 0, id: 0, en: 0, la: 0 }
  );
  const totalQuestionCount =
    questionTypeCounts.mc + questionTypeCounts.id + questionTypeCounts.en + questionTypeCounts.la;
  const filteredQuestions = orderedQuestions.filter((q) =>
    questionTypeFilter === "all" ? true : q.quiztype === questionTypeFilter
  );
  const typeOrder = new Map<string, number>(QUESTION_TYPES.map((t, i) => [t.value, i]));
  const displayQuestions = [...filteredQuestions].sort((a, b) => {
    const ta = typeOrder.get(a.quiztype) ?? 99;
    const tb = typeOrder.get(b.quiztype) ?? 99;
    if (ta !== tb) return ta - tb;
    const ia = orderedQuestions.findIndex((q) => q.id === a.id);
    const ib = orderedQuestions.findIndex((q) => q.id === b.id);
    return ia - ib;
  });
  const renderQuestionsPanel = () => (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h3 className="text-lg font-semibold text-slate-200">Questions in this quiz</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2 rounded-xl bg-slate-800/80 border border-slate-600/60 p-1">
            <button
              type="button"
              onClick={() => setQuestionTypeFilter("all")}
              className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg ${
                questionTypeFilter === "all" ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setQuestionTypeFilter("multiple_choice")}
              className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg ${
                questionTypeFilter === "multiple_choice" ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              Multiple Choice
            </button>
            <button
              type="button"
              onClick={() => setQuestionTypeFilter("identification")}
              className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg ${
                questionTypeFilter === "identification" ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              Identification
            </button>
            <button
              type="button"
              onClick={() => setQuestionTypeFilter("enumeration")}
              className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg ${
                questionTypeFilter === "enumeration" ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              Enumeration
            </button>
            <button
              type="button"
              onClick={() => setQuestionTypeFilter("long_answer")}
              className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg ${
                questionTypeFilter === "long_answer" ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              Long Answer
            </button>
          </div>
          <button
            onClick={handleDeleteAllQuestions}
            disabled={questionsForQuiz.length === 0}
            className="px-4 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white font-semibold"
          >
            Delete All
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
        <span className="px-2 py-1 rounded-full bg-slate-800/80 border border-slate-600/60 text-slate-300">
          Total: <span className="text-slate-100 font-semibold">{totalQuestionCount}</span>
        </span>
        <span className="px-2 py-1 rounded-full bg-slate-800/80 border border-slate-600/60 text-slate-300">
          Multiple Choice: <span className="text-slate-100 font-semibold">{questionTypeCounts.mc}</span>
        </span>
        <span className="px-2 py-1 rounded-full bg-slate-800/80 border border-slate-600/60 text-slate-300">
          Identification: <span className="text-slate-100 font-semibold">{questionTypeCounts.id}</span>
        </span>
        <span className="px-2 py-1 rounded-full bg-slate-800/80 border border-slate-600/60 text-slate-300">
          Enumeration: <span className="text-slate-100 font-semibold">{questionTypeCounts.en}</span>
        </span>
        <span className="px-2 py-1 rounded-full bg-slate-800/80 border border-slate-600/60 text-slate-300">
          Long Answer: <span className="text-slate-100 font-semibold">{questionTypeCounts.la}</span>
        </span>
      </div>
      {questionsLoading ? (
        <p className="text-slate-400 py-4">Loading questions...</p>
      ) : questionsForQuiz.length === 0 ? (
        <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 text-center text-slate-400">
          No questions in this quiz yet. Click &quot;Add Questions&quot; above.
        </div>
      ) : (
        <ul className="space-y-3">
          {displayQuestions.flatMap((q, idx) => {
            const prev = displayQuestions[idx - 1];
            const showHeader = !prev || prev.quiztype !== q.quiztype;
            const label = QUESTION_TYPES.find((t) => t.value === q.quiztype)?.label ?? q.quiztype;
            let optionsParsed: string[] = [];
            try {
              if (q.options) optionsParsed = JSON.parse(q.options);
            } catch {
              // ignore
            }
            const header = showHeader ? (
              <li
                key={`${q.quiztype}-header`}
                className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-600/50 text-slate-200 text-sm font-semibold"
              >
                {label}
              </li>
            ) : null;
            const item = (
              <li
                key={q.id}
                draggable
                onDragStart={() => handleDragStart(q.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(q.id)}
                className="p-3 rounded-lg bg-slate-700/50 border border-slate-600/60 cursor-move"
              >
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
                          disabled={q.quiztype === "enumeration" && editEnumScoreMode === "per_item"}
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
                          {editQuestionOptions.map((opt, i) => (
                            <option key={`edit-answer-${i}-${opt}`} value={opt}>
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
                    <div>
                      <label className="block text-slate-400 text-xs mb-1">Question Image (optional)</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file && selectedQuizId) {
                              uploadQuestionImage(
                                file,
                                selectedQuizId,
                                setEditQuestionImageUrl,
                                setEditQuestionImageUploading,
                                setEditQuestionImageError
                              );
                            }
                          }}
                          disabled={editQuestionImageUploading || !selectedQuizId}
                          className="text-slate-300 text-xs"
                        />
                        {editQuestionImageUploading && (
                          <span className="text-xs text-slate-400">Uploading...</span>
                        )}
                        {editQuestionImageUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              deleteQuestionImage(
                                editQuestionImageUrl,
                                setEditQuestionImageUrl,
                                setEditQuestionImageUploading,
                                setEditQuestionImageError
                              )
                            }
                            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200"
                          >
                            Remove Image
                          </button>
                        )}
                      </div>
                      {editQuestionImageError && (
                        <div className="text-xs text-red-400 mt-1">{editQuestionImageError}</div>
                      )}
                      {editQuestionImageUrl && (
                        <div className="mt-2">
                          <img
                            src={editQuestionImageUrl}
                            alt="Question preview"
                            className="w-full max-h-56 object-contain rounded-lg border border-slate-600/60 bg-slate-900/40"
                          />
                        </div>
                      )}
                    </div>
                    {q.quiztype === "enumeration" && (
                      <div>
                        <label className="block text-slate-400 text-xs mb-1">Enumeration scoring</label>
                        <select
                          value={editEnumScoreMode}
                          onChange={(e) => {
                            const mode = e.target.value as "fixed" | "per_item";
                            setEditEnumScoreMode(mode);
                            if (mode === "per_item") {
                              const count = parseEnumerationAnswerKey(editAnswerKey).length;
                              setEditScore(String(count));
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                          <option value="fixed">Fixed score for the whole question</option>
                          <option value="per_item">1 point per correct item (auto total)</option>
                        </select>
                      </div>
                    )}
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
                          if (q.quiztype === "enumeration" && editEnumScoreMode === "per_item") {
                            const count = parseEnumerationAnswerKey(trimmedAnswer).length;
                            if (count <= 0) {
                              setError("Enumeration needs at least 1 answer item.");
                              return;
                            }
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
                                imageUrl: editQuestionImageUrl.trim() ? editQuestionImageUrl.trim() : null,
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
                      {q.image_url && (
                        <div className="mb-2">
                          <img
                            src={q.image_url}
                            alt="Question illustration"
                            className="w-full max-h-40 object-contain rounded-lg border border-slate-600/60 bg-slate-900/40"
                          />
                        </div>
                      )}
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
                          <span className="text-emerald-400 whitespace-pre-line">{q.answerkey}</span>
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
                          setEditQuestionType(q.quiztype);
                          setEditQuestionImageUrl(q.image_url ?? "");
                          setEditQuestionImageError("");
                          if (q.quiztype === "enumeration") {
                            const itemCount = parseEnumerationAnswerKey(q.answerkey ?? "").length;
                            const scoreNum = Number(q.score ?? 1);
                            const mode = itemCount > 0 && scoreNum === itemCount ? "per_item" : "fixed";
                            setEditEnumScoreMode(mode);
                          } else {
                            setEditEnumScoreMode("fixed");
                          }
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
            return header ? [header, item] : [item];
          })}
        </ul>
      )}
    </>
  );
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

  const handleRecheckSubject = useCallback(async () => {
    if (!recheckSubject || !recheckSection) {
      setRecheckError("Select a subject and section first.");
      setRecheckMessage(null);
      return;
    }
    const subjectLabel = subjects.find((s) => s.id === recheckSubject)?.name || "this subject";
    const sectionLabel = sections.find((s) => s.id === recheckSection)?.name || "this section";
    const ok = confirm(
      `Recheck all attempts for ${subjectLabel} (${sectionLabel})? This will update scores based on current answer keys.`
    );
    if (!ok) return;
    setRecheckLoading(true);
    setRecheckError(null);
    setRecheckMessage(null);
    try {
      const res = await fetch("/api/teacher/recheck-subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subjectId: recheckSubject, sectionId: recheckSection }),
      });
      if (res.status === 401) {
        setAuthenticated(false);
        setRecheckError("Session expired. Please log in again.");
        return;
      }
      const data = await readJsonSafe(res);
      if (!res.ok) {
        setRecheckError(readStringField(data, "error") ?? "Failed to recheck.");
        return;
      }
      setRecheckMessage(
        `Recheck complete: ${data.updatedAttempts ?? 0}/${data.totalAttempts ?? 0} attempts updated.`
      );
      await fetchScores();
    } catch {
      setRecheckError("Failed to recheck.");
    } finally {
      setRecheckLoading(false);
    }
  }, [recheckSubject, recheckSection, fetchScores, subjects, sections]);

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
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(QUIZ_FORM_DRAFT_KEY);
      if (!raw) {
        setQuizFormDraftAvailable(false);
        return;
      }
      const draft = JSON.parse(raw) as {
        subjectId?: string;
        sectionIds?: string[];
        period?: string;
        quizname?: string;
        assessmentType?: string;
        timeLimit?: string;
      };
      const hasContent = Boolean(
        (draft.subjectId && draft.subjectId.trim()) ||
        (draft.quizname && draft.quizname.trim()) ||
        (draft.period && draft.period.trim()) ||
        (draft.timeLimit && draft.timeLimit.trim()) ||
        (Array.isArray(draft.sectionIds) && draft.sectionIds.length > 0)
      );
      setQuizFormDraftAvailable(hasContent);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (selectedQuizId) fetchQuestionsForQuiz(selectedQuizId);
    else setQuestionsForQuiz([]);
  }, [selectedQuizId, fetchQuestionsForQuiz]);

  useEffect(() => {
    setOrderedQuestions(questionsForQuiz);
  }, [questionsForQuiz]);

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
    if (newQuizType !== "enumeration" || enumScoreMode !== "per_item") return;
    const count = parseEnumerationAnswerKey(newQuestionAnswerKey).length;
    setNewQuestionScore(String(count));
  }, [newQuizType, enumScoreMode, newQuestionAnswerKey]);

  useEffect(() => {
    if (editQuestionType !== "enumeration" || editEnumScoreMode !== "per_item") return;
    const count = parseEnumerationAnswerKey(editAnswerKey).length;
    setEditScore(String(count));
  }, [editQuestionType, editEnumScoreMode, editAnswerKey]);

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
    setRecheckMessage(null);
    setRecheckError(null);
  }, [filterSubject, filterSection, filterQuizName, responsesNameSort]);

  useEffect(() => {
    setRecheckMessage(null);
    setRecheckError(null);
  }, [recheckSubject, recheckSection]);

  useEffect(() => {
    if (!recheckSubject) {
      setRecheckSection("");
    }
  }, [recheckSubject]);

  useEffect(() => {
    setReportsPage(1);
  }, [reportFilterSection, reportFilterSubject, reportFilterDate, reportFilterPeriod]);

  useEffect(() => {
    setQuizzesPage(1);
  }, [quizzes.length]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopyQuizCode = async (code: string) => {
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
      setCopiedQuizCode(value);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedQuizCode(null), 1500);
    } catch {
      // Ignore clipboard errors.
    }
  };

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
    if (!newQuizSubjectId || newQuizSectionIds.length === 0) {
      setError("Select a subject and at least one section.");
      return;
    }
    setSavingQuiz(true);
    setError("");
    try {
      const timeLimitMinutes = newQuizTimeLimit.trim()
        ? Number(newQuizTimeLimit.trim())
        : null;
      const maxAttempts = newQuizAllowRetake
        ? Math.max(2, Number(newQuizMaxAttempts) || 2)
        : 1;
      const submissionDeadline = toIsoOrNull(newQuizSubmissionDeadline);
      const draft: PendingQuizDraft = {
        subjectId: newQuizSubjectId,
        sectionIds: [...newQuizSectionIds],
        period: newQuizPeriod.trim(),
        quizname: newQuizQuizName.trim(),
        assessmentType: newQuizAssessmentType,
        timeLimitMinutes: Number.isFinite(timeLimitMinutes) ? timeLimitMinutes : null,
        allowRetake: newQuizAllowRetake,
        maxAttempts,
        saveBestOnly: newQuizSaveBestOnly,
        submissionDeadline,
        submissionsOpen: newQuizSubmissionsOpen,
      };
      setPendingQuizDraft(draft);
      setSelectedQuizId(null);
      setQuestionsForQuiz([]);
      setOrderedQuestions([]);
      setBatchQuestions([]);
      setShowAddQuestion(true);
      setTab("questions");
      clearQuizFormDraft();
      setShowCreateQuiz(false);
      setNewQuizSubjectId("");
      setNewQuizSectionIds([]);
      setNewQuizPeriod("");
      setNewQuizQuizName("");
      setNewQuizAssessmentType("quiz");
      setNewQuizTimeLimit("");
      setNewQuizAllowRetake(false);
      setNewQuizMaxAttempts("1");
      setNewQuizSaveBestOnly(true);
      setNewQuizSubmissionDeadline("");
      setNewQuizSubmissionsOpen(true);
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
    setEditQuizAssessmentType(normalizeAssessmentType(quiz.assessment_type));
    setEditQuizCode(quiz.quizcode ?? "");
    setEditQuizTimeLimit(
      quiz.time_limit_minutes != null ? String(quiz.time_limit_minutes) : ""
    );
    setEditQuizAllowRetake(Boolean(quiz.allow_retake));
    setEditQuizMaxAttempts(String(quiz.max_attempts ?? 1));
    setEditQuizSaveBestOnly(quiz.save_best_only !== false);
    setEditQuizSubmissionDeadline(toDateTimeLocalValue(quiz.submission_deadline));
    setEditQuizSubmissionsOpen(quiz.submissions_open !== false);
    setReuseSectionIds(quiz.sectionid ? [quiz.sectionid] : []);
    setReusePeriod(quiz.period ?? "");
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
      const submissionDeadline = toIsoOrNull(editQuizSubmissionDeadline);
      const res = await fetch(`/api/teacher/quizzes/${editingQuizId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subjectId: editQuizSubjectId,
          sectionId: editQuizSectionId,
          period: editQuizPeriod,
          quizname: editQuizName,
          assessmentType: editQuizAssessmentType,
          quizcode: editQuizCode,
          timeLimitMinutes: Number.isFinite(timeLimitMinutes) ? timeLimitMinutes : null,
          allowRetake: editQuizAllowRetake,
          maxAttempts,
          saveBestOnly: editQuizSaveBestOnly,
          submissionDeadline,
          submissionsOpen: editQuizSubmissionsOpen,
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

  const handleReuseQuiz = async (action: "duplicate" | "assign") => {
    if (!editingQuizId) return;
    if (reuseSectionIds.length === 0) {
      setError("Select at least one target section.");
      return;
    }
    if (action === "duplicate" && reuseSectionIds.length !== 1) {
      setError("Select exactly one section for duplicate.");
      return;
    }
    setError("");
    try {
      const targets = action === "assign" ? reuseSectionIds : [reuseSectionIds[0]];
      const failures: Array<{ sectionId: string; message: string }> = [];
      for (const sectionId of targets) {
        const res = await fetch(`/api/teacher/quizzes/${editingQuizId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action,
            sectionId,
            period: reusePeriod,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          const sectionName = sections.find((s) => s.id === sectionId)?.name ?? sectionId;
          failures.push({ sectionId, message: d.error ?? res.statusText ?? "Failed to reuse quiz" });
          console.warn("[reuse-quiz] failed", { action, sectionId, sectionName, error: d.error, status: res.status });
        }
      }
      if (failures.length > 0) {
        const summary = failures
          .map((f) => `${sections.find((s) => s.id === f.sectionId)?.name ?? f.sectionId}: ${f.message}`)
          .join(" | ");
        setError(`Failed to reuse quiz for: ${summary}`);
        return;
      }
      await fetchQuizzes();
    } catch {
      setError("Failed to reuse quiz");
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (!confirm("Delete this quiz? This will also remove its questions and attempts. Proceed?")) return;
    setError("");
    try {
      const res = await fetch(`/api/teacher/quizzes/${quizId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to delete quiz");
        return;
      }
      if (selectedQuizId === quizId) setSelectedQuizId(null);
      await fetchQuizzes();
    } catch {
      setError("Failed to delete quiz");
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
      if (newQuizType === "enumeration" && enumScoreMode === "per_item") {
        const count = parseEnumerationAnswerKey(newQuestionAnswerKey).length;
        if (count <= 0) {
          setError("Enumeration needs at least 1 answer item.");
          return;
        }
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
    if (newQuestionImageUrl.trim()) {
      questionToAdd.imageUrl = newQuestionImageUrl.trim();
    }
    
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
    setNewQuestionImageUrl("");
    setNewQuestionImageError("");
    setEnumScoreMode("fixed");
    setNewQuizType("multiple_choice");
  };

  const uploadQuestionImage = async (
    file: File,
    quizId: string,
    setUrl: (v: string) => void,
    setUploading: (v: boolean) => void,
    setUploadError: (v: string) => void
  ) => {
    setUploadError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("quizId", quizId);
      const res = await fetch("/api/teacher/quiz-images", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data.error ?? "Failed to upload image");
        return;
      }
      if (data.url) setUrl(String(data.url));
    } catch {
      setUploadError("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const deleteQuestionImage = async (
    url: string,
    setUrl: (v: string) => void,
    setUploading: (v: boolean) => void,
    setUploadError: (v: string) => void
  ) => {
    const value = String(url ?? "").trim();
    if (!value) return;
    setUploadError("");
    setUploading(true);
    try {
      const res = await fetch("/api/teacher/quiz-images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data.error ?? "Failed to delete image");
        return;
      }
      setUrl("");
    } catch {
      setUploadError("Failed to delete image");
    } finally {
      setUploading(false);
    }
  };

  const handleImportCsv = async (file: File | null) => {
    if (!file) return;
    if (!selectedQuizId && !pendingQuizDraft) {
      setError("Select a quiz first before importing.");
      return;
    }
    setImportStatus("");
    setError("");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setError("CSV is empty.");
        return;
      }
      const headerRow = rows[0].map((h) => h.trim().toLowerCase());
      const hasHeader = headerRow.includes("quiztype") || headerRow.includes("type");
      const dataRows = hasHeader ? rows.slice(1) : rows;
      const colIndex = (name: string) => headerRow.indexOf(name);
      const optionIndexes = headerRow
        .map((h, i) => ({ h, i }))
        .filter((x) => x.h === "options")
        .map((x) => x.i);
      const optionColOrder = ["option1", "option2", "option3", "option4", "optiona", "optionb", "optionc", "optiond"];
      const optionColIndexes = optionColOrder
        .map((name) => headerRow.indexOf(name))
        .filter((ix) => ix >= 0);

      const parsed: typeof batchQuestions = [];
      const errors: string[] = [];
      dataRows.forEach((r, idx) => {
        try {
          const get = (ix: number) => (ix >= 0 ? (r[ix] ?? "") : "");
          const typeRaw = hasHeader
            ? get(colIndex("quiztype") >= 0 ? colIndex("quiztype") : colIndex("type"))
            : r[0] ?? "";
          const quizType = normalizeQuizType(typeRaw);
          const question = hasHeader ? get(colIndex("question")) : r[1] ?? "";
          const answerkey = hasHeader
            ? get(
                colIndex("answerkey") >= 0
                  ? colIndex("answerkey")
                  : colIndex("correct_index/answer") >= 0
                    ? colIndex("correct_index/answer")
                    : colIndex("answer")
              )
            : r[2] ?? "";
          const optionsRaw = hasHeader ? get(colIndex("options")) : r[3] ?? "";
          const scoreRaw = hasHeader ? get(colIndex("score")) : r[4] ?? "";

          if (!quizType) throw new Error(`Unknown quiz type: "${typeRaw}"`);
          if (!String(question).trim()) throw new Error("Question text is required.");
          if (quizType !== "multiple_choice" && !String(answerkey).trim()) {
            throw new Error("Answer key is required for this question type.");
          }

          let scoreNumber = Number(scoreRaw);
          if (!Number.isFinite(scoreNumber) || scoreNumber <= 0) scoreNumber = 1;

          const item: typeof batchQuestions[0] = {
            question: String(question).trim(),
            quizType,
            score: scoreNumber,
          };

          if (quizType === "multiple_choice") {
          let opts = hasHeader && optionColIndexes.length > 0
            ? optionColIndexes.map((i) => get(i)).map((o) => String(o).trim()).filter(Boolean)
            : hasHeader && optionIndexes.length > 0
              ? optionIndexes.map((i) => get(i)).map((o) => String(o).trim()).filter(Boolean)
              : String(optionsRaw)
                  .split("|")
                  .map((o) => o.trim())
                  .filter(Boolean);
            if (opts.length === 0 && typeRaw.toLowerCase().includes("true")) {
              opts = ["TRUE", "FALSE"];
            }
            if (opts.length < 2) throw new Error("Multiple choice needs at least 2 options.");
            const answerRaw = String(answerkey).trim();
            let answer = answerRaw;
            const indexNum = Number(answerRaw);
            if (Number.isFinite(indexNum)) {
              if (indexNum === 0 && opts.length > 0) {
                answer = opts[0] ?? "";
              } else if (indexNum >= 1 && indexNum <= opts.length) {
                answer = opts[indexNum - 1] ?? "";
              } else if (indexNum >= 0 && indexNum < opts.length) {
                answer = opts[indexNum] ?? "";
              }
            }
            if (!answer || !opts.includes(answer)) {
              const match = opts.find((o) => o.toLowerCase() === answer.toLowerCase());
              if (match) answer = match;
            }
            if (!answer || !opts.includes(answer)) {
              throw new Error(`Multiple choice answer must match one of the options or be a valid index. (answer="${answerRaw}", options="${opts.join(" | ")}")`);
            }
            item.options = opts;
            item.answerkey = answer;
          } else if (quizType === "enumeration") {
            item.answerkey = String(answerkey)
              .split(/\|/g)
              .map((a) => a.trim())
              .filter(Boolean)
              .join("\n");
          } else {
            item.answerkey = String(answerkey).trim();
          }

          parsed.push(item);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          errors.push(`Row ${idx + 1}: ${message}`);
        }
      });

      if (parsed.length === 0) {
        setError(errors.length > 0 ? errors.slice(0, 5).join(" | ") : "No valid rows found in CSV.");
        return;
      }
      if (errors.length > 0) {
        setError(errors.slice(0, 5).join(" | "));
        return;
      }

      setBatchQuestions((prev) => [...prev, ...parsed]);
      setImportStatus(`Imported ${parsed.length} question${parsed.length !== 1 ? "s" : ""} from CSV.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import CSV.");
    }
  };

  const handleSaveAllQuestions = async () => {
    if (batchQuestions.length === 0) return;
    setSavingQuestion(true);
    setError("");
    try {
      let quizId = selectedQuizId;
      if (!quizId) {
        if (!pendingQuizDraft) {
          setError("Select a quiz first.");
          return;
        }
        const primarySectionId = pendingQuizDraft.sectionIds[0];
        const createRes = await fetch("/api/teacher/quizzes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
              body: JSON.stringify({
                subjectId: pendingQuizDraft.subjectId,
                sectionId: primarySectionId,
                period: pendingQuizDraft.period,
                quizname: pendingQuizDraft.quizname,
                assessmentType: pendingQuizDraft.assessmentType,
                timeLimitMinutes: pendingQuizDraft.timeLimitMinutes,
                allowRetake: pendingQuizDraft.allowRetake,
                maxAttempts: pendingQuizDraft.maxAttempts,
                saveBestOnly: pendingQuizDraft.saveBestOnly,
                submissionDeadline: pendingQuizDraft.submissionDeadline,
                submissionsOpen: pendingQuizDraft.submissionsOpen,
              }),
        });
        const created = await readJsonSafe(createRes);
        if (!createRes.ok || !created?.id) {
          setError(readStringField(created, "error") ?? "Failed to create quiz");
          return;
        }
        quizId = String(created.id);
        if (pendingQuizDraft.sectionIds.length > 1) {
          const failures: Array<{ sectionId: string; message: string }> = [];
          for (const sectionId of pendingQuizDraft.sectionIds.slice(1)) {
            const aRes = await fetch(`/api/teacher/quizzes/${quizId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                action: "assign",
                sectionId,
                period: pendingQuizDraft.period,
              }),
            });
            if (!aRes.ok) {
              const d = await readJsonSafe(aRes);
              failures.push({
                sectionId,
                message: readStringField(d, "error") ?? aRes.statusText ?? "Failed to assign quiz",
              });
            }
          }
          if (failures.length > 0) {
            const summary = failures
              .map((f) => `${sections.find((s) => s.id === f.sectionId)?.name ?? f.sectionId}: ${f.message}`)
              .join(" | ");
            setError(`Assigned quiz created, but failed for: ${summary}`);
          }
        }
        setPendingQuizDraft(null);
        setSelectedQuizId(quizId);
        await fetchQuizzes();
      }
      const res = await fetch(`/api/teacher/quizzes/${quizId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ questions: batchQuestions }),
      });
      if (!res.ok) {
        const d = await readJsonSafe(res);
        setError(readStringField(d, "error") ?? "Failed to save questions");
        return;
      }
      setBatchQuestions([]);
      if (quizId) fetchQuestionsForQuiz(quizId);
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleDeleteAllQuestions = async () => {
    if (!selectedQuizId) return;
    if (!confirm("Delete ALL questions for this quiz? This cannot be undone.")) return;
    setError("");
    try {
      const res = await fetch(`/api/teacher/quizzes/${selectedQuizId}/questions`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to delete questions");
        return;
      }
      setQuestionsForQuiz([]);
      setBatchQuestions([]);
    } catch {
      setError("Failed to delete questions");
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
      if (newQuizType === "enumeration" && enumScoreMode === "per_item") {
        const count = parseEnumerationAnswerKey(newQuestionAnswerKey).length;
        if (count <= 0) {
          setError("Enumeration needs at least 1 answer item.");
          return;
        }
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
      const body: {
        question: string;
        quizType: string;
        options?: string[];
        answerkey?: string;
        score?: number;
        imageUrl?: string;
      } = {
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
      if (newQuestionImageUrl.trim()) body.imageUrl = newQuestionImageUrl.trim();
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
      setNewQuestionText("");
      setNewQuestionOptions(["", ""]);
      setNewQuestionAnswerKey("");
      setNewQuestionScore("1");
      setNewQuestionImageUrl("");
      setNewQuestionImageError("");
      setEnumScoreMode("fixed");
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

  const handleDragStart = (id: string) => {
    dragQuestionIdRef.current = id;
  };

  const handleDrop = (targetId: string) => {
    const sourceId = dragQuestionIdRef.current;
    dragQuestionIdRef.current = null;
    if (!sourceId || sourceId === targetId) return;
    setOrderedQuestions((prev) => {
      const sourceIndex = prev.findIndex((q) => q.id === sourceId);
      const targetIndex = prev.findIndex((q) => q.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const source = prev[sourceIndex];
      const target = prev[targetIndex];
      if (source.quiztype !== target.quiztype) return prev;
      const next = [...prev];
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
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

  // Get unique quiz names from rows for responses filter (respect current subject/section filters)
  const quizNameOptionsFromRows = Array.from(
    new Map(
      rows
        .filter((r) => {
          if (filterSubject && r.subjectid !== filterSubject) return false;
          if (filterSection && r.sectionid !== filterSection) return false;
          return r.quizname || r.quizcode;
        })
        .map((r) => {
          const label = (r.quizname || r.quizcode || "").trim() || r.quizcode || "";
          return [
            label.toLowerCase(),
            {
              id: label,
              name: label,
            },
          ];
        })
    ).values()
  );

  // Get unique periods from rows for report filter
  const periodOptionsFromRows = Array.from(
    new Set(rows.map((r) => String(r.period ?? "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // Recheck: sections available for selected subject
  const recheckSectionsForSubject = recheckSubject
    ? Array.from(
        new Map(
          rows
            .filter((r) => r.subjectid === recheckSubject && r.sectionid)
            .map((r) => [
              r.sectionid,
              {
                id: r.sectionid,
                name: r.sectionname || r.section || getSectionName(r.sectionid),
              },
            ])
        ).values()
      )
    : [];

  // Best attempt per (student_id, quizid) for responses view
  const bestByStudentQuiz = new Map<string, QuizResponseRow>();
  for (const r of rows) {
    const key = `${r.student_id ?? ""}-${r.quizid ?? r.quizcode}`;
    const existing = bestByStudentQuiz.get(key);
    if (!existing) {
      bestByStudentQuiz.set(key, r);
      continue;
    }
    const scoreA = Number(existing.score ?? -Infinity);
    const scoreB = Number(r.score ?? -Infinity);
    if (scoreB > scoreA) {
      bestByStudentQuiz.set(key, r);
    } else if (scoreB === scoreA) {
      if (r.created_at && existing.created_at && r.created_at > existing.created_at) {
        bestByStudentQuiz.set(key, r);
      }
    }
  }
  const baseResponseRows = responsesViewMode === "best" ? Array.from(bestByStudentQuiz.values()) : rows;

  // Filter for responses tab - filter by subjectid, sectionid, and quizname
  const filteredRows = baseResponseRows.filter((r) => {
    if (filterSubject && r.subjectid !== filterSubject) return false;
    if (filterSection && r.sectionid !== filterSection) return false;
    if (filterQuizName) {
      const label = (r.quizname || r.quizcode || "").trim() || r.quizcode || "";
      if (label.toLowerCase() !== filterQuizName.toLowerCase()) return false;
    }
    return true;
  });

  const searchTerm = responsesSearch.trim().toLowerCase();
  const searchedRows = searchTerm
    ? filteredRows.filter((r) => {
        const name = formatNameLastFirst(r.studentname).toLowerCase();
        const quiz = String(r.quizcode ?? "").toLowerCase();
        const studentId = String(r.student_id ?? "").toLowerCase();
        const section = String(r.sectionname ?? r.section ?? "").toLowerCase();
        const subject = String(r.subjectname ?? r.subject ?? "").toLowerCase();
        return (
          name.includes(searchTerm) ||
          quiz.includes(searchTerm) ||
          studentId.includes(searchTerm) ||
          section.includes(searchTerm) ||
          subject.includes(searchTerm)
        );
      })
    : filteredRows;

  const sortedResponsesRows =
    responsesNameSort === "latest"
      ? searchedRows
      : [...searchedRows].sort((a, b) => {
          const nameA = formatNameLastFirst(a.studentname).toLowerCase();
          const nameB = formatNameLastFirst(b.studentname).toLowerCase();
          const cmp = nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
          return responsesNameSort === "az" ? cmp : -cmp;
        });

  const responsesTotalPages = Math.max(1, Math.ceil(sortedResponsesRows.length / PAGE_SIZE));
  const currentResponsesPage = Math.min(responsesPage, responsesTotalPages);
  const responsesStartIndex = (currentResponsesPage - 1) * PAGE_SIZE;
  const responsesEndIndex = responsesStartIndex + PAGE_SIZE;
  const pagedResponsesRows = sortedResponsesRows.slice(responsesStartIndex, responsesEndIndex);

  const recheckFilteredRows = recheckSubject && recheckSection
    ? rows.filter((r) => r.subjectid === recheckSubject && r.sectionid === recheckSection)
    : [];

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

  // Latest attempt per (student_identity, quizid) for consolidated report
  const latestByStudentQuiz = new Map<string, QuizResponseRow>();
  for (const r of reportFilteredRows) {
    const identityKey = getStudentIdentityKey(r);
    if (!identityKey) continue;
    const key = `${identityKey}-${r.quizid ?? r.quizcode}`;
    const existing = latestByStudentQuiz.get(key);
    if (!existing || (r.created_at && existing.created_at && r.created_at > existing.created_at)) {
      latestByStudentQuiz.set(key, r);
    }
  }
  const latestRows = Array.from(latestByStudentQuiz.values());

  // Consolidated: one row per student; columns = Student ID, Name, Section, Subject, then one column per quiz (score/max or —)
  type QuizColumn = { quizid: string; quizcode: string; quizname: string; assessment_type: "quiz" | "exam" };
  const quizColumns: QuizColumn[] = Array.from(
    new Map(
      latestRows
        .filter((r) => r.quizid || r.quizcode)
        .map((r) => [
          r.quizid ?? r.quizcode,
          {
            quizid: r.quizid ?? r.quizcode,
            quizcode: r.quizcode,
            quizname: (r.quizname ?? r.quizcode).trim() || r.quizcode,
            assessment_type: normalizeAssessmentType(r.assessment_type),
          },
        ])
    ).values()
  );

  const consolidatedByStudent = new Map<string, ConsolidatedRow>();
  for (const r of latestRows) {
    const identityKey = getStudentIdentityKey(r);
    if (!identityKey) continue;
    let row = consolidatedByStudent.get(identityKey);
    if (!row) {
      row = {
        student_id: r.student_id ?? "",
        studentname: r.studentname ?? "",
        section: r.sectionname ?? r.section ?? "",
        subject: r.subjectname ?? r.subject ?? "",
        sectionid: r.sectionid ?? "",
        subjectid: r.subjectid ?? "",
        quizzes: new Map(),
      };
      consolidatedByStudent.set(identityKey, row);
    }
    const qid = r.quizid ?? r.quizcode;
    if (qid && r.score != null) {
      const existingQuizScore = row.quizzes.get(qid);
      if (!existingQuizScore || r.score > existingQuizScore.score) {
        row.quizzes.set(qid, {
          score: r.score,
          max_score: r.max_score ?? 0,
          assessment_type: normalizeAssessmentType(r.assessment_type),
        });
      }
    }
    if (!row.student_id && r.student_id) {
      row.student_id = r.student_id;
    }
  }
  const consolidatedRows = Array.from(consolidatedByStudent.values());
  const sortedConsolidatedRows = [...consolidatedRows].sort((a, b) => {
    const lastA = getLastNameForSort(a.studentname);
    const lastB = getLastNameForSort(b.studentname);
    const lastCmp = lastA.localeCompare(lastB, undefined, { sensitivity: "base" });
    if (lastCmp !== 0) return lastCmp;
    return a.studentname.localeCompare(b.studentname, undefined, { sensitivity: "base" });
  });

  const reportsTotalPages = Math.max(1, Math.ceil(sortedConsolidatedRows.length / PAGE_SIZE));
  const currentReportsPage = Math.min(reportsPage, reportsTotalPages);
  const reportsStartIndex = (currentReportsPage - 1) * PAGE_SIZE;
  const reportsEndIndex = reportsStartIndex + PAGE_SIZE;
  const pagedReportRows = sortedConsolidatedRows.slice(reportsStartIndex, reportsEndIndex);

  const weightedByStudentKey = new Map(
    sortedConsolidatedRows.map((row) => [getStudentIdentityKey(row), calculateWeightedGrade(row, quizColumns)])
  );

  const nameImportMatchResult = useMemo(() => {
    const byStudentId = new Map<string, ConsolidatedRow>();
    const byNameKey = new Map<string, ConsolidatedRow>();
    const byLastName = new Map<string, Array<{ first: string; row: ConsolidatedRow }>>();

    for (const row of sortedConsolidatedRows) {
      const sid = sanitizeStudentId(row.student_id);
      if (sid && !byStudentId.has(sid)) byStudentId.set(sid, row);

      const parts = getNamePartsForMatch(row.studentname);
      if (parts.last) {
        const list = byLastName.get(parts.last) ?? [];
        list.push({ first: parts.first, row });
        byLastName.set(parts.last, list);
      }

      const aliases = new Set<string>([
        ...buildNameMatchKeys(row.studentname),
        ...buildNameMatchKeys(formatNameLastFirst(row.studentname)),
      ]);
      for (const alias of aliases) {
        if (!byNameKey.has(alias)) byNameKey.set(alias, row);
      }
    }

    const matchedRows: ConsolidatedRow[] = [];
    const exportRows: ConsolidatedRow[] = [];
    const unmatchedEntries: NameImportEntry[] = [];
    const seen = new Set<string>();
    let matchedEntriesCount = 0;

    for (const entry of nameImportEntries) {
      let matched: ConsolidatedRow | undefined;
      const sid = sanitizeStudentId(entry.studentId ?? "");
      if (sid) {
        matched = byStudentId.get(sid);
      }

      if (!matched && entry.name) {
        const inputParts = getNamePartsForMatch(entry.name);
        if (inputParts.last) {
          const candidates = byLastName.get(inputParts.last) ?? [];
          if (candidates.length === 1) {
            matched = candidates[0]!.row;
          } else if (candidates.length > 1 && inputParts.first) {
            const firstFiltered = candidates.filter((c) => c.first === inputParts.first);
            if (firstFiltered.length === 1) {
              matched = firstFiltered[0]!.row;
            }
          }
        }
      }

      if (!matched && entry.name) {
        for (const key of buildNameMatchKeys(entry.name)) {
          matched = byNameKey.get(key);
          if (matched) break;
        }
      }

      if (!matched) {
        unmatchedEntries.push(entry);
        exportRows.push({
          student_id: sid,
          studentname: entry.name || entry.raw || "",
          section: "",
          subject: "",
          sectionid: "",
          subjectid: "",
          quizzes: new Map(),
        });
        continue;
      }
      matchedEntriesCount++;
      exportRows.push(matched);

      const identity = getStudentIdentityKey({ student_id: matched.student_id, studentname: matched.studentname });
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      matchedRows.push(matched);
    }

    return { matchedRows, unmatchedEntries, exportRows, matchedEntriesCount };
  }, [nameImportEntries, sortedConsolidatedRows]);

  const handleNameImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNameImportError("");
    try {
      const text = await file.text();
      const parsed = parseNameImportText(text);
      if (parsed.length === 0) {
        setNameImportEntries([]);
        setNameImportFileName(file.name);
        setNameImportError("No valid names found in the uploaded file.");
      } else {
        setNameImportEntries(parsed);
        setNameImportFileName(file.name);
      }
    } catch {
      setNameImportEntries([]);
      setNameImportFileName(file.name);
      setNameImportError("Failed to read uploaded file.");
    } finally {
      e.target.value = "";
    }
  };

  // Subject options for reports: all subjects by default, narrowed when a section is selected.
  const reportSubjectOptions = Array.from(
    new Map(
      rows
        .filter((r) => r.subjectid && (!reportFilterSection || r.sectionid === reportFilterSection))
        .map((r) => [
          r.subjectid,
          {
            id: r.subjectid,
            name: r.subjectname || r.subject || getSubjectName(r.subjectid),
          },
        ])
    ).values()
  );

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
                onClick={() => setTab("recheck")}
                className={`px-4 py-2 rounded-xl font-medium ${tab === "recheck" ? "bg-cyan-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
              >
                Recheck
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
                setTab("recheck");
                setNavOpen(false);
              }}
              className={`w-full px-4 py-2 rounded-xl text-left font-medium ${
                tab === "recheck"
                  ? "bg-cyan-600 text-white"
                  : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
            >
              Recheck
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
              <select
                value={filterSection}
                onChange={(e) => setFilterSection(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">All sections</option>
                {sectionOptionsFromRows.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                value={filterQuizName}
                onChange={(e) => setFilterQuizName(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">All quizzes</option>
                {quizNameOptionsFromRows.map((q) => (
                  <option key={q.id} value={q.name}>{q.name}</option>
                ))}
              </select>
              <select
                value={responsesViewMode}
                onChange={(e) => {
                  setResponsesViewMode(e.target.value as "all" | "best");
                  setResponsesPage(1);
                }}
                className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">All attempts</option>
                <option value="best">Best attempt per student</option>
              </select>
              <select
                value={responsesNameSort}
                onChange={(e) => setResponsesNameSort(e.target.value as "latest" | "az" | "za")}
                className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="latest">Sort: Latest</option>
                <option value="az">Sort: Name A-Z</option>
                <option value="za">Sort: Name Z-A</option>
              </select>
              <input
                type="text"
                value={responsesSearch}
                onChange={(e) => {
                  setResponsesSearch(e.target.value);
                  setResponsesPage(1);
                }}
                placeholder="Search student, quiz, ID, section..."
                className="min-w-[220px] px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
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
            ) : sortedResponsesRows.length === 0 ? (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-12 text-center text-slate-400">
                <p>No responses matching the selected filter.</p>
                <p className="text-sm mt-2">
                  Total records: {rows.length} | Filter:{" "}
                  {[
                    filterSubject ? `Subject: ${getSubjectLabelFromRows(filterSubject)}` : "",
                    filterSection ? `Section: ${getSectionLabelFromRows(filterSection)}` : "",
                    filterQuizName ? `Quiz: ${filterQuizName}` : "",
                  ]
                    .filter(Boolean)
                    .join(" | ") || "None"}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[640px] text-left">
                    <thead>
                      <tr className="border-b border-slate-600 bg-slate-700/50">
                        <th className="px-4 py-3 text-slate-300 font-semibold">Student ID</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Student Name</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Score</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Attempt</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Submission</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Section</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Subject</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Answers</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedResponsesRows.map((r) => (
                        <tr key={r.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="px-4 py-3 text-slate-200">{sanitizeStudentId(r.student_id) || "?"}</td>
                          <td className="px-4 py-3 text-slate-200">{formatNameLastFirst(r.studentname) || "?"}</td>
                          <td className="px-4 py-3 text-emerald-400 font-medium">{r.score ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-300">{r.attempt_number ?? "-"}</td>
                          <td className="px-4 py-3 text-slate-300">{formatSubmissionSource(r.submission_source)}</td>
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

            {sortedResponsesRows.length > 0 && (
              <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm text-slate-400">
                <p>
                  Showing{" "}
                  {sortedResponsesRows.length === 0
                    ? "0"
                    : `${responsesStartIndex + 1}-${Math.min(responsesEndIndex, sortedResponsesRows.length)}`}{" "}
                  of {sortedResponsesRows.length} responses
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

        {tab === "recheck" && (
          <>
            <h2 className="text-xl font-semibold text-cyan-300 mb-6">Recheck Scores</h2>
            <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={recheckSubject}
                  onChange={(e) => setRecheckSubject(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select subject...</option>
                  {subjectOptionsFromRows.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select
                  value={recheckSection}
                  onChange={(e) => setRecheckSection(e.target.value)}
                  disabled={!recheckSubject}
                  className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select section...</option>
                  {(recheckSubject ? recheckSectionsForSubject : sectionOptionsFromRows).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleRecheckSubject}
                  disabled={recheckLoading || !recheckSubject || !recheckSection}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold"
                >
                  {recheckLoading ? "Rechecking..." : "Recheck Now"}
                </button>
              </div>
              {(recheckMessage || recheckError) && (
                <div className="mt-3 text-sm">
                  {recheckMessage && <p className="text-emerald-400">{recheckMessage}</p>}
                  {recheckError && <p className="text-red-400">{recheckError}</p>}
                </div>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Recheck uses current answer keys and updates stored scores for the selected subject and section.
              </p>
              {subjectOptionsFromRows.length === 0 || sectionOptionsFromRows.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  No subjects or sections available yet. Load responses first so filters can populate.
                </p>
              ) : null}
              {recheckSubject && recheckSection && (
                <div className="mt-6 rounded-2xl bg-slate-900/40 border border-slate-700/60 overflow-hidden">
                  <div className="overflow-x-auto w-full">
                    <table className="w-full min-w-[640px] text-left">
                      <thead>
                        <tr className="border-b border-slate-700 bg-slate-800/60">
                          <th className="px-4 py-3 text-slate-300 font-semibold">Student ID</th>
                          <th className="px-4 py-3 text-slate-300 font-semibold">Student Name</th>
                          <th className="px-4 py-3 text-slate-300 font-semibold">Score</th>
                          <th className="px-4 py-3 text-slate-300 font-semibold">Attempt</th>
                          <th className="px-4 py-3 text-slate-300 font-semibold">Quiz</th>
                          <th className="px-4 py-3 text-slate-300 font-semibold">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recheckFilteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-slate-500 text-center">
                              No attempts found for this subject and section.
                            </td>
                          </tr>
                        ) : (
                          recheckFilteredRows.map((r) => (
                            <tr key={r.id} className="border-b border-slate-800/60">
                              <td className="px-4 py-3 text-slate-200">{sanitizeStudentId(r.student_id) || "?"}</td>
                              <td className="px-4 py-3 text-slate-200">{formatNameLastFirst(r.studentname) || "?"}</td>
                              <td className="px-4 py-3 text-emerald-400 font-medium">{r.score ?? "—"}</td>
                              <td className="px-4 py-3 text-slate-300">{r.attempt_number ?? "-"}</td>
                              <td className="px-4 py-3 text-slate-300">{r.quizname || r.quizcode}</td>
                              <td className="px-4 py-3 text-slate-400 text-sm">
                                {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
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
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">All subjects</option>
                  {reportSubjectOptions.map((s) => (
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

            <div className="rounded-xl border border-slate-600/50 bg-slate-800/40 p-4 mb-6">
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Upload Student Name List (.txt or .csv)
              </label>
              <input
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                onChange={handleNameImportFile}
                className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:text-white hover:file:bg-cyan-500"
              />
              <p className="text-xs text-slate-400 mt-2">
                Supported formats: one name per line, or CSV with columns like <span className="font-mono">name</span> and optional <span className="font-mono">student_id</span>.
              </p>
              {nameImportError && <p className="text-xs text-red-300 mt-2">{nameImportError}</p>}
              {nameImportEntries.length > 0 && (
                <div className="mt-2 text-xs text-slate-300">
                  Loaded <span className="font-semibold text-cyan-300">{nameImportEntries.length}</span> entries
                  {nameImportFileName ? <> from <span className="text-slate-200">{nameImportFileName}</span></> : null}. Matched{" "}
                  <span className="font-semibold text-emerald-300">{nameImportMatchResult.matchedEntriesCount}</span>, not found{" "}
                  <span className="font-semibold text-amber-300">{nameImportMatchResult.unmatchedEntries.length}</span>.
                </div>
              )}
            </div>

            {/* Export and Refresh Buttons */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <button
                onClick={() => downloadConsolidatedReportCsv(sortedConsolidatedRows, quizColumns)}
                disabled={sortedConsolidatedRows.length === 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
              >
                Export to CSV
              </button>
              <button
                onClick={() =>
                  downloadConsolidatedReportCsv(
                    nameImportMatchResult.exportRows,
                    quizColumns,
                    "student-report-selected-names",
                    true,
                    true
                  )
                }
                disabled={nameImportEntries.length === 0}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold"
              >
                Export Uploaded Names CSV
              </button>
              <button
                onClick={() => {
                  setNameImportEntries([]);
                  setNameImportFileName("");
                  setNameImportError("");
                }}
                disabled={nameImportEntries.length === 0}
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-semibold"
              >
                Clear Uploaded List
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
            ) : sortedConsolidatedRows.length === 0 ? (
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
                            <span className="ml-2 inline-flex rounded-full border border-slate-500/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                              {formatAssessmentTypeLabel(q.assessment_type)}
                            </span>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-slate-300 font-semibold whitespace-nowrap">Quiz Avg %</th>
                        <th className="px-4 py-3 text-slate-300 font-semibold whitespace-nowrap">Exam Avg %</th>
                        <th className="px-4 py-3 text-cyan-200 font-semibold whitespace-nowrap">Final Grade %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedReportRows.map((r) => (
                        <tr key={getStudentIdentityKey(r)} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="px-4 py-3 text-slate-200 font-mono">{r.student_id}</td>
                          <td className="px-4 py-3 text-slate-200">{formatNameLastFirst(r.studentname) || "—"}</td>
                          <td className="px-4 py-3 text-slate-300">{r.section || "—"}</td>
                          <td className="px-4 py-3 text-slate-300">{r.subject || "—"}</td>
                          {quizColumns.map((q) => {
                            const qq = r.quizzes.get(q.quizid);
                            const cell = qq
                              ? qq.max_score
                                ? `${qq.score}/${qq.max_score} (${Math.round((qq.score / qq.max_score) * 100)}%)`
                                : String(qq.score)
                              : "—";
                            return (
                              <td key={q.quizid} className="px-4 py-3 text-emerald-400 font-medium">
                                {cell}
                              </td>
                            );
                          })}
                          {(() => {
                            const weighted = weightedByStudentKey.get(getStudentIdentityKey(r)) ?? {
                              quizAverage: 0,
                              examAverage: 0,
                              finalGrade: 0,
                            };
                            return (
                              <>
                                <td className="px-4 py-3 text-cyan-200 font-medium">{weighted.quizAverage.toFixed(2)}%</td>
                                <td className="px-4 py-3 text-amber-200 font-medium">{weighted.examAverage.toFixed(2)}%</td>
                                <td className="px-4 py-3 text-emerald-300 font-bold">{weighted.finalGrade.toFixed(2)}%</td>
                              </>
                            );
                          })()}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-4 text-slate-500 text-sm">
              <p>One row per student. Total students: {sortedConsolidatedRows.length}</p>
              <p className="mt-1">Weighted grade formula: (Quiz Average x 60%) + (Exam Average x 40%).</p>
              {reportFilterPeriod && <p className="mt-1">Period: {reportFilterPeriod}</p>}
              {reportFilterSection && (
                <p className="mt-1">Section: {getSectionLabelFromRows(reportFilterSection)}</p>
              )}
              {reportFilterSubject && (
                <p className="mt-1">Subject: {getSubjectLabelFromRows(reportFilterSubject)}</p>
              )}
              {reportFilterDate && <p className="mt-1">Date: {reportFilterDate}</p>}
            </div>

            {sortedConsolidatedRows.length > 0 && (
              <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm text-slate-400">
                <p>
                  Showing{" "}
                  {sortedConsolidatedRows.length === 0
                    ? "0"
                    : `${reportsStartIndex + 1}-${Math.min(reportsEndIndex, sortedConsolidatedRows.length)}`}{" "}
                  of {sortedConsolidatedRows.length} students
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
              <div className="flex items-center gap-2">
                {!showAddQuestion && (
                  <button
                    onClick={() => setShowAddQuestion(true)}
                    disabled={!(selectedQuizId || pendingQuizDraft)}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold"
                  >
                    Add Questions
                  </button>
                )}
                {quizFormDraftAvailable && !showCreateQuiz && (
                  <button
                    onClick={openDraftQuizForm}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                  >
                    Resume Draft
                  </button>
                )}
                <button
                  onClick={() => setShowCreateQuiz(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  Create Quiz
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/50 text-red-200 text-sm">
                {error}
              </div>
            )}

            {showAddQuestion && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="w-full max-w-4xl max-h-[90vh] overflow-auto rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-cyan-300 font-semibold">Add Questions (Batch Mode)</h4>
                  <div className="flex items-center gap-3">
                    {batchQuestions.length > 0 && (
                      <span className="text-slate-400 text-sm">
                        {batchQuestions.length} question{batchQuestions.length !== 1 ? "s" : ""} ready to save
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddQuestion(false);
                        setNewQuestionText("");
                        setNewQuestionOptions(["", ""]);
                        setNewQuestionAnswerKey("");
                        setNewQuestionScore("1");
                        setEnumScoreMode("fixed");
                      }}
                      className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="mb-4 p-4 rounded-lg bg-slate-700/40 border border-slate-600/50">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-slate-300 text-sm font-medium">Import CSV</label>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => handleImportCsv(e.target.files?.[0] ?? null)}
                      className="text-slate-300 text-sm"
                    />
                    {importStatus && <span className="text-emerald-300 text-sm">{importStatus}</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    CSV columns: <span className="font-mono">quiztype,question,answerkey,options,score</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Use <span className="font-mono">|</span> to separate options and enumeration items.
                    Example: <span className="font-mono">multiple_choice,1+1,2,1|2|3|4,1</span>
                  </p>
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
                            {q.imageUrl && (
                              <span className="text-emerald-300 ml-2">[Image]</span>
                            )}
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
                    <label className="block text-slate-400 text-sm mb-1">Question Image (optional)</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && selectedQuizId) {
                            uploadQuestionImage(
                              file,
                              selectedQuizId,
                              setNewQuestionImageUrl,
                              setNewQuestionImageUploading,
                              setNewQuestionImageError
                            );
                          }
                        }}
                        disabled={newQuestionImageUploading || !selectedQuizId}
                        className="text-slate-300 text-sm"
                      />
                      {newQuestionImageUploading && (
                        <span className="text-xs text-slate-400">Uploading...</span>
                      )}
                      {newQuestionImageUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            deleteQuestionImage(
                              newQuestionImageUrl,
                              setNewQuestionImageUrl,
                              setNewQuestionImageUploading,
                              setNewQuestionImageError
                            )
                          }
                          className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200"
                        >
                          Remove Image
                        </button>
                      )}
                    </div>
                    {newQuestionImageError && (
                      <div className="text-xs text-red-400 mt-1">{newQuestionImageError}</div>
                    )}
                    {newQuestionImageUrl && (
                      <div className="mt-2">
                        <img
                          src={newQuestionImageUrl}
                          alt="Question preview"
                          className="w-full max-h-56 object-contain rounded-lg border border-slate-600/60 bg-slate-900/40"
                        />
                      </div>
                    )}
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
                        setNewQuestionAnswerKey("");
                        if (nextType !== "enumeration") {
                          setEnumScoreMode("fixed");
                          setNewQuestionScore("1");
                        }
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
                                    <div key={`new-opt-${i}`} className="flex gap-2">
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
                                  {newQuestionOptions.filter((o) => o.trim()).map((o, i) => (
                                    <option key={`new-answer-${i}-${o}`} value={o.trim()}>{o.trim()}</option>
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
                  {newQuizType === "enumeration" && (
                    <div>
                      <label className="block text-slate-400 text-sm mb-1">Enumeration scoring</label>
                      <select
                        value={enumScoreMode}
                        onChange={(e) => {
                          const mode = e.target.value as "fixed" | "per_item";
                          setEnumScoreMode(mode);
                          if (mode === "per_item") {
                            const count = parseEnumerationAnswerKey(newQuestionAnswerKey).length;
                            setNewQuestionScore(String(count));
                          } else {
                            setNewQuestionScore("1");
                          }
                        }}
                        className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value="fixed">Fixed score for the whole question</option>
                        <option value="per_item">1 point per correct item (auto total)</option>
                      </select>
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
                      disabled={newQuizType === "enumeration" && enumScoreMode === "per_item"}
                      className="w-32 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {newQuizType === "enumeration" && enumScoreMode === "per_item"
                        ? "Score is calculated from the number of items in the answer key."
                        : "Default is 1 point per question."}
                    </p>
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
                        setEnumScoreMode("fixed");
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
              </div>
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
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-400 text-sm">Sections</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setNewQuizSectionIds(sections.map((s) => s.id))}
                          className="px-2 py-1 rounded bg-slate-700/70 hover:bg-slate-600 text-xs text-slate-200"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewQuizSectionIds([])}
                          className="px-2 py-1 rounded bg-slate-700/70 hover:bg-slate-600 text-xs text-slate-200"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="max-h-48 overflow-auto rounded-xl border border-slate-600/60 bg-slate-900/40 p-3">
                      {sections.length === 0 && (
                        <div className="text-slate-500 text-xs">No sections yet ? add in Admin</div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sections.map((s) => (
                          <label key={s.id} className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-slate-200 text-xs border border-slate-700/60 hover:border-cyan-500/60">
                            <input
                              type="checkbox"
                              checked={newQuizSectionIds.includes(s.id)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setNewQuizSectionIds((prev) =>
                                  checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                                );
                              }}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                            />
                            <span className="truncate">{s.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Selected: {newQuizSectionIds.length}
                    </div>
                    {showCreateQuiz && sections.length === 0 && (
                      <button type="button" onClick={() => fetchSections()} className="mt-2 text-sm text-cyan-400 hover:underline">
                        Refresh sections
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-slate-400 text-sm mb-1">Period</label>
                    <select
                      value={newQuizPeriod}
                      onChange={(e) => setNewQuizPeriod(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">Select period...</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
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
                    <label className="block text-slate-400 text-sm mb-1">Assessment Type</label>
                    <select
                      value={newQuizAssessmentType}
                      onChange={(e) => setNewQuizAssessmentType(normalizeAssessmentType(e.target.value))}
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="quiz">Quiz</option>
                      <option value="exam">Examination</option>
                    </select>
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
                  <div>
                    <label className="block text-slate-400 text-sm mb-1">Submission Deadline</label>
                    <input
                      type="datetime-local"
                      value={newQuizSubmissionDeadline}
                      onChange={(e) => setNewQuizSubmissionDeadline(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <p className="text-slate-500 text-xs mt-1">Leave blank for no deadline.</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-slate-300 text-sm">Accept submissions</span>
                    <button
                      type="button"
                      aria-pressed={newQuizSubmissionsOpen}
                      onClick={() => setNewQuizSubmissionsOpen((v) => !v)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                        newQuizSubmissionsOpen
                          ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-300"
                          : "bg-slate-700/70 border-slate-500/60 text-slate-300"
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${newQuizSubmissionsOpen ? "bg-emerald-300" : "bg-slate-400"}`} />
                      {newQuizSubmissionsOpen ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-slate-300 text-sm">Allow retake attempts</span>
                    <button
                      type="button"
                      aria-pressed={newQuizAllowRetake}
                      onClick={() => setNewQuizAllowRetake((v) => !v)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                        newQuizAllowRetake
                          ? "bg-cyan-500/20 border-cyan-400/60 text-cyan-300"
                          : "bg-slate-700/70 border-slate-500/60 text-slate-300"
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${newQuizAllowRetake ? "bg-cyan-300" : "bg-slate-400"}`} />
                      {newQuizAllowRetake ? "On" : "Off"}
                    </button>
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
                  <div className="flex items-center gap-3">
                    <input
                      id="save-best-only"
                      type="checkbox"
                      checked={newQuizSaveBestOnly}
                      onChange={(e) => setNewQuizSaveBestOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                    />
                    <label htmlFor="save-best-only" className="text-slate-300 text-sm">
                      Save only the highest score per student
                    </label>
                  </div>
                  <p className="text-slate-500 text-xs">
                    When unchecked, the latest attempt score overwrites the stored score. All attempts are still logged.
                  </p>
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
                      onClick={() => {
                        saveQuizFormDraft();
                        setShowCreateQuiz(false);
                      }}
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
            ) : quizzes.length === 0 && !pendingQuizDraft ? (
              <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-12 text-center text-slate-400">
                No quizzes yet. Create a quiz, then add questions to it.
              </div>
            ) : (
              <div className="space-y-6">
                {pendingQuizDraft && (
                  <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 text-amber-200 text-sm">
                    Draft quiz in progress. If you closed the modal, click &quot;Add Questions&quot; to continue creating questions. Click &quot;Save All&quot; to create and assign this quiz to all selected sections.
                  </div>
                )}
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
                              <>
                                <strong>{quiz.quizname}</strong> {quiz.period ? `(Period ${quiz.period})` : ""} ·{" "}
                                <span className="text-xs uppercase tracking-wide text-amber-300">
                                  {formatAssessmentTypeLabel(quiz.assessment_type)}
                                </span>{" "}
                                ·{" "}
                                {getSubjectName(quiz.subjectid)} · {getSectionName(quiz.sectionid)} ·{" "}
                                <span
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleCopyQuizCode(quiz.quizcode);
                                  }}
                                  className="font-semibold text-cyan-200 hover:text-cyan-100 cursor-pointer"
                                  title="Click to copy quiz code"
                                >
                                  {quiz.quizcode}
                                </span>
                                {copiedQuizCode === quiz.quizcode && (
                                  <span className="ml-2 text-xs text-emerald-300">Copied!</span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="text-xs uppercase tracking-wide text-amber-300">
                                  {formatAssessmentTypeLabel(quiz.assessment_type)}
                                </span>{" "}
                                ·{" "}
                                {getSubjectName(quiz.subjectid)} · {getSectionName(quiz.sectionid)} ·{" "}
                                <span
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleCopyQuizCode(quiz.quizcode);
                                  }}
                                  className="font-semibold text-cyan-200 hover:text-cyan-100 cursor-pointer"
                                  title="Click to copy quiz code"
                                >
                                  {quiz.quizcode}
                                </span>
                                {copiedQuizCode === quiz.quizcode && (
                                  <span className="ml-2 text-xs text-emerald-300">Copied!</span>
                                )}
                              </>
                            )}
                          </button>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs ${
                              quiz.submissions_open === false
                                ? "bg-rose-500/20 border border-rose-500/40 text-rose-300"
                                : quiz.submission_deadline &&
                                    !Number.isNaN(new Date(quiz.submission_deadline).getTime()) &&
                                    Date.now() > new Date(quiz.submission_deadline).getTime()
                                  ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                                  : "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                            }`}
                            title={`Deadline: ${formatDeadlineLabel(quiz.submission_deadline)}`}
                          >
                            {quiz.submissions_open === false
                              ? "Closed"
                              : quiz.submission_deadline &&
                                  !Number.isNaN(new Date(quiz.submission_deadline).getTime()) &&
                                  Date.now() > new Date(quiz.submission_deadline).getTime()
                                ? "Deadline passed"
                                : "Open"}
                          </span>
                          {quiz.source_quiz_id && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs">
                              Shared
                            </span>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEditQuiz(quiz)}
                              className="px-3 py-1 rounded bg-slate-600 hover:bg-slate-500 text-xs text-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuiz(quiz.id)}
                              className="px-3 py-1 rounded bg-red-600/80 hover:bg-red-600 text-xs text-white"
                            >
                              Delete
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
                                <select
                                  value={editQuizPeriod}
                                  onChange={(e) => setEditQuizPeriod(e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                >
                                  <option value="">Select period...</option>
                                  <option value="1">1</option>
                                  <option value="2">2</option>
                                  <option value="3">3</option>
                                  <option value="4">4</option>
                                </select>
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
                                <label className="block text-slate-400 text-xs mb-1">Assessment Type</label>
                                <select
                                  value={editQuizAssessmentType}
                                  onChange={(e) => setEditQuizAssessmentType(normalizeAssessmentType(e.target.value))}
                                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                                >
                                  <option value="quiz">Quiz</option>
                                  <option value="exam">Examination</option>
                                </select>
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
                              <div>
                                <label className="block text-slate-400 text-xs mb-1">Submission Deadline</label>
                                <input
                                  type="datetime-local"
                                  value={editQuizSubmissionDeadline}
                                  onChange={(e) => setEditQuizSubmissionDeadline(e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                                />
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="text-slate-300 text-xs">Accept submissions</span>
                                <button
                                  type="button"
                                  aria-pressed={editQuizSubmissionsOpen}
                                  onClick={() => setEditQuizSubmissionsOpen((v) => !v)}
                                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                                    editQuizSubmissionsOpen
                                      ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-300"
                                      : "bg-slate-700/70 border-slate-500/60 text-slate-300"
                                  }`}
                                >
                                  <span className={`h-2.5 w-2.5 rounded-full ${editQuizSubmissionsOpen ? "bg-emerald-300" : "bg-slate-400"}`} />
                                  {editQuizSubmissionsOpen ? "On" : "Off"}
                                </button>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="text-slate-300 text-xs">Allow retake attempts</span>
                                <button
                                  type="button"
                                  aria-pressed={editQuizAllowRetake}
                                  onClick={() => setEditQuizAllowRetake((v) => !v)}
                                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                                    editQuizAllowRetake
                                      ? "bg-cyan-500/20 border-cyan-400/60 text-cyan-300"
                                      : "bg-slate-700/70 border-slate-500/60 text-slate-300"
                                  }`}
                                >
                                  <span className={`h-2.5 w-2.5 rounded-full ${editQuizAllowRetake ? "bg-cyan-300" : "bg-slate-400"}`} />
                                  {editQuizAllowRetake ? "On" : "Off"}
                                </button>
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
                              <div className="flex items-center gap-3">
                                <input
                                  id="edit-save-best-only-inline"
                                  type="checkbox"
                                  checked={editQuizSaveBestOnly}
                                  onChange={(e) => setEditQuizSaveBestOnly(e.target.checked)}
                                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                                />
                                <label htmlFor="edit-save-best-only-inline" className="text-slate-300 text-xs">
                                  Save only the highest score per student
                                </label>
                              </div>
                              <p className="text-slate-500 text-xs">
                                When unchecked, the latest attempt score overwrites the stored score.
                              </p>
                              <div className="rounded-lg border border-slate-600/60 bg-slate-800/60 p-3">
                                <div className="text-xs text-slate-400 mb-2">Reuse quiz</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <label className="block text-slate-400 text-xs">Target Sections</label>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setReuseSectionIds(sections.map((s) => s.id))}
                                          className="px-2 py-1 rounded bg-slate-700/70 hover:bg-slate-600 text-xs text-slate-200"
                                        >
                                          Select All
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setReuseSectionIds([])}
                                          className="px-2 py-1 rounded bg-slate-700/70 hover:bg-slate-600 text-xs text-slate-200"
                                        >
                                          Clear
                                        </button>
                                      </div>
                                    </div>
                                    <div className="max-h-40 overflow-auto rounded-xl border border-slate-600/60 bg-slate-900/40 p-3">
                                      {sections.length === 0 && (
                                        <div className="text-slate-500 text-xs">No sections available.</div>
                                      )}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {sections.map((s) => (
                                          <label key={s.id} className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-slate-200 text-xs border border-slate-700/60 hover:border-cyan-500/60">
                                            <input
                                              type="checkbox"
                                              checked={reuseSectionIds.includes(s.id)}
                                              onChange={(e) => {
                                                const checked = e.target.checked;
                                                setReuseSectionIds((prev) =>
                                                  checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                                                );
                                              }}
                                              className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                                            />
                                            <span className="truncate">{s.name}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="mt-2 text-xs text-slate-500">Selected: {reuseSectionIds.length}</div>
                                  </div>
                                  <div>
                                    <label className="block text-slate-400 text-xs mb-1">Target Period</label>
                                    <select
                                      value={reusePeriod}
                                      onChange={(e) => setReusePeriod(e.target.value)}
                                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                                    >
                                      <option value="">Select period...</option>
                                      <option value="1">1</option>
                                      <option value="2">2</option>
                                      <option value="3">3</option>
                                      <option value="4">4</option>
                                    </select>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                  Duplicate copies questions. Assign shares questions across sections (different code).
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="submit"
                                  className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
                                >
                                  Save Changes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReuseQuiz("duplicate")}
                                  className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold"
                                >
                                  Duplicate Quiz
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReuseQuiz("assign")}
                                  className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold"
                                >
                                  Assign to Section
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingQuizId(null)}
                                  className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </div>
                        )}
                        {selectedQuizId === quiz.id && editingQuizId !== quiz.id && (
                          <div className="w-full mt-6">
                            {renderQuestionsPanel()}
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

                {pendingQuizDraft && !selectedQuizId && (
                  <div className="mt-6">
                    {renderQuestionsPanel()}
                  </div>
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
              <div>Student: <span className="text-slate-100">{formatNameLastFirst(answerModal.studentname) || "—"}</span></div>
              <div>Quiz: <span className="text-slate-100">{answerModal.quizcode}</span></div>
              <div>Submission: <span className="text-slate-100">{formatSubmissionSource(answerModal.submission_source)}</span></div>
              <div>Attempt: <span className="text-slate-100">{answerModal.attempt_number ?? "—"}</span></div>
            </div>
            {(() => {
              const raw = (answerModal.answers ?? {}) as Record<string, unknown>;
              const mc = Array.isArray(raw.multiple_choice) ? raw.multiple_choice : [];
              const id = Array.isArray(raw.identification) ? raw.identification : [];
              const en = Array.isArray(raw.enumeration) ? raw.enumeration : [];
              const mcMap = buildAnswerMap(mc as Array<{ questionId: string; answer: string }>);
              const idMap = buildAnswerMap(id as Array<{ questionId: string; answer: string }>);
              const enMap = buildAnswerMap(en as Array<{ questionId: string; answer: string }>);

              const mcItems = buildQuestionItems(answerQuestions, "multiple_choice", mcMap);
              const idItems = buildQuestionItems(answerQuestions, "identification", idMap);
              const enItems = buildQuestionItems(answerQuestions, "enumeration", enMap);
              const laItems = buildQuestionItems(answerQuestions, "long_answer", new Map());

              const hasQuestions =
                mcItems.length + idItems.length + enItems.length + laItems.length > 0;
              const hasAnswers = mc.length + id.length + en.length > 0;
              return (
                <div className="max-h-[60vh] overflow-auto rounded-lg bg-slate-900/40 p-2">
                  {answersLoading && (
                    <div className="mb-3 text-xs text-slate-500">Loading questions…</div>
                  )}
                  {!answersLoading && !hasQuestions && (
                    <div className="rounded-lg bg-slate-800 p-4 text-sm text-slate-400">
                      No questions found for this quiz.
                    </div>
                  )}
                  {!answersLoading && hasQuestions && !hasAnswers && (
                    <div className="rounded-lg bg-slate-800 p-3 text-xs text-slate-400 mb-3">
                      No answers submitted for this attempt. Showing all questions.
                    </div>
                  )}
                  {renderAnswerBlock("Multiple Choice", mcItems, answerQuestions)}
                  {renderAnswerBlock("Identification", idItems, answerQuestions)}
                  {renderAnswerBlock("Enumeration", enItems, answerQuestions)}
                  {renderAnswerBlock("Long Answer", laItems, answerQuestions)}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}


