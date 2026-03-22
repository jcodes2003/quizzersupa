import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../lib/teacher-db-auth";
import { getSupabase } from "../../../lib/supabase-server";

type QuizTypeCounts = {
  multiple_choice: number;
  identification: number;
  enumeration: number;
};

type RephraseMode = {
  enabled: boolean;
};

function toNonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function sample<T>(items: T[], count: number): T[] {
  if (count <= 0) return [];
  if (count >= items.length) return [...items];
  const copy = [...items];
  shuffleInPlace(copy);
  return copy.slice(0, count);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

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

function safeParseOptions(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw.map((o) => String(o ?? "").trim()).filter(Boolean);
  if (typeof raw !== "string") return [];
  const s = raw.trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((o) => String(o ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function preserveEndingPunctuation(original: string, next: string): string {
  const trimmedOriginal = original.trim();
  const trimmedNext = next.trim().replace(/[.?!]+$/, "");
  if (!trimmedOriginal) return trimmedNext;
  const match = trimmedOriginal.match(/([.?!])\s*$/);
  return match ? `${trimmedNext}${match[1]}` : trimmedNext;
}

function applyReplacement(
  question: string,
  pattern: RegExp,
  replace: (match: string, ...groups: string[]) => string
): string | null {
  if (!pattern.test(question)) return null;
  const next = question.replace(pattern, replace).replace(/\s+/g, " ").trim();
  return next && next !== question ? preserveEndingPunctuation(question, next) : null;
}

function rephraseMultipleChoiceQuestion(question: string): string {
  const trimmed = question.trim();
  if (!trimmed) return trimmed;

  const transformed =
    applyReplacement(trimmed, /^Which of the following is NOT\s+/i, () => "Select the option that is NOT ") ??
    applyReplacement(trimmed, /^Which of the following\s+/i, () => "Select the correct option that ") ??
    applyReplacement(trimmed, /^What does (.+?) stand for\??$/i, (_m, term) => `${term} stands for which term`) ??
    applyReplacement(trimmed, /^What is the main difference between (.+?) and (.+?)\??$/i, (_m, first, second) => `How do ${first} and ${second} differ`) ??
    applyReplacement(trimmed, /^What is the main purpose of (.+?)\??$/i, (_m, subject) => `Which option best describes the main purpose of ${subject}`) ??
    applyReplacement(trimmed, /^Which keyword is used to (.+?)\??$/i, (_m, action) => `What keyword is used to ${action}`) ??
    applyReplacement(trimmed, /^Which operator is used to (.+?)\??$/i, (_m, action) => `What operator is used to ${action}`) ??
    applyReplacement(trimmed, /^Which method is used to (.+?)\??$/i, (_m, action) => `What method is used to ${action}`) ??
    applyReplacement(trimmed, /^Which statement is used to (.+?)\??$/i, (_m, action) => `What statement is used to ${action}`) ??
    applyReplacement(trimmed, /^Which of these is (.+?)\??$/i, (_m, phrase) => `Identify which choice is ${phrase}`) ??
    applyReplacement(trimmed, /^Which of the following is (.+?)\??$/i, (_m, phrase) => `Select the choice that is ${phrase}`) ??
    applyReplacement(trimmed, /^Which of the following are (.+?)\??$/i, (_m, phrase) => `Select the choices that are ${phrase}`) ??
    applyReplacement(trimmed, /^Which (.+?)\??$/i, (_m, phrase) => `Identify which ${phrase}`) ??
    applyReplacement(trimmed, /^What (.+?)\??$/i, (_m, phrase) => `Identify ${phrase}`) ??
    applyReplacement(trimmed, /^This (.+?) is called:?$/i, (_m, phrase) => `What is the term for this ${phrase}`) ??
    applyReplacement(trimmed, /^A (.+?) is called:?$/i, (_m, phrase) => `What do we call a ${phrase}`);

  return transformed ?? trimmed;
}

function rephraseIdentificationQuestion(question: string): string {
  const trimmed = question.trim();
  if (!trimmed) return trimmed;

  const transformed =
    applyReplacement(trimmed, /^The keyword used to (.+?)\.?$/i, (_m, action) => `Name the keyword used to ${action}`) ??
    applyReplacement(trimmed, /^The operator that (.+?)\.?$/i, (_m, action) => `Identify the operator that ${action}`) ??
    applyReplacement(trimmed, /^What data type is used to (.+?)\??$/i, (_m, phrase) => `Name the data type used to ${phrase}`) ??
    applyReplacement(trimmed, /^What does (.+?) stand for\??$/i, (_m, term) => `Write the meaning of ${term}`) ??
    applyReplacement(trimmed, /^It is (.+)$/i, (_m, phrase) => `Identify what is ${phrase}`) ??
    applyReplacement(trimmed, /^This is (.+)$/i, (_m, phrase) => `Identify what is ${phrase}`) ??
    applyReplacement(trimmed, /^A (.+?) is called what\??$/i, (_m, phrase) => `What is the term for a ${phrase}`) ??
    applyReplacement(trimmed, /^Condition first loop$/i, () => "Name the loop that checks the condition first") ??
    applyReplacement(trimmed, /^(.+?) is called what\??$/i, (_m, phrase) => `What is the term for ${phrase}`) ??
    (trimmed.endsWith("?") ? preserveEndingPunctuation(trimmed, `Identify ${trimmed.slice(0, -1)}`) : `Identify ${trimmed}`);

  return transformed ?? trimmed;
}

function rephraseQuestionText(question: string, quizType: string, mode: RephraseMode): string {
  if (!mode.enabled) return question.trim();
  if (quizType === "enumeration") return question.trim();
  if (quizType === "identification") return rephraseIdentificationQuestion(question);
  if (quizType === "multiple_choice") return rephraseMultipleChoiceQuestion(question);
  return question.trim();
}

export async function POST(request: NextRequest) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    sourceQuizIds?: unknown;
    multipleChoiceCount?: unknown;
    identificationCount?: unknown;
    enumerationCount?: unknown;
    rephraseQuestions?: unknown;
  };

  const sourceQuizIds = uniqueStrings(Array.isArray(body.sourceQuizIds) ? (body.sourceQuizIds as string[]) : []);
  if (sourceQuizIds.length === 0) {
    return NextResponse.json({ error: "Select at least one source quiz." }, { status: 400 });
  }

  const counts: QuizTypeCounts = {
    multiple_choice: toNonNegativeInt(body.multipleChoiceCount),
    identification: toNonNegativeInt(body.identificationCount),
    enumeration: toNonNegativeInt(body.enumerationCount),
  };
  const rephraseMode: RephraseMode = {
    enabled: body.rephraseQuestions !== false,
  };
  const totalRequested = counts.multiple_choice + counts.identification + counts.enumeration;
  if (totalRequested <= 0) {
    return NextResponse.json({ error: "Enter at least 1 question to generate." }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: quizRows, error: quizErr } = await supabase
    .from("quiztbl")
    .select("id, teacherid, subjectid, source_quiz_id")
    .in("id", sourceQuizIds)
    .eq("teacherid", teacherId);
  if (quizErr) return NextResponse.json({ error: quizErr.message }, { status: 500 });
  if ((quizRows ?? []).length !== sourceQuizIds.length) {
    return NextResponse.json({ error: "One or more selected quizzes are not accessible." }, { status: 403 });
  }

  const effectiveQuizIds = uniqueStrings(
    (quizRows ?? []).map((q) => String((q as { source_quiz_id?: string | null; id?: string }).source_quiz_id ?? (q as { id?: string }).id ?? ""))
  );

  const { data: allQuestions, error: qErr } = await supabase
    .from("questiontbl")
    .select("*")
    .in("quizid", effectiveQuizIds)
    .order("created_at");
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const questions = (allQuestions ?? []) as QuestionRow[];
  const byType = new Map<string, QuestionRow[]>();
  for (const q of questions) {
    const t = String(q.quiztype ?? "").trim();
    if (!t) continue;
    const arr = byType.get(t) ?? [];
    arr.push(q);
    byType.set(t, arr);
  }

  const available = {
    multiple_choice: (byType.get("multiple_choice") ?? []).length,
    identification: (byType.get("identification") ?? []).length,
    enumeration: (byType.get("enumeration") ?? []).length,
  };

  const missing: string[] = [];
  if (counts.multiple_choice > available.multiple_choice) {
    missing.push(`multiple choice: requested ${counts.multiple_choice}, available ${available.multiple_choice}`);
  }
  if (counts.identification > available.identification) {
    missing.push(`identification: requested ${counts.identification}, available ${available.identification}`);
  }
  if (counts.enumeration > available.enumeration) {
    missing.push(`enumeration: requested ${counts.enumeration}, available ${available.enumeration}`);
  }
  if (missing.length > 0) {
    return NextResponse.json({ error: `Not enough questions in the selected quizzes (${missing.join("; ")}).` }, { status: 400 });
  }

  const picked = [
    ...sample(byType.get("multiple_choice") ?? [], counts.multiple_choice),
    ...sample(byType.get("identification") ?? [], counts.identification),
    ...sample(byType.get("enumeration") ?? [], counts.enumeration),
  ];
  shuffleInPlace(picked);

  const previewQuestions = picked.map((q) => {
    const quizType = String(q.quiztype ?? "").trim();
    const options = quizType === "multiple_choice" ? safeParseOptions(q.options) : [];
    const scoreRaw = Number((q as { score?: unknown }).score);
    const score = Number.isFinite(scoreRaw) && scoreRaw > 0 ? scoreRaw : 1;
    const imageUrl = typeof (q as { image_url?: unknown }).image_url === "string"
      ? String((q as { image_url?: unknown }).image_url).trim()
      : "";
    return {
      question: rephraseQuestionText(String(q.question ?? "").trim(), quizType, rephraseMode),
      quizType,
      options,
      answerkey: String(q.answerkey ?? "").trim(),
      score,
      imageUrl: imageUrl || undefined,
    };
  });

  return NextResponse.json({
    questions: previewQuestions,
    available,
    requested: counts,
    total: previewQuestions.length,
  });
}
