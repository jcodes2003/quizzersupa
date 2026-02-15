import { NextRequest, NextResponse } from "next/server";
import { getTeacherId } from "../../../lib/teacher-db-auth";
import { getSupabase } from "../../../lib/supabase-server";

type QuestionRow = {
  id: string;
  quizid: string;
  quiztype: string;
  answerkey?: string | null;
  options?: string | null;
  score?: number | null;
};

type AnswerItem = { questionId?: string; answer?: string };

type AttemptRow = {
  id: string;
  quizid: string;
  student_id?: string | null;
  studentname?: string | null;
  attempt_number?: number | null;
  score?: number | null;
  max_score?: number | null;
  answers?: Record<string, unknown> | null;
  created_at?: string | null;
  submitted_at?: string | null;
};

type QuizInfo = {
  id: string;
  save_best_only?: boolean | null;
  source_quiz_id?: string | null;
};

function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s/-]/g, "")
    .replace(/-/g, " ");
}

function singularizeWord(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|ses|oes)$/.test(word) && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function nearWordMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (singularizeWord(a) === singularizeWord(b)) return true;
  if (a.length >= 5 && b.length >= 5) {
    const isPrefix = a.startsWith(b) || b.startsWith(a);
    if (isPrefix && Math.abs(a.length - b.length) <= 1) return true;
  }
  return false;
}

function checkIdentificationLoose(user: string, correct: string): boolean {
  const userNorm = normalizeAnswer(user);
  const correctNorm = normalizeAnswer(correct);
  if (!userNorm || !correctNorm) return false;
  if (userNorm === correctNorm) return true;

  const userWords = userNorm.split(" ").filter(Boolean);
  const correctWords = correctNorm.split(" ").filter(Boolean);
  if (userWords.length !== correctWords.length) return false;

  for (let i = 0; i < userWords.length; i++) {
    if (!nearWordMatch(userWords[i]!, correctWords[i]!)) return false;
  }
  return true;
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
    .split("\n")
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

function checkIdentification(user: string, correct: string): boolean {
  return checkIdentificationLoose(user, correct);
}

function getQuestionScore(score?: number | null, fallback = 1): number {
  return Number.isFinite(score) && (score ?? 0) > 0 ? (score as number) : fallback;
}

function parseOptions(options: string | null | undefined): string[] {
  if (!options) return [];
  try {
    const parsed = JSON.parse(options);
    return Array.isArray(parsed) ? parsed.map((o: unknown) => String(o)) : [];
  } catch {
    return [];
  }
}

function normalizeQuizType(value: string): string {
  const t = value.toLowerCase().trim().replace(/\s+/g, "_");
  if (t === "multiple_choice" || t === "mc" || t === "multiplechoice") return "multiple_choice";
  if (t === "true_false" || t === "truefalse" || t === "tf") return "multiple_choice";
  if (t === "identification" || t === "id") return "identification";
  if (t === "enumeration" || t === "enum") return "enumeration";
  if (t === "long_answer" || t === "longanswer" || t === "essay") return "long_answer";
  return t;
}

type QuizGradeData = {
  mc: QuestionRow[];
  id: QuestionRow[];
  enum: QuestionRow[];
  maxScore: number;
};

function buildQuizGradeData(questions: QuestionRow[]): QuizGradeData {
  const mc: QuestionRow[] = [];
  const id: QuestionRow[] = [];
  const en: QuestionRow[] = [];

  for (const q of questions) {
    const type = normalizeQuizType(String(q.quiztype ?? ""));
    if (type === "enumeration") {
      en.push(q);
      continue;
    }
    if (type === "long_answer" || type === "identification") {
      id.push(q);
      continue;
    }
    if (type === "multiple_choice") {
      const options = parseOptions(q.options);
      if (options.length < 2) id.push(q);
      else mc.push(q);
      continue;
    }
  }

  const mcMax = mc.reduce((sum, q) => sum + getQuestionScore(q.score, 1), 0);
  const idMax = id.reduce((sum, q) => sum + getQuestionScore(q.score, 1), 0);
  const enumMax = en.reduce((sum, q) => {
    const expected = parseEnumerationAnswerKey(String(q.answerkey ?? "")).length;
    const questionScore = getQuestionScore(q.score, 1);
    if (questionScore === expected && expected > 0) return sum + expected;
    return sum + questionScore;
  }, 0);

  return { mc, id, enum: en, maxScore: mcMax + idMax + enumMax };
}

function buildAnswerMap(items: AnswerItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const key = String(item?.questionId ?? "");
    if (!key) continue;
    map.set(key, String(item?.answer ?? ""));
  }
  return map;
}

function getAnswerItems(raw: Record<string, unknown>, key: string): AnswerItem[] {
  const value = raw[key];
  return Array.isArray(value) ? (value as AnswerItem[]) : [];
}

