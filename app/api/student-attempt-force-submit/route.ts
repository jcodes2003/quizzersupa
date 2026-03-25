import { NextRequest } from "next/server";
import { noStoreJson } from "../../lib/no-store";
import { getStudentSession } from "../../lib/student-auth";
import { sameStudentId, sanitizeStudentId } from "../../lib/student-id";
import { getSupabase } from "../../lib/supabase-server";

type QuestionRow = {
  id: string;
  quiztype: string;
  answerkey?: string | null;
  options?: string | null;
  score?: number | null;
};

type AnswerItem = { questionId?: string; answer?: string };
type HandsOnAnswerItem = { questionId?: string; answer?: string };

function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[._<>()[\]{}:,;\\]+/g, " ")
    .replace(/-/g, " ")
    .replace(/[^\w\s/+*-]/g, "")
    .replace(/\s+/g, " ");
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
    .replace(/[._<>()[\]{}:,;\\]+/g, " ")
    .replace(/[^\w\s/+*-]/g, "")
    .replace(/\s+/g, " ")
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
  if (norm.includes(" ")) variants.push(norm.replace(/\s+/g, ""));
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
      const isMatch = variations.some(
        (v) =>
          userNorm === v ||
          (userNorm.length >= 3 && v.includes(userNorm)) ||
          (v.length >= 3 && userNorm.includes(v)) ||
          (userNorm.length >= 4 && v.startsWith(userNorm)) ||
          (v.length >= 4 && userNorm.startsWith(v))
      );
      if (isMatch) {
        matched++;
        usedUser.add(i);
        break;
      }
    }
  }
  return matched;
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

function getQuestionScore(score?: number | null, fallback = 1): number {
  return Number.isFinite(score) && (score ?? 0) > 0 ? (score as number) : fallback;
}

function normalizeQuizType(value: string): string {
  const t = value.toLowerCase().trim().replace(/\s+/g, "_");
  if (t === "multiple_choice" || t === "mc" || t === "multiplechoice") return "multiple_choice";
  if (t === "true_false" || t === "truefalse" || t === "tf") return "multiple_choice";
  if (t === "identification" || t === "id" || t === "long_answer" || t === "longanswer" || t === "essay") {
    return "identification";
  }
  if (t === "enumeration" || t === "enum") return "enumeration";
  if (t === "hands_on" || t === "handson") return "hands_on";
  return t;
}

function buildAnswerMap(items: AnswerItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const key = String(item?.questionId ?? "").trim();
    if (!key) continue;
    map.set(key, String(item?.answer ?? ""));
  }
  return map;
}

function getAnswerItems(raw: Record<string, unknown>, key: string): AnswerItem[] {
  const value = raw[key];
  return Array.isArray(value) ? (value as AnswerItem[]) : [];
}

function getHandsOnAnswerItems(raw: Record<string, unknown>): HandsOnAnswerItem[] {
  const value = raw.hands_on;
  return Array.isArray(value) ? (value as HandsOnAnswerItem[]) : [];
}