function gradeAttempt(quizData: QuizGradeData, answers: Record<string, unknown>) {
  const mcMap = buildAnswerMap(getAnswerItems(answers, "multiple_choice"));
  const idMap = buildAnswerMap(getAnswerItems(answers, "identification"));
  const enMap = buildAnswerMap(getAnswerItems(answers, "enumeration"));

  let mcScore = 0;
  for (const q of quizData.mc) {
    const answer = mcMap.get(String(q.id)) ?? "";
    const key = String(q.answerkey ?? "");
    if (normalizeAnswer(answer) === normalizeAnswer(key)) {
      mcScore += getQuestionScore(q.score, 1);
    }
  }

  let idScore = 0;
  for (const q of quizData.id) {
    const answer = idMap.get(String(q.id)) ?? "";
    const key = String(q.answerkey ?? "");
    const hasAnswerKey = key.trim().length > 0;
    if (hasAnswerKey) {
      if (checkIdentification(answer, key)) {
        idScore += getQuestionScore(q.score, 1);
      }
    } else if (checkIdentification(answer, key)) {
      idScore += getQuestionScore(q.score, 1);
    }
  }

  let enumScore = 0;
  for (const q of quizData.enum) {
    const answer = enMap.get(String(q.id)) ?? "";
    const userItems = parseEnumerationInput(answer);
    const correctItems = parseEnumerationAnswerKey(String(q.answerkey ?? ""));
    const matched = checkEnumerationMatch(userItems, correctItems);
    const expected = correctItems.length;
    const questionScore = getQuestionScore(q.score, 1);
    if (expected > 0) {
      enumScore += questionScore === expected ? matched : matched / expected >= 0.8 ? questionScore : 0;
    }
  }

  const totalScore = mcScore + idScore + enumScore;
  return { totalScore, maxScore: quizData.maxScore };
}

export async function POST(request: NextRequest) {
  const teacherId = await getTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const subjectId = String(body.subjectId ?? "").trim();
  const sectionId = String(body.sectionId ?? "").trim();
  if (!subjectId || !sectionId) {
    return NextResponse.json({ error: "subjectId and sectionId required" }, { status: 400 });
  }

  const supabase = getSupabase();

  let quizQuery = supabase
    .from("quiztbl")
    .select("id, save_best_only, source_quiz_id")
    .eq("teacherid", teacherId)
    .eq("subjectid", subjectId)
    .eq("sectionid", sectionId);

  const quizResult = await quizQuery;

  if (quizResult.error) {
    return NextResponse.json({ error: quizResult.error.message }, { status: 500 });
  }

  const quizzes = (quizResult.data ?? []) as QuizInfo[];
  if (quizzes.length === 0) {
    return NextResponse.json({ ok: true, totalAttempts: 0, updatedAttempts: 0 });
  }

  const quizIds = quizzes.map((q) => String(q.id));
  const sourceQuizIds = Array.from(
    new Set(quizzes.map((q) => String(q.source_quiz_id ?? q.id)))
  );

  const questionsResult = await supabase
    .from("questiontbl")
    .select("id, quizid, quiztype, answerkey, options, score")
    .in("quizid", sourceQuizIds);

  if (questionsResult.error) {
    return NextResponse.json({ error: questionsResult.error.message }, { status: 500 });
  }

  const questions = (questionsResult.data ?? []) as QuestionRow[];
  const questionsByQuiz = new Map<string, QuestionRow[]>();
  for (const q of questions) {
    const key = String(q.quizid ?? "");
    if (!key) continue;
    const list = questionsByQuiz.get(key) ?? [];
    list.push(q);
    questionsByQuiz.set(key, list);
  }

  const attemptsResult = await supabase
    .from("student_attempts_log")
    .select("id, quizid, student_id, studentname, attempt_number, score, max_score, answers, created_at, submitted_at")
    .in("quizid", quizIds)
    .eq("sectionid", sectionId)
    .eq("is_submitted", true);

  if (attemptsResult.error) {
    const msg = String(attemptsResult.error.message || "");
    if (msg.toLowerCase().includes("answers") || msg.toLowerCase().includes("student_attempts_log")) {
      return NextResponse.json(
        { error: "Recheck requires student_attempts_log with answers stored." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const attempts = (attemptsResult.data ?? []) as AttemptRow[];

  const quizInfoMap = new Map<string, { saveBestOnly: boolean; sourceQuizId: string }>();
  for (const q of quizzes) {
    quizInfoMap.set(String(q.id), {
      saveBestOnly: q.save_best_only !== false,
      sourceQuizId: String(q.source_quiz_id ?? q.id),
    });
  }

  const gradeCache = new Map<string, QuizGradeData>();
  const regraded = attempts.map((attempt) => {
    const quizId = String(attempt.quizid ?? "");
    const info = quizInfoMap.get(quizId);
    if (!info) return null;
    const sourceQuizId = info.sourceQuizId;
    let quizData = gradeCache.get(sourceQuizId);
    if (!quizData) {
      const quizQuestions = questionsByQuiz.get(sourceQuizId) ?? [];
      quizData = buildQuizGradeData(quizQuestions);
      gradeCache.set(sourceQuizId, quizData);
    }
    if (quizData.mc.length + quizData.id.length + quizData.enum.length === 0) {
      return null;
    }
    const { totalScore, maxScore } = gradeAttempt(quizData, (attempt.answers ?? {}) as Record<string, unknown>);
    return {
      id: String(attempt.id ?? ""),
      quizid: quizId,
      student_id: String(attempt.student_id ?? ""),
      studentname: String(attempt.studentname ?? ""),
      attempt_number: Number(attempt.attempt_number ?? 0),
      created_at: attempt.submitted_at ?? attempt.created_at ?? null,
      score: totalScore,
      max_score: maxScore,
      old_score: attempt.score ?? null,
      old_max_score: attempt.max_score ?? null,
    };
  }).filter(Boolean) as Array<{
    id: string;
    quizid: string;
    student_id: string;
    studentname: string;
    attempt_number: number;
    created_at: string | null;
    score: number;
    max_score: number;
    old_score: number | null;
    old_max_score: number | null;
  }>;

  let updatedAttempts = 0;
  for (const row of regraded) {
    const scoreChanged = Number(row.old_score ?? -1) !== Number(row.score);
    const maxChanged = Number(row.old_max_score ?? -1) !== Number(row.max_score);
    if (!scoreChanged && !maxChanged) continue;
    const updateRes = await supabase
      .from("student_attempts_log")
      .update({ score: row.score, max_score: row.max_score })
      .eq("id", row.id);
    if (updateRes.error && !String(updateRes.error.message || "").toLowerCase().includes("student_attempts_log")) {
      return NextResponse.json({ error: updateRes.error.message }, { status: 500 });
    }
    updatedAttempts++;
  }

  let updatedBest = 0;
  for (const quizId of quizIds) {
    const info = quizInfoMap.get(quizId);
    if (!info) continue;
    const quizRows = regraded.filter((r) => r.quizid === quizId && r.student_id);
    if (quizRows.length === 0) continue;

    if (info.saveBestOnly) {
      const bestByStudent = new Map<string, typeof quizRows[number]>();
      for (const r of quizRows) {
        const key = r.student_id;
        const existing = bestByStudent.get(key);
        if (!existing) {
          bestByStudent.set(key, r);
          continue;
        }
        if (r.score > existing.score) {
          bestByStudent.set(key, r);
        } else if (r.score === existing.score) {
          const a = r.created_at ? new Date(r.created_at).getTime() : 0;
          const b = existing.created_at ? new Date(existing.created_at).getTime() : 0;
          if (a > b) bestByStudent.set(key, r);
        }
      }

      for (const r of bestByStudent.values()) {
        const update = await supabase
          .from("student_attempts")
          .update({
            score: r.score,
            max_score: r.max_score,
            studentname: r.studentname,
            attempt_number: r.attempt_number || 1,
          })
          .eq("quizid", quizId)
          .eq("student_id", r.student_id)
          .select("id")
          .maybeSingle();

        const errMsg = String(update.error?.message || "");
        if (update.error && !errMsg.toLowerCase().includes("student_attempts")) {
          return NextResponse.json({ error: update.error.message }, { status: 500 });
        }

        if (!update.data && !update.error) {
          const insert = await supabase.from("student_attempts").insert({
            quizid: quizId,
            studentname: r.studentname,
            student_id: r.student_id,
            score: r.score,
            attempt_number: r.attempt_number || 1,
            max_score: r.max_score,
          });
          const insertErr = String(insert.error?.message || "");
          if (insert.error && !insertErr.toLowerCase().includes("student_attempts")) {
            return NextResponse.json({ error: insert.error.message }, { status: 500 });
          }
        }
        updatedBest++;
      }
    } else {
      for (const r of quizRows) {
        const update = await supabase
          .from("student_attempts")
          .update({
            score: r.score,
            max_score: r.max_score,
            studentname: r.studentname,
          })
          .eq("quizid", quizId)
          .eq("student_id", r.student_id)
          .eq("attempt_number", r.attempt_number)
          .select("id")
          .maybeSingle();

        const errMsg = String(update.error?.message || "");
        if (update.error && !errMsg.toLowerCase().includes("student_attempts")) {
          return NextResponse.json({ error: update.error.message }, { status: 500 });
        }

        if (!update.data && !update.error) {
          const insert = await supabase.from("student_attempts").insert({
            quizid: quizId,
            studentname: r.studentname,
            student_id: r.student_id,
            score: r.score,
            attempt_number: r.attempt_number || 1,
            max_score: r.max_score,
          });
          const insertErr = String(insert.error?.message || "");
          if (insert.error && !insertErr.toLowerCase().includes("student_attempts")) {
            return NextResponse.json({ error: insert.error.message }, { status: 500 });
          }
        }
        updatedBest++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    totalAttempts: regraded.length,
    updatedAttempts,
    updatedBest,
  });
}