function gradeFromAnswers(questions: QuestionRow[], answersRaw: Record<string, unknown>): { score: number; maxScore: number } {
  const mc: QuestionRow[] = [];
  const id: QuestionRow[] = [];
  const en: QuestionRow[] = [];
  const handsOn: QuestionRow[] = [];
  for (const q of questions) {
    const type = normalizeQuizType(String(q.quiztype ?? ""));
    if (type === "enumeration") {
      en.push(q);
      continue;
    }
    if (type === "hands_on") {
      handsOn.push(q);
      continue;
    }
    if (type === "identification") {
      id.push(q);
      continue;
    }
    if (type === "multiple_choice") {
      const options = parseOptions(q.options);
      if (options.length < 2) id.push(q);
      else mc.push(q);
    }
  }

  const mcMap = buildAnswerMap(getAnswerItems(answersRaw, "multiple_choice"));
  const idMap = buildAnswerMap(getAnswerItems(answersRaw, "identification"));
  const enMap = buildAnswerMap(getAnswerItems(answersRaw, "enumeration"));
  const handsOnMap = buildAnswerMap(getHandsOnAnswerItems(answersRaw));

  let mcScore = 0;
  for (const q of mc) {
    const answer = mcMap.get(String(q.id)) ?? "";
    const key = String(q.answerkey ?? "");
    if (normalizeAnswer(answer) === normalizeAnswer(key)) mcScore += getQuestionScore(q.score, 1);
  }

  let idScore = 0;
  for (const q of id) {
    const answer = idMap.get(String(q.id)) ?? "";
    const key = String(q.answerkey ?? "");
    const hasAnswerKey = key.trim().length > 0;
    if (hasAnswerKey) {
      if (checkIdentificationLoose(answer, key)) idScore += getQuestionScore(q.score, 1);
    } else if (checkIdentificationLoose(answer, key)) {
      idScore += getQuestionScore(q.score, 1);
    }
  }

  let enumScore = 0;
  for (const q of en) {
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

  let handsOnScore = 0;
  for (const q of handsOn) {
    const answer = handsOnMap.get(String(q.id)) ?? "";
    const key = String(q.answerkey ?? "").trim();
    if (answer.trim() && key && normalizeAnswer(answer) === normalizeAnswer(key)) {
      handsOnScore += getQuestionScore(q.score, 1);
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
  const handsOnMax = handsOn.reduce((sum, q) => sum + getQuestionScore(q.score, 1), 0);

  return {
    score: mcScore + idScore + enumScore + handsOnScore,
    maxScore: mcMax + idMax + enumMax + handsOnMax,
  };
}

export async function POST(request: NextRequest) {
  const session = await getStudentSession();
  if (!session) return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { attemptId?: string; quizId?: string };
  const attemptId = String(body.attemptId ?? "").trim();
  const quizId = String(body.quizId ?? "").trim();
  const studentId = sanitizeStudentId(session.student.studentId ?? "");
  if (!attemptId || !quizId || !studentId) {
    return noStoreJson({ ok: false, error: "attemptId and quizId are required." }, { status: 400 });
  }

  const supabase = getSupabase();
  const openAttemptRes = await supabase
    .from("student_attempts_log")
    .select("id, quizid, student_id, studentname, attempt_number, answers, is_submitted")
    .eq("id", attemptId)
    .maybeSingle();
  const openAttemptErr = String(openAttemptRes.error?.message ?? "");
  if (openAttemptErr) {
    if (openAttemptErr.toLowerCase().includes("student_attempts_log")) {
      return noStoreJson({ ok: false, error: "Force submit requires the student_attempts_log table." }, { status: 501 });
    }
    return noStoreJson({ ok: false, error: openAttemptErr }, { status: 500 });
  }
  const openAttempt = openAttemptRes.data as {
    id?: string | null;
    quizid?: string | null;
    student_id?: string | null;
    studentname?: string | null;
    attempt_number?: number | null;
    answers?: Record<string, unknown> | null;
    is_submitted?: boolean | null;
  } | null;
  if (!openAttempt || String(openAttempt.quizid ?? "").trim() !== quizId) {
    return noStoreJson({ ok: false, error: "Open attempt not found for this quiz." }, { status: 404 });
  }
  if (!sameStudentId(openAttempt.student_id, studentId)) {
    return noStoreJson({ ok: false, error: "You can only submit your own attempt." }, { status: 403 });
  }
  if (openAttempt.is_submitted) {
    return noStoreJson({ ok: true, message: "Attempt already submitted." });
  }

  const quizRes = await supabase
    .from("quiztbl")
    .select("id, subjectid, sectionid, save_best_only")
    .eq("id", quizId)
    .maybeSingle();
  if (quizRes.error) return noStoreJson({ ok: false, error: quizRes.error.message }, { status: 500 });
  const quizRow = quizRes.data as { subjectid?: string | null; sectionid?: string | null; save_best_only?: boolean | null } | null;
  if (!quizRow) return noStoreJson({ ok: false, error: "Quiz not found." }, { status: 404 });

  const qRes = await supabase
    .from("questiontbl")
    .select("id, quiztype, answerkey, options, score")
    .eq("quizid", quizId);
  if (qRes.error) return noStoreJson({ ok: false, error: qRes.error.message }, { status: 500 });
  const questions = (qRes.data ?? []) as QuestionRow[];

  const answers = (openAttempt.answers && typeof openAttempt.answers === "object"
    ? openAttempt.answers
    : {}) as Record<string, unknown>;
  const graded = gradeFromAnswers(questions, answers);

  const submittedAt = new Date().toISOString();
  let logUpdate = await supabase
    .from("student_attempts_log")
    .update({
      score: graded.score,
      max_score: graded.maxScore,
      submitted_at: submittedAt,
      is_submitted: true,
      submission_source: "manual_done_button",
      subjectid: quizRow.subjectid ?? null,
      sectionid: quizRow.sectionid ?? null,
      studentname: String(openAttempt.studentname ?? session.student.name ?? "").trim(),
      attempt_number: Number.isFinite(openAttempt.attempt_number) ? openAttempt.attempt_number : 1,
    })
    .eq("id", attemptId)
    .select("id")
    .maybeSingle();
  if (String(logUpdate.error?.message ?? "").toLowerCase().includes("submission_source")) {
    logUpdate = await supabase
      .from("student_attempts_log")
      .update({
        score: graded.score,
        max_score: graded.maxScore,
        submitted_at: submittedAt,
        is_submitted: true,
        subjectid: quizRow.subjectid ?? null,
        sectionid: quizRow.sectionid ?? null,
        studentname: String(openAttempt.studentname ?? session.student.name ?? "").trim(),
        attempt_number: Number.isFinite(openAttempt.attempt_number) ? openAttempt.attempt_number : 1,
      })
      .eq("id", attemptId)
      .select("id")
      .maybeSingle();
  }
  if (logUpdate.error) return noStoreJson({ ok: false, error: logUpdate.error.message }, { status: 500 });

  const saveBestOnly = quizRow.save_best_only !== false;
  const basePayload = {
    quizid: quizId,
    studentname: String(openAttempt.studentname ?? session.student.name ?? "").trim(),
    student_id: studentId,
    score: graded.score,
    max_score: graded.maxScore,
    attempt_number: Number.isFinite(openAttempt.attempt_number) ? openAttempt.attempt_number : 1,
    subjectid: quizRow.subjectid ?? null,
    sectionid: quizRow.sectionid ?? null,
  };

  if (saveBestOnly) {
    const firstRowsRes = await supabase
      .from("student_attempts")
      .select("id, student_id, score")
      .eq("quizid", quizId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (firstRowsRes.error) return noStoreJson({ ok: false, error: firstRowsRes.error.message }, { status: 500 });
    const firstAttempt = ((firstRowsRes.data ?? []) as Array<{ id?: string; student_id?: string | null; score?: number | null }>)
      .find((row) => sameStudentId(row.student_id, studentId));

    if (firstAttempt?.id) {
      const current = Number(firstAttempt.score);
      const shouldUpdate = !Number.isFinite(current) || graded.score > current;
      if (shouldUpdate) {
        const updateRes = await supabase
          .from("student_attempts")
          .update({
            score: graded.score,
            max_score: graded.maxScore,
            studentname: basePayload.studentname,
            subjectid: basePayload.subjectid,
            sectionid: basePayload.sectionid,
            attempt_number: basePayload.attempt_number,
            student_id: studentId,
          })
          .eq("id", firstAttempt.id);
        if (updateRes.error) return noStoreJson({ ok: false, error: updateRes.error.message }, { status: 500 });
      }
    } else {
      const insertRes = await supabase.from("student_attempts").insert(basePayload);
      if (insertRes.error) return noStoreJson({ ok: false, error: insertRes.error.message }, { status: 500 });
    }
  } else {
    const insertRes = await supabase.from("student_attempts").insert(basePayload);
    if (insertRes.error) return noStoreJson({ ok: false, error: insertRes.error.message }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    submitted: true,
    score: graded.score,
    maxScore: graded.maxScore,
    percentage: graded.maxScore > 0 ? Math.round((graded.score / graded.maxScore) * 100) : 0,
  });
}
