"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import supabase from "../supabase-client";
import type {
  HandsOnQuestion,
  MultipleChoiceQuestion,
  IdentificationQuestion,
  EnumerationQuestion,
  QuizData,
} from "../quiz-data";

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

function checkIdentification(user: string, correct: string | string[]): boolean {
  const answers = Array.isArray(correct) ? correct : [correct];
  return answers.some((a) => checkIdentificationLoose(user, a));
}

function sanitizeStudentId(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "");
}

function clampRemainingAttempts(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.trunc(value));
}

function hashStringToSeed(input: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: readonly T[], seedKey: string): T[] {
  const arr = items.slice();
  const rand = mulberry32(hashStringToSeed(seedKey));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getQuestionScore(score?: number, fallback = 1): number {
  return Number.isFinite(score) && (score ?? 0) > 0 ? (score as number) : fallback;
}

type HandsOnAnswer = {
  mode: "html_css" | "java_console";
  html: string;
  css: string;
  java: string;
  javaInput?: string;
  consoleOutput: string;
};

let ignoreAutoSubmitUntil = 0;

function isAutoSubmissionSource(source: SubmissionSource): boolean {
  return source === "auto_tab_switch" || source === "auto_close_tab" || source === "auto_time_expired";
}

function extractSavedAnswerMap(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  const entries: Array<[string, string]> = [];
  for (const item of value) {
    const row = item as { questionId?: unknown; answer?: unknown };
    const questionId = String(row.questionId ?? "").trim();
    if (!questionId) continue;
    entries.push([questionId, typeof row.answer === "string" ? row.answer : String(row.answer ?? "")]);
  }
  return Object.fromEntries(entries);
}

function extractSavedHandsOnMap(value: unknown): Record<string, HandsOnAnswer> {
  if (!Array.isArray(value)) return {};
  const entries: Array<[string, HandsOnAnswer]> = [];
  for (const item of value) {
    const row = item as Record<string, unknown>;
    const questionId = String(row.questionId ?? "").trim();
    if (!questionId) continue;
    entries.push([
      questionId,
      {
        mode: row.mode === "java_console" ? "java_console" : "html_css",
        html: typeof row.html === "string" ? row.html : "",
        css: typeof row.css === "string" ? row.css : "",
        java: typeof row.java === "string" ? row.java : "",
        javaInput: typeof row.javaInput === "string" ? row.javaInput : "",
        consoleOutput: typeof row.consoleOutput === "string" ? row.consoleOutput : "",
      },
    ]);
  }
  return Object.fromEntries(entries);
}

const DEFAULT_HANDS_ON_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
      <h1> bayloe ni diri mo magcode!</h1> 
</body>
</html>`;

const DEFAULT_HANDS_ON_CSS = `body {
  font-family: Arial, sans-serif;
  padding: 24px;
  background: #f8fafc;
}

.card {
  max-width: 420px;
  margin: 0 auto;
  padding: 24px;
  border-radius: 16px;
  background: white;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}`;

const DEFAULT_HANDS_ON_JAVA = `// Online Java Compiler
// Use this editor to write, compile and run your Java code online

class Main {
    public static void main(String[] args) {
        System.out.println("Try programiz.pro");
    }
}`;

function buildHandsOnPreviewDoc(html: string, css: string): string {
  const trimmedHtml = html.trim();
  const styleBlock = css.trim() ? `<style>${css}</style>` : "";
  const looksLikeFullDocument =
    /^<!doctype html/i.test(trimmedHtml) || /<html[\s>]/i.test(trimmedHtml);

  if (looksLikeFullDocument) {
    if (!styleBlock) return trimmedHtml;
    if (/<head[\s>][\s\S]*<\/head>/i.test(trimmedHtml)) {
      return trimmedHtml.replace(/<\/head>/i, `${styleBlock}</head>`);
    }
    if (/<html[\s>][\s\S]*?>/i.test(trimmedHtml)) {
      return trimmedHtml.replace(/<html([\s>][\s\S]*?)?>/i, (match) => `${match}<head>${styleBlock}</head>`);
    }
    return `${styleBlock}${trimmedHtml}`;
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${styleBlock}
  </head>
  <body>${html}</body>
</html>`;
}

function getEffectiveHandsOnAnswer(
  question: HandsOnQuestion,
  value?: HandsOnAnswer
): HandsOnAnswer {
  const mode = question.mode === "java_console" ? "java_console" : "html_css";
  const htmlValue =
    typeof value?.html === "string"
      ? value.html
      : typeof question.starterHtml === "string" && question.starterHtml.trim()
        ? question.starterHtml
        : DEFAULT_HANDS_ON_HTML;
  const cssValue =
    typeof value?.css === "string"
      ? value.css
      : typeof question.starterCss === "string" && question.starterCss.trim()
        ? question.starterCss
        : DEFAULT_HANDS_ON_CSS;
  const javaValue =
    typeof value?.java === "string" && value.java.length > 0
      ? value.java
      : typeof question.starterJava === "string" && question.starterJava.trim().length > 0
        ? question.starterJava
        : DEFAULT_HANDS_ON_JAVA;

  return {
    mode,
    html: htmlValue,
    css: cssValue,
    java: javaValue,
    javaInput: typeof value?.javaInput === "string" ? value.javaInput : "",
    consoleOutput: value?.consoleOutput ?? "",
  };
}

function setCursorPosition(el: HTMLTextAreaElement, start: number, end = start) {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start, end);
  });
}

function getIndentOfLine(value: string, cursor: number): string {
  const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const line = value.slice(lineStart, cursor);
  const match = line.match(/^\s*/);
  return match?.[0] ?? "";
}

function getLineStart(value: string, cursor: number): number {
  return value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
}

function getLineEnd(value: string, cursor: number): number {
  const nextNewline = value.indexOf("\n", cursor);
  return nextNewline === -1 ? value.length : nextNewline;
}

function getAutoClosingTag(value: string, cursor: number): string | null {
  const before = value.slice(0, cursor);
  const match = before.match(/<([A-Za-z][\w-]*)[^<>]*$/);
  if (!match) return null;
  if (before.endsWith("/")) return null;
  const tag = match[1]?.toLowerCase() ?? "";
  if (!tag) return null;
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
  if (voidTags.has(tag)) return null;
  return tag;
}

type HtmlTagToken = {
  start: number;
  end: number;
  text: string;
  name: string;
  kind: "open" | "close" | "self" | "doctype" | "comment";
};

function getHtmlErrorTagStarts(value: string): Set<number> {
  const tokens: HtmlTagToken[] = [];
  const tagPattern = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[A-Za-z][^>]*?>/gi;

  for (const match of value.matchAll(tagPattern)) {
    const text = match[0] ?? "";
    const start = match.index ?? 0;
    const end = start + text.length;

    if (/^<!--/i.test(text)) {
      tokens.push({ start, end, text, name: "", kind: "comment" });
      continue;
    }
    if (/^<!DOCTYPE/i.test(text)) {
      tokens.push({ start, end, text, name: "!doctype", kind: "doctype" });
      continue;
    }

    const nameMatch = text.match(/^<\/?\s*([A-Za-z][\w-]*)/);
    const name = nameMatch?.[1]?.toLowerCase() ?? "";
    const isClosing = /^<\//.test(text);
    const isSelf = /\/\s*>$/.test(text);
    tokens.push({
      start,
      end,
      text,
      name,
      kind: isClosing ? "close" : isSelf ? "self" : "open",
    });
  }

  const invalidStarts = new Set<number>();
  const stack: HtmlTagToken[] = [];

  for (const token of tokens) {
    if (token.kind !== "open" && token.kind !== "close") continue;
    if (token.kind === "open") {
      stack.push(token);
      continue;
    }

    const top = stack[stack.length - 1];
    if (top && top.name === token.name) {
      stack.pop();
      continue;
    }

    invalidStarts.add(token.start);
    if (top) {
      invalidStarts.add(top.start);
      stack.pop();
    }
  }

  for (const token of stack) invalidStarts.add(token.start);
  return invalidStarts;
}

function renderHtmlTag(tagText: string, isError: boolean, keyPrefix: string) {
  if (/^<!--/i.test(tagText)) {
    return <span key={keyPrefix} className="text-emerald-400">{tagText}</span>;
  }
  if (/^<!DOCTYPE/i.test(tagText)) {
    return (
      <span
        key={keyPrefix}
        className={isError ? "bg-red-500/20 text-red-300 underline decoration-red-400/70" : "text-sky-300"}
      >
        {tagText}
      </span>
    );
  }

  const match = tagText.match(/^(<\/?)([A-Za-z][\w-]*)([\s\S]*?)(\/?>)$/);
  if (!match) {
    return (
      <span
        key={keyPrefix}
        className={isError ? "bg-red-500/20 text-red-300 underline decoration-red-400/70" : "text-sky-300"}
      >
        {tagText}
      </span>
    );
  }

  const [, opener, tagName, attrPart, closer] = match;
  const attrNodes: Array<string | ReturnType<typeof renderHtmlTag>> = [];
  const attrRegex = /(\s+)([^\s=\/>]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/g;
  let cursor = 0;
  let attrIndex = 0;

  for (const attrMatch of attrPart.matchAll(attrRegex)) {
    const full = attrMatch[0] ?? "";
    const offset = attrMatch.index ?? 0;
    if (offset > cursor) {
      attrNodes.push(
        <span key={`${keyPrefix}-raw-${attrIndex}`} className="text-slate-300">
          {attrPart.slice(cursor, offset)}
        </span>
      );
    }

    attrNodes.push(
      <span key={`${keyPrefix}-ws-${attrIndex}`} className="text-slate-300">
        {attrMatch[1] ?? ""}
      </span>
    );
    attrNodes.push(
      <span key={`${keyPrefix}-name-${attrIndex}`} className="text-sky-300">
        {attrMatch[2] ?? ""}
      </span>
    );
    attrNodes.push(
      <span key={`${keyPrefix}-eq-${attrIndex}`} className="text-slate-300">
        {attrMatch[3] ?? ""}
      </span>
    );
    attrNodes.push(
      <span key={`${keyPrefix}-value-${attrIndex}`} className="text-orange-300">
        {attrMatch[4] ?? ""}
      </span>
    );

    cursor = offset + full.length;
    attrIndex += 1;
  }

  if (cursor < attrPart.length) {
    attrNodes.push(
      <span key={`${keyPrefix}-tail`} className="text-slate-300">
        {attrPart.slice(cursor)}
      </span>
    );
  }

  const errorClass = isError ? "bg-red-500/20 underline decoration-red-400/70 rounded-sm" : "";

  return (
    <span key={keyPrefix} className={errorClass}>
      <span className="text-slate-300">{opener}</span>
      <span className={isError ? "text-red-300" : "text-sky-300"}>{tagName}</span>
      {attrNodes}
      <span className="text-slate-300">{closer}</span>
    </span>
  );
}

function renderHighlightedHtml(value: string) {
  const invalidStarts = getHtmlErrorTagStarts(value);
  const nodes: Array<string | ReturnType<typeof renderHtmlTag>> = [];
  const tagPattern = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[A-Za-z][^>]*?>/gi;
  let lastIndex = 0;
  let tagIndex = 0;

  for (const match of value.matchAll(tagPattern)) {
    const text = match[0] ?? "";
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(
        <span key={`plain-${tagIndex}`} className="text-slate-300">
          {value.slice(lastIndex, start)}
        </span>
      );
    }
    nodes.push(renderHtmlTag(text, invalidStarts.has(start), `tag-${tagIndex}`));
    lastIndex = start + text.length;
    tagIndex += 1;
  }

  if (lastIndex < value.length) {
    nodes.push(
      <span key="plain-tail" className="text-slate-300">
        {value.slice(lastIndex)}
      </span>
    );
  }

  return nodes;
}

const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class",
  "const", "continue", "default", "do", "double", "else", "enum", "extends", "final",
  "finally", "float", "for", "goto", "if", "implements", "import", "instanceof", "int",
  "interface", "long", "native", "new", "package", "private", "protected", "public",
  "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this",
  "throw", "throws", "transient", "try", "void", "volatile", "while", "var",
]);

function renderJavaCodeSegment(segment: string, keyPrefix: string) {
  const nodes: Array<string | React.ReactNode> = [];
  const tokenPattern =
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|var)\b|\b(?:System|String|Scanner|ArrayList|List|Map|Set|Integer|Double|Boolean|Character|Object|Math)\b|@[A-Za-z_]\w*/g;
  let lastIndex = 0;
  let tokenIndex = 0;

  for (const match of segment.matchAll(tokenPattern)) {
    const text = match[0] ?? "";
    const start = match.index ?? 0;

    if (start > lastIndex) {
      nodes.push(
        <span key={`${keyPrefix}-plain-${tokenIndex}`} className="text-slate-300">
          {segment.slice(lastIndex, start)}
        </span>
      );
    }

    let className = "text-slate-200";
    if (text.startsWith('"') || text.startsWith("'")) {
      className = "text-amber-300";
    } else if (text.startsWith("@")) {
      className = "text-cyan-300";
    } else if (JAVA_KEYWORDS.has(text)) {
      className = "text-sky-300";
    } else {
      className = "text-emerald-300";
    }

    nodes.push(
      <span key={`${keyPrefix}-token-${tokenIndex}`} className={className}>
        {text}
      </span>
    );

    lastIndex = start + text.length;
    tokenIndex += 1;
  }

  if (lastIndex < segment.length) {
    nodes.push(
      <span key={`${keyPrefix}-tail`} className="text-slate-300">
        {segment.slice(lastIndex)}
      </span>
    );
  }

  return nodes;
}

function renderHighlightedJava(value: string) {
  const nodes: Array<string | React.ReactNode> = [];
  const commentPattern = /\/\/.*$/gm;
  let lastIndex = 0;
  let commentIndex = 0;

  for (const match of value.matchAll(commentPattern)) {
    const text = match[0] ?? "";
    const start = match.index ?? 0;

    if (start > lastIndex) {
      nodes.push(...renderJavaCodeSegment(value.slice(lastIndex, start), `java-code-${commentIndex}`));
    }

    nodes.push(
      <span key={`java-comment-${commentIndex}`} className="text-slate-500">
        {text}
      </span>
    );

    lastIndex = start + text.length;
    commentIndex += 1;
  }

  if (lastIndex < value.length) {
    nodes.push(...renderJavaCodeSegment(value.slice(lastIndex), "java-code-tail"));
  }

  return nodes;
}

function getBasicJavaErrors(value: string): string[] {
  const errors: string[] = [];
  const lines = value.split(/\r?\n/);

  if (!/\bclass\s+Main\b/.test(value)) {
    errors.push('Missing `class Main` declaration.');
  }

  if (!/public\s+static\s+void\s+main\s*\(\s*String\[\]\s+\w+\s*\)/.test(value)) {
    errors.push("Missing a valid `public static void main(String[] args)` method.");
  }

  const braceOpens = (value.match(/\{/g) ?? []).length;
  const braceCloses = (value.match(/\}/g) ?? []).length;
  if (braceOpens !== braceCloses) {
    errors.push("Curly braces do not match.");
  }

  const parenOpens = (value.match(/\(/g) ?? []).length;
  const parenCloses = (value.match(/\)/g) ?? []).length;
  if (parenOpens !== parenCloses) {
    errors.push("Parentheses do not match.");
  }

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;
    if (
      line.endsWith(";") ||
      line.endsWith("{") ||
      line.endsWith("}") ||
      line.startsWith("if ") ||
      line.startsWith("if(") ||
      line.startsWith("for ") ||
      line.startsWith("for(") ||
      line.startsWith("while ") ||
      line.startsWith("while(") ||
      line.startsWith("switch ") ||
      line.startsWith("switch(") ||
      line.startsWith("else") ||
      /^@(?!interface\b)/.test(line) ||
      /^(class|public|private|protected)\b/.test(line)
    ) {
      continue;
    }
    if (
      /(System\.out\.[A-Za-z_]\w*|return\b|break\b|continue\b|new\s+[A-Za-z_]\w*|[A-Za-z_]\w*\s*=)/.test(line) &&
      !line.endsWith(";")
    ) {
      errors.push(`Line ${index + 1}: this statement may be missing a semicolon.`);
      break;
    }
  }

  return errors;
}

function getJavaAutoPair(key: string): string | null {
  if (key === "(") return ")";
  if (key === "[") return "]";
  if (key === "{") return "}";
  if (key === '"') return '"';
  if (key === "'") return "'";
  return null;
}

function javaProgramNeedsConsoleInput(value: string): boolean {
  return /Scanner\s*\([^)]*System\.in[^)]*\)/.test(value) && /\.next(Line|Int|Double|Float|Long|Boolean|Short|Byte)\s*\(/.test(value);
}

function extractJavaConsolePrompt(value: string): string {
  const match = value.match(/System\.out\.print(?:ln)?\(\s*"([^"]*)"\s*\)\s*;[\s\S]{0,400}?\.next(?:Line|Int|Double|Float|Long|Boolean|Short|Byte)\s*\(/);
  return match?.[1] ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildJavaConsoleTranscript(prompt: string, input: string, output: string): string {
  const trimmedInput = input.replace(/\r\n/g, "\n").replace(/\n+$/g, "");
  if (!prompt || !trimmedInput) return output;

  const firstInputLine = trimmedInput.split("\n")[0] ?? "";
  const promptPattern = new RegExp(`^${escapeRegExp(prompt)}`);

  if (promptPattern.test(output)) {
    return output.replace(promptPattern, `${prompt}${firstInputLine}\n`);
  }

  return `${prompt}${firstInputLine}\n${output}`;
}

function getHandsOnSubmittedText(question: HandsOnQuestion, answer: HandsOnAnswer): string {
  if (question.mode === "java_console") {
    return String(answer.java ?? "").trim();
  }
  const html = String(answer.html ?? "").trim();
  const css = String(answer.css ?? "").trim();
  return [html, css].filter(Boolean).join("\n\n").trim();
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
  mcMax: number;
  idScore: number;
  idMax: number;
  enumScore: number;
  enumMax: number;
  handsOnScore: number;
  handsOnMax: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
}

type SubmissionSource =
  | "manual_submit"
  | "auto_tab_switch"
  | "auto_close_tab"
  | "auto_time_expired";

type AttemptSavePayload = {
  quizId: string;
  studentName: string;
  studentId: string;
  score: number;
  maxScore: number;
  attemptNumber: number;
  attemptId?: string;
  answers: Record<string, unknown>;
  submissionSource: SubmissionSource;
};

interface QuizProps {
  topic: string;
  section: string;
  quizTitle: string;
  quizData: QuizData;
  /** When set (quiz taken by code), score is saved to student_quiz with this quizid and quiztbl.score is updated */
  quizId?: string | null;
  timeLimitMinutes?: number | null;
  allowRetake?: boolean;
  maxAttempts?: number;
  attemptsUsed?: number | null;
  attemptsRemaining?: number | null;
}

type QuizFlowItem =
  | {
      kind: "mc";
      id: string;
      question: MultipleChoiceQuestion;
      sectionLabel: string;
      setLabel: string;
      questionNumberInSection: number;
      sectionQuestionCount: number;
    }
  | {
      kind: "id";
      id: string;
      question: IdentificationQuestion;
      sectionLabel: string;
      setLabel: string;
      questionNumberInSection: number;
      sectionQuestionCount: number;
    }
	  | {
	      kind: "enum";
	      id: string;
	      question: EnumerationQuestion;
	      sectionLabel: string;
	      setLabel: string;
	      questionNumberInSection: number;
	      sectionQuestionCount: number;
	    }
	  | {
	      kind: "hands_on";
	      id: string;
	      question: HandsOnQuestion;
	      sectionLabel: string;
	      setLabel: string;
	      questionNumberInSection: number;
	      sectionQuestionCount: number;
	    };

const SECTION_MC = 0;
const SECTION_ID = 1;
const SECTION_ENUM = 2;
const SECTION_HANDS_ON = 3;

export default function Quiz({
  topic,
  section,
  quizTitle,
  quizData,
  quizId,
  timeLimitMinutes = null,
  allowRetake,
  maxAttempts,
  attemptsUsed: initialAttemptsUsed = null,
  attemptsRemaining: initialAttemptsRemaining = null,
}: QuizProps) {
		  const {
		    multipleChoice: multipleChoiceQuestions,
		    identification: identificationQuestions,
		    enumeration: enumerationQuestions = [],
		    programming: programmingSection,
		    handsOn: handsOnQuestions = [],
		  } = quizData;
			  const [studentFirstName, setStudentFirstName] = useState("");
		  const [studentLastName, setStudentLastName] = useState("");
		  const [studentId, setStudentId] = useState("");
		  const [studentLocked, setStudentLocked] = useState(false);
		  const [identityLocked, setIdentityLocked] = useState(false);
			  const [mcAnswers, setMcAnswers] = useState<Record<string, string>>({});
			  const [idAnswers, setIdAnswers] = useState<Record<string, string>>({});
			  const [enumAnswers, setEnumAnswers] = useState<Record<string, string>>({});
			  const [handsOnAnswers, setHandsOnAnswers] = useState<Record<string, HandsOnAnswer>>({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<QuizResults | null>(null);
  const [tabLeft, setTabLeft] = useState(false);
  const [submissionSource, setSubmissionSource] = useState<SubmissionSource>("manual_submit");
  const [currentPage, setCurrentPage] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recoveryRequestLoading, setRecoveryRequestLoading] = useState(false);
  const [recoveryRequestStatus, setRecoveryRequestStatus] = useState<"idle" | "pending" | "approved">("idle");
  const [recoveryRequestMessage, setRecoveryRequestMessage] = useState<string>("");
  const [attemptSaveReady, setAttemptSaveReady] = useState(false);
  const [restrictionNotice, setRestrictionNotice] = useState<string | null>(null);
	  const restrictionTimerRef = useRef<number | null>(null);
	  const [showDeadlineSubmitModal, setShowDeadlineSubmitModal] = useState(false);
	  const [deadlineSubmitLoading, setDeadlineSubmitLoading] = useState(false);
  const [pendingForcedSubmit, setPendingForcedSubmit] = useState<AttemptSavePayload | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const autoSubmitRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const closeIntentRef = useRef(false);
		  const resolvedMaxAttempts =
		    Number.isFinite(maxAttempts) && (maxAttempts ?? 0) > 0 ? (maxAttempts as number) : 1;
		  const resolvedAllowRetake = allowRetake === true || resolvedMaxAttempts > 1;
		  const [maxAttemptsState, setMaxAttemptsState] = useState<number>(resolvedMaxAttempts);
		  const [attemptsUsedInfo, setAttemptsUsedInfo] = useState<number | null>(initialAttemptsUsed);
		  const [attemptsRemainingInfo, setAttemptsRemainingInfo] = useState<number | null>(initialAttemptsRemaining);
		  const backHref = studentLocked ? "/student" : "/";
		  const inputsLocked = identityLocked || studentLocked;

	  const hasMc = multipleChoiceQuestions.length > 0;
	  const hasId = identificationQuestions.length > 0;
		  const hasEnum = enumerationQuestions.length > 0;
		  const hasHandsOn = handsOnQuestions.length > 0 || !!programmingSection;

	  const enterFocusMode = useCallback(async () => {
	    try {
	      if (typeof document === "undefined") return;
	      if (document.fullscreenElement) return;
	      const el = document.documentElement;
	      if (el?.requestFullscreen) {
	        await el.requestFullscreen();
	      }
	    } catch {
	      // Fullscreen can fail depending on browser settings; ignore.
	    }
	  }, []);

	  const exitFocusMode = useCallback(async () => {
	    try {
	      if (typeof document === "undefined") return;
	      if (!document.fullscreenElement) return;
	      if (document.exitFullscreen) {
	        await document.exitFullscreen();
	      }
	    } catch {
	      // Ignore
	    }
	  }, []);

	  const orderSeedKey = useMemo(() => {
	    if (!started || submitted) return null;
	    if (attemptId) return `attempt:${attemptId}`;
	    const sid = sanitizeStudentId(studentId.trim());
	    const base = quizId ? `quiz:${quizId}` : `topic:${topic}`;
	    const aNum = attemptNumber ?? 0;
	    return `${base}:student:${sid || "anon"}:attempt:${aNum}`;
	  }, [started, submitted, attemptId, quizId, topic, studentId, attemptNumber]);

	  const mcRenderQuestions = useMemo(
	    () =>
	      orderSeedKey ? seededShuffle(multipleChoiceQuestions, `${orderSeedKey}:mc`) : multipleChoiceQuestions,
	    [multipleChoiceQuestions, orderSeedKey]
	  );
	  const idRenderQuestions = useMemo(
	    () =>
	      orderSeedKey ? seededShuffle(identificationQuestions, `${orderSeedKey}:id`) : identificationQuestions,
	    [identificationQuestions, orderSeedKey]
	  );
		  const enumRenderQuestions = useMemo(
		    () =>
		      orderSeedKey ? seededShuffle(enumerationQuestions, `${orderSeedKey}:enum`) : enumerationQuestions,
		    [enumerationQuestions, orderSeedKey]
		  );
		  const handsOnRenderQuestions = useMemo(
		    () =>
		      orderSeedKey ? seededShuffle(handsOnQuestions, `${orderSeedKey}:hands_on`) : handsOnQuestions,
		    [handsOnQuestions, orderSeedKey]
		  );
	  const sectionOrder = useMemo(
	    () => [
	      ...(hasMc ? [SECTION_MC] : []),
	      ...(hasId ? [SECTION_ID] : []),
	      ...(hasEnum ? [SECTION_ENUM] : []),
	      ...(hasHandsOn ? [SECTION_HANDS_ON] : []),
	    ],
	    [hasMc, hasId, hasEnum, hasHandsOn]
	  );
		  const attemptsLimit = quizId ? maxAttemptsState : resolvedMaxAttempts;
	  const displayCurrentAttempt =
	    quizId && started
	      ? typeof attemptNumber === "number"
	        ? attemptNumber
	        : typeof attemptsUsedInfo === "number"
	          ? attemptsUsedInfo + 1
	          : null
	      : null;
	  const remainingAfterSubmit =
	    quizId && started && typeof displayCurrentAttempt === "number"
	      ? Math.max(0, attemptsLimit - displayCurrentAttempt)
	      : null;

	  const refreshAttemptsInfo = useCallback(async () => {
	    if (!quizId) return;
	    try {
	      const res = await fetch(`/api/quiz-by-code?code=${encodeURIComponent(topic)}`, {
	        credentials: "include",
	      });
	      if (!res.ok) return;
	      const data = (await res.json().catch(() => null)) as
	        | { quiz?: { attemptsUsed?: number | null; attemptsRemaining?: number | null; max_attempts?: number | null } }
	        | null;
	      const used = data?.quiz?.attemptsUsed;
		      const remaining = data?.quiz?.attemptsRemaining;
		      if (typeof used === "number") setAttemptsUsedInfo(used);
		      if (typeof remaining === "number") setAttemptsRemainingInfo(clampRemainingAttempts(remaining));
	      const nextMax = Number(data?.quiz?.max_attempts);
	      if (Number.isFinite(nextMax) && nextMax > 0) setMaxAttemptsState(nextMax);
	    } catch {
	      // ignore
	    }
	  }, [quizId, topic]);

  const resultParts = useMemo(() => {
    return sectionOrder.map((sectionConst, index) => {
      if (sectionConst === SECTION_MC) {
        return {
          key: "mc",
          label: `Part ${index + 1}: Multiple Choice`,
          score: results?.mcScore ?? 0,
          max: results?.mcMax ?? 0,
          isNotice: false,
        };
      }

	      if (sectionConst === SECTION_ID) {
	        return {
	          key: "id",
	          label: `Part ${index + 1}: Identification`,
	          score: results?.idScore ?? 0,
	          max: results?.idMax ?? 0,
	          isNotice: false,
	        };
	      }

	      if (sectionConst === SECTION_HANDS_ON) {
	        return {
	          key: "hands_on",
	          label: `Part ${index + 1}: Hands on Coding`,
	          score: 0,
	          max: 0,
	          isNotice: true,
	        };
	      }

      return {
        key: "enum",
        label: `Part ${index + 1}: Enumeration`,
        score: results?.enumScore ?? 0,
        max: results?.enumMax ?? 0,
        isNotice: false,
      };
    });
	  }, [sectionOrder, results]);

  const questionFlow = useMemo<QuizFlowItem[]>(() => {
    const groups = sectionOrder.map((sectionConst, sectionIndex) => {
      const setLabel = String.fromCharCode(65 + sectionIndex);

      if (sectionConst === SECTION_MC) {
        return mcRenderQuestions.map((question, questionIndex) => ({
          kind: "mc" as const,
          id: question.id,
          question,
          sectionLabel: "Multiple Choice",
          setLabel,
          questionNumberInSection: questionIndex + 1,
          sectionQuestionCount: mcRenderQuestions.length,
        }));
      }

      if (sectionConst === SECTION_ID) {
        return idRenderQuestions.map((question, questionIndex) => ({
          kind: "id" as const,
          id: question.id,
          question,
          sectionLabel: "Identification",
          setLabel,
          questionNumberInSection: questionIndex + 1,
          sectionQuestionCount: idRenderQuestions.length,
        }));
      }

	      if (sectionConst === SECTION_HANDS_ON) {
	        if (programmingSection && handsOnRenderQuestions.length === 0) {
	          return [
	            {
	              kind: "hands_on" as const,
	              id: "programming-section",
	              question: {
	                id: "programming-section",
	                question: programmingSection.problem,
	                rubric: programmingSection.instructions,
	              },
	              sectionLabel: "Hands on Coding",
	              setLabel,
	              questionNumberInSection: 1,
	              sectionQuestionCount: 1,
	            },
	          ];
	        }

	        return handsOnRenderQuestions.map((question, questionIndex) => ({
	          kind: "hands_on" as const,
	          id: question.id,
	          question,
	          sectionLabel: "Hands on Coding",
	          setLabel,
	          questionNumberInSection: questionIndex + 1,
	          sectionQuestionCount: handsOnRenderQuestions.length,
	        }));
	      }

      return enumRenderQuestions.map((question, questionIndex) => ({
        kind: "enum" as const,
        id: question.id,
        question,
        sectionLabel: "Enumeration",
        setLabel,
        questionNumberInSection: questionIndex + 1,
        sectionQuestionCount: enumRenderQuestions.length,
      }));
    });

    return groups.flat();
	  }, [sectionOrder, mcRenderQuestions, idRenderQuestions, enumRenderQuestions, handsOnRenderQuestions, programmingSection]);

  const totalQuestions = questionFlow.length;
  const currentQuestion = totalQuestions > 0 && currentPage < totalQuestions ? questionFlow[currentPage]! : null;

	  useEffect(() => {
	    if (submitError) errorRef.current?.scrollIntoView({ behavior: "smooth" });
	  }, [submitError]);

	  const showRestriction = useCallback((message: string) => {
	    setRestrictionNotice(message);
	    if (typeof window === "undefined") return;
	    if (restrictionTimerRef.current) window.clearTimeout(restrictionTimerRef.current);
	    restrictionTimerRef.current = window.setTimeout(() => setRestrictionNotice(null), 2500);
	  }, []);

	  useEffect(() => {
	    return () => {
	      if (typeof window === "undefined") return;
	      if (restrictionTimerRef.current) window.clearTimeout(restrictionTimerRef.current);
	    };
	  }, []);

	  const blockIfInQuiz = useCallback(
	    (e: React.SyntheticEvent, message: string) => {
	      if (!started || submitted) return;
	      e.preventDefault();
	      showRestriction(message);
	    },
	    [started, submitted, showRestriction]
	  );

	  useEffect(() => {
	    if (!started || submitted) return;
	    const onKeyDown = (e: KeyboardEvent) => {
	      const key = String(e.key ?? "").toLowerCase();
	      const combo = e.ctrlKey || e.metaKey;
	      if (!combo) return;
	      if (key === "c" || key === "v" || key === "x") {
	        e.preventDefault();
	        showRestriction("Copy/paste is disabled during the quiz.");
	        return;
	      }
	      if (key === "p" || key === "s") {
	        e.preventDefault();
	        showRestriction("This shortcut is disabled during the quiz.");
	      }
	    };
	    window.addEventListener("keydown", onKeyDown, true);
	    return () => window.removeEventListener("keydown", onKeyDown, true);
	  }, [started, submitted, showRestriction]);

	  useEffect(() => {
	    if (typeof document === "undefined") return;
	    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
	    document.addEventListener("fullscreenchange", onChange);
	    onChange();
	    return () => document.removeEventListener("fullscreenchange", onChange);
	  }, []);

		  useEffect(() => {
		    let cancelled = false;
		    (async () => {
	      try {
	        const res = await fetch("/api/student-me", { credentials: "include" });
	        if (!res.ok) return;
	        const data = (await res.json().catch(() => null)) as
	          | { ok?: boolean; student?: { name?: string; studentId?: string } }
	          | null;
	        if (cancelled || !data?.ok || !data.student?.name) return;

	        const full = String(data.student.name).trim();
	        const tokens = full.split(/\s+/).filter(Boolean);
	        const last = tokens.length > 1 ? tokens[tokens.length - 1]! : "";
	        const first = tokens.length > 1 ? tokens.slice(0, -1).join(" ") : (tokens[0] ?? "");
		        if (!studentFirstName.trim()) setStudentFirstName(first);
		        if (!studentLastName.trim()) setStudentLastName(last);
		        const sid = String(data.student.studentId ?? "").trim();
		        if (sid && !studentId.trim()) setStudentId(sanitizeStudentId(sid));
		        setStudentLocked(true);
		        setIdentityLocked(true);
		      } catch {
		        // Ignore if not logged in.
		      }
		    })();
		    return () => {
	      cancelled = true;
	    };
	    // eslint-disable-next-line react-hooks/exhaustive-deps
		  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!started || submitted) return;

    const originalOpen = window.open;
    window.open = () => null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const metaOrCtrl = e.ctrlKey || e.metaKey;
      if (
        (metaOrCtrl && (key === "t" || key === "n")) ||
        (metaOrCtrl && e.shiftKey && key === "n")
      ) {
        e.preventDefault();
      }
    };

    const handleClickCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const opensNewTab =
        anchor.target === "_blank" || e.ctrlKey || e.metaKey || e.button === 1;
      if (opensNewTab) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleAuxClickCapture = (e: MouseEvent) => {
      if (e.button !== 1) return;
      handleClickCapture(e);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClickCapture, true);
    document.addEventListener("auxclick", handleAuxClickCapture, true);

    return () => {
      window.open = originalOpen;
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClickCapture, true);
      document.removeEventListener("auxclick", handleAuxClickCapture, true);
    };
  }, [started, submitted]);

	  const getUnansweredQuestions = useCallback((): number[] => {
	    return questionFlow
	      .map((item, index) => {
	        if (item.kind === "mc") return !(mcAnswers[item.id] || "").trim() ? index : -1;
	        if (item.kind === "id") return !(idAnswers[item.id] || "").trim() ? index : -1;
	        if (item.kind === "enum") return !(enumAnswers[item.id] || "").trim() ? index : -1;
	        if (item.kind === "hands_on") {
	          const answer = getEffectiveHandsOnAnswer(item.question, handsOnAnswers[item.id]);
	          if (answer.mode === "java_console") {
	            return !answer.java.trim() ? index : -1;
	          }
	          return !(answer?.html?.trim() || answer?.css?.trim()) ? index : -1;
	        }
	        return -1;
	      })
	      .filter((index) => index >= 0);
	  }, [questionFlow, mcAnswers, idAnswers, enumAnswers, handsOnAnswers]);

  const getFullName = useCallback(() => {
    const first = studentFirstName.trim();
    const last = studentLastName.trim();
    return `${first} ${last}`.trim();
  }, [studentFirstName, studentLastName]);

	  const handleStart = async () => {
	    setSubmitError(null);
    if (!studentFirstName.trim()) {
      setSubmitError("Please enter your first name.");
      setCurrentPage(0);
      return;
    }
    if (!studentLastName.trim()) {
      setSubmitError("Please enter your last name.");
      setCurrentPage(0);
      return;
    }
    if (!studentId.trim()) {
      setSubmitError("Please enter your student ID.");
      setCurrentPage(0);
      return;
    }
	    if (!quizId) {
	      await enterFocusMode();
	      setStarted(true);
	      return;
	    }
	    setStartLoading(true);
	    try {
	      const lockedId = sanitizeStudentId(studentId.trim());
	      if (lockedId !== studentId.trim()) setStudentId(lockedId);
	      const res = await fetch("/api/quiz-start", {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({
	          quizId,
	          studentName: getFullName(),
	          studentId: lockedId,
	        }),
	      });
	      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Unable to start quiz");
        return;
      }
      setAttemptId(data.attemptId ?? null);
      setAttemptNumber(data.attemptNumber ?? null);
      const nextMax = Number(data.maxAttempts);
      if (Number.isFinite(nextMax)) setMaxAttemptsState(nextMax);
	      if (data.expiresAt) {
	        setExpiresAt(data.expiresAt);
	      } else if (timeLimitMinutes) {
	        const localExpires = new Date(Date.now() + timeLimitMinutes * 60 * 1000).toISOString();
	        setExpiresAt(localExpires);
	      } else {
	        setExpiresAt(null);
	      }
		      const used = Number((data as { attemptsUsed?: unknown }).attemptsUsed);
		      const remaining = Number((data as { attemptsRemaining?: unknown }).attemptsRemaining);
		      if (Number.isFinite(used) && used >= 0) setAttemptsUsedInfo(Math.trunc(used));
		      if (Number.isFinite(remaining)) setAttemptsRemainingInfo(clampRemainingAttempts(remaining));
	      const restoredAnswers = (data as { restoredAnswers?: Record<string, unknown> | null }).restoredAnswers;
	      if (restoredAnswers && typeof restoredAnswers === "object") {
	        setMcAnswers(extractSavedAnswerMap(restoredAnswers.multiple_choice));
	        setIdAnswers(extractSavedAnswerMap(restoredAnswers.identification));
	        setEnumAnswers(extractSavedAnswerMap(restoredAnswers.enumeration));
	        setHandsOnAnswers(extractSavedHandsOnMap(restoredAnswers.hands_on));
	      }
		      setIdentityLocked(true);
		      autoSubmitRef.current = false;
		      await enterFocusMode();
	      setStarted(true);
	    } catch {
	      setSubmitError("Unable to start quiz");
	    } finally {
	      setStartLoading(false);
    }
  };

	  const saveAttempt = useCallback(async (payload: AttemptSavePayload) => {
	    const res = await fetch("/api/student-attempts", {
	      method: "POST",
	      headers: { "Content-Type": "application/json" },
	      body: JSON.stringify({
	        ...payload,
	      }),
	    });
	    if (res.ok) return { ok: true as const };
	    const errorData = await res.json().catch(() => ({}));
	    const errorMessage = typeof errorData.error === "string" ? errorData.error : "Failed to save attempt.";
	    return {
      ok: false as const,
      errorMessage,
      deadlinePassed: errorMessage.toLowerCase().includes("deadline has passed"),
    };
  }, []);

  const gradeQuiz = useCallback(async (source: SubmissionSource = "manual_submit") => {
    const name = getFullName();
    const id = studentId.trim();
    if (!id) {
      setSubmitError("Please enter your student ID.");
      setCurrentPage(0);
      return;
    }
    if (!studentFirstName.trim()) {
      setSubmitError("Please enter your first name.");
      setCurrentPage(0);
      return;
    }
    if (!studentLastName.trim()) {
      setSubmitError("Please enter your last name.");
      setCurrentPage(0);
      return;
    }

    let currentAttempts = 0;
    let nextAttemptNumber = 1;
    if (quizId) {
      if (!started || !attemptNumber) {
        setSubmitError("Please start the quiz first.");
        setCurrentPage(0);
        return;
      }
      nextAttemptNumber = attemptNumber;
    } else {
      currentAttempts = getAttemptCount(topic, section, id);
      if (currentAttempts >= resolvedMaxAttempts) {
        const msg = resolvedMaxAttempts === 1
          ? "You've used your only attempt for this quiz. You cannot retake it."
          : `You've used all ${resolvedMaxAttempts} attempts for this quiz. You cannot retake it.`;
        setSubmitError(msg);
        setCurrentPage(0);
        return;
      }
      nextAttemptNumber = currentAttempts + 1;
    }

    let mcScore = 0;
    for (const q of multipleChoiceQuestions) {
      if (normalizeAnswer(mcAnswers[q.id] || "") === normalizeAnswer(q.correct)) {
        mcScore += getQuestionScore(q.score, 1);
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
          idScore += getQuestionScore(q.score, 1);
        }
      } else if (checkIdentification(userAnswer, q.correct)) {
        idScore += getQuestionScore(q.score, 1);
      }
    }

	    let enumPoints = 0;
	    for (const q of enumerationQuestions) {
	      const userItems = parseEnumerationInput(enumAnswers[q.id] || "");
	      const matched = checkEnumerationMatch(userItems, q.correct);
	      const expected = q.correct.length;
	      const questionScore = getQuestionScore(q.score, 1);
	      if (expected > 0) {
	        enumPoints += questionScore === expected ? matched : matched / expected >= 0.8 ? questionScore : 0;
	      }
	    }

	    const mcMax = multipleChoiceQuestions.reduce((sum, q) => sum + getQuestionScore(q.score, 1), 0);
	    const idMax = identificationQuestions.reduce((sum, q) => sum + getQuestionScore(q.score, 1), 0);
		    const enumMax = enumerationQuestions.reduce((sum, q) => {
		      const expected = q.correct.length;
		      const questionScore = getQuestionScore(q.score, 1);
		      if (questionScore === expected && expected > 0) return sum + expected;
		      return sum + questionScore;
		    }, 0);
	    let handsOnScore = 0;
	    for (const item of questionFlow) {
	      if (item.kind !== "hands_on") continue;
	      const answer = getEffectiveHandsOnAnswer(item.question, handsOnAnswers[item.id]);
	      const submitted = getHandsOnSubmittedText(item.question, answer);
	      const answerKey = String(item.question.answerKey ?? "").trim();
	      if (submitted && answerKey && normalizeAnswer(submitted) === normalizeAnswer(answerKey)) {
	        handsOnScore += getQuestionScore(item.question.score, 1);
	      }
	    }
		    const handsOnMax = questionFlow.reduce((sum, item) => {
		      if (item.kind !== "hands_on") return sum;
		      return sum + getQuestionScore(item.question.score, 1);
		    }, 0);
			    const maxScore = mcMax + idMax + enumMax + handsOnMax;
			    const totalScore = mcScore + idScore + enumPoints + handsOnScore;
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    const attempts = quizId ? nextAttemptNumber : incrementAttemptCount(topic, section, id);
    const answersPayload = {
      multiple_choice: Object.entries(mcAnswers).map(([questionId, answer]) => ({
        questionId,
        answer,
      })),
      identification: Object.entries(idAnswers).map(([questionId, answer]) => ({
        questionId,
        answer,
      })),
	      enumeration: Object.entries(enumAnswers).map(([questionId, answer]) => ({
	        questionId,
	        answer,
	      })),
	      hands_on: questionFlow
	        .filter((item): item is Extract<QuizFlowItem, { kind: "hands_on" }> => item.kind === "hands_on")
	        .map((item) => {
	          const answer = getEffectiveHandsOnAnswer(item.question, handsOnAnswers[item.id]);
	          return {
	            questionId: item.id,
	            mode: answer.mode,
	            html: answer.html,
	            css: answer.css,
	            java: answer.java,
	            consoleOutput: answer.consoleOutput,
	            answer: answer.mode === "java_console" ? answer.consoleOutput : buildHandsOnPreviewDoc(answer.html, answer.css),
	          };
	        }),
	    };

    setResults({
      studentName: name,
      section,
      attempts,
      mcScore,
      mcMax,
	      idScore,
	      idMax,
	      enumScore: enumPoints,
	      enumMax,
	      handsOnScore,
	      handsOnMax,
	      totalScore,
	      maxScore,
	      percentage,
    });
	    setSubmissionSource(source);
	    setSubmitted(true);
      setAttemptSaveReady(false);

	    // Save attempt and update score if this is the best attempt for this student
	    if (quizId) {
      if (!supabase) {
        // Supabase client isn't available (e.g. during static prerender); skip saving.
        console.warn("Supabase client not available; skipping score save.");
      } else {
        // Save the attempt record and let the API handle the best score logic
        (async () => {
          try {
            const payload: AttemptSavePayload = {
              quizId,
              studentName: name,
              studentId: id,
              score: totalScore,
              maxScore,
              attemptNumber: nextAttemptNumber,
              attemptId: attemptId ?? undefined,
              answers: answersPayload,
              submissionSource: source,
            };
		            const result = await saveAttempt(payload);
		            if (!result.ok) {
                  setAttemptSaveReady(false);
		              if (result.deadlinePassed) {
		                setSubmitError("Quiz deadline has passed. Submission is closed.");
		                return;
		              }
		              console.error("Failed to save attempt:", result.errorMessage);
                  setRecoveryRequestMessage(result.errorMessage);
		            } else {
                  setAttemptSaveReady(true);
		              void refreshAttemptsInfo();
		            }
		          } catch (err) {
		            console.error("Error saving attempt:", err);
                setAttemptSaveReady(false);
		          }
		        })();
		      }
		    }
	  }, [topic, getFullName, studentFirstName, studentLastName, studentId, section, mcAnswers, idAnswers, enumAnswers, handsOnAnswers, questionFlow, multipleChoiceQuestions, identificationQuestions, enumerationQuestions, quizId, attemptId, attemptNumber, started, saveAttempt, refreshAttemptsInfo]);

  useEffect(() => {
    if (!expiresAt || submitted) {
      setTimeLeft(null);
      return;
    }
    autoSubmitRef.current = false;
    const tick = () => {
      const diffMs = new Date(expiresAt).getTime() - Date.now();
      const secondsLeft = Math.max(0, Math.ceil(diffMs / 1000));
      setTimeLeft(secondsLeft);
      if (diffMs <= 0 && !autoSubmitRef.current) {
        autoSubmitRef.current = true;
        setTabLeft(true);
        gradeQuiz("auto_time_expired");
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, submitted, gradeQuiz]);

  useEffect(() => {
    closeIntentRef.current = false;
    const triggerAutoSubmit = () => {
      if (submitted || (quizId && !started) || autoSubmitRef.current) return;
      autoSubmitRef.current = true;
      setTabLeft(true);
      gradeQuiz(closeIntentRef.current ? "auto_close_tab" : "auto_tab_switch");
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        triggerAutoSubmit();
      }
    };

    const handleWindowBlur = () => {
      if (Date.now() < ignoreAutoSubmitUntil) {
        return;
      }
      window.setTimeout(() => {
        const active = document.activeElement;
        if (
          active instanceof HTMLIFrameElement &&
          String(active.title ?? "").startsWith("Hands-on preview ")
        ) {
          return;
        }
        triggerAutoSubmit();
      }, 0);
    };

    const handleBeforeUnload = () => {
      closeIntentRef.current = true;
    };

    const handlePageHide = () => {
      closeIntentRef.current = true;
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
		  }, [submitted, gradeQuiz]);

	  useEffect(() => {
	    if (!submitted) return;
	    void exitFocusMode();
	  }, [submitted, exitFocusMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setShowSubmitConfirm(false);
    if (currentPage < totalQuestions - 1) {
      setCurrentPage((p) => Math.min(totalQuestions - 1, p + 1));
      return;
    }
    if (!studentFirstName.trim()) {
      setSubmitError("Please enter your first name.");
      setCurrentPage(0);
      return;
    }
    if (!studentLastName.trim()) {
      setSubmitError("Please enter your last name.");
      setCurrentPage(0);
      return;
    }
    if (!studentId.trim()) {
      setSubmitError("Please enter your student ID.");
      setCurrentPage(0);
      return;
    }
    if (quizId && !started) {
      setSubmitError("Please start the quiz first.");
      setCurrentPage(0);
      return;
    }
    const unansweredQuestions = getUnansweredQuestions();
    if (unansweredQuestions.length > 0) {
      const firstQuestion = unansweredQuestions[0]!;
      setCurrentPage(firstQuestion);
      setSubmitError(`Please answer all questions. Question ${firstQuestion + 1} is still unanswered.`);
      return;
    }
    setShowSubmitConfirm(true);
  };

	  const handleForceSubmitAfterDeadline = async () => {
	    if (!pendingForcedSubmit) return;
	    setDeadlineSubmitLoading(true);
	    try {
	      const result = await saveAttempt(pendingForcedSubmit);
	      if (!result.ok) {
	        setSubmitError(result.errorMessage);
	      } else {
	        setShowDeadlineSubmitModal(false);
	        setPendingForcedSubmit(null);
      }
    } catch {
      setSubmitError("Failed to submit after deadline.");
    } finally {
      setDeadlineSubmitLoading(false);
    }
	  };

  const handleRequestRecovery = useCallback(async () => {
    if (!quizId || !attemptId) {
      setRecoveryRequestMessage("This attempt cannot be recovered because its saved attempt ID is missing.");
      return;
    }
    if (!attemptSaveReady) {
      setRecoveryRequestMessage("Please wait a moment. Your auto-submitted attempt is still being saved.");
      return;
    }
    setRecoveryRequestLoading(true);
    setRecoveryRequestMessage("");
    try {
      const res = await fetch("/api/student-attempt-recovery-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ attemptId, submissionSource }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) {
        setRecoveryRequestMessage(data.error ?? "Failed to send recovery request.");
        return;
      }
      const status = String(data.status ?? "pending").trim().toLowerCase();
      if (status === "approved") {
        setRecoveryRequestStatus("approved");
        setRecoveryRequestMessage("Recovery already approved. Open the quiz from the dashboard to continue with your saved answers.");
      } else {
        setRecoveryRequestStatus("pending");
        setRecoveryRequestMessage("Recovery request sent. Wait for your teacher to approve it, then reopen the quiz to continue.");
      }
    } catch {
      setRecoveryRequestMessage("Failed to send recovery request.");
    } finally {
      setRecoveryRequestLoading(false);
    }
  }, [quizId, attemptId, attemptSaveReady, submissionSource]);

  if (submitted && results) {
	  return (
	    <div
	      className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 md:p-10"
	      onContextMenu={(e) => blockIfInQuiz(e, "Right-click is disabled during the quiz.")}
	      onCopy={(e) => blockIfInQuiz(e, "Copy is disabled during the quiz.")}
	      onCut={(e) => blockIfInQuiz(e, "Cut is disabled during the quiz.")}
	      onPaste={(e) => blockIfInQuiz(e, "Paste is disabled during the quiz.")}
	    >
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
            <p className="text-center text-slate-500 text-sm mb-2">
              Submission:{" "}
              {submissionSource === "manual_submit"
                ? "Manual submit"
                : submissionSource === "auto_close_tab"
                  ? "Auto submit (tab/browser closed)"
                  : submissionSource === "auto_time_expired"
                    ? "Auto submit (time expired)"
                    : "Auto submit (tab/window changed)"}
            </p>
            {tabLeft && (
              <p className="text-center text-slate-500 text-sm mb-8">
                Attempt {results.attempts} of {attemptsLimit}
              </p>
            )}

            <div className="grid gap-4 mb-8">
	              {resultParts.map((part) =>
	                part.isNotice ? (
	                  <div key={part.key} className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
	                    <span className="text-slate-300">{part.label}</span>
	                    <p className="text-amber-200 text-sm mt-2">Your code was submitted and is waiting for manual review.</p>
	                  </div>
	                ) : (
                  <div key={part.key} className="flex justify-between items-center p-4 rounded-xl bg-slate-700/50">
                    <span className="text-slate-300">{part.label}</span>
                    <span className="font-bold text-emerald-400">{part.score} / {part.max}</span>
                  </div>
                )
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
	              {tabLeft && results.attempts >= attemptsLimit && (
	                <div className="p-4 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-200 text-center">
		                  <p className="font-semibold">You&apos;ve used all {attemptsLimit} attempts. You cannot retake this quiz.</p>
	                </div>
	              )}
                {tabLeft && quizId && isAutoSubmissionSource(submissionSource) && (
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-center">
                    <p className="text-sm font-semibold text-cyan-100">
                      Need to continue from your recent saved answers?
                    </p>
                    <p className="mt-1 text-xs text-slate-300">
                      Request recovery so your teacher can reopen this exact attempt with your saved answers and remaining time.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleRequestRecovery()}
                      disabled={recoveryRequestLoading || recoveryRequestStatus === "pending" || !attemptSaveReady}
                      className="mt-3 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                    >
                      {recoveryRequestLoading
                        ? "Requesting..."
                        : !attemptSaveReady
                          ? "Finalizing Auto Submit..."
                        : recoveryRequestStatus === "pending"
                          ? "Recovery Requested"
                          : "Request Recovery"}
                    </button>
                    {recoveryRequestMessage ? (
                      <p className="mt-3 text-xs text-cyan-100">{recoveryRequestMessage}</p>
                    ) : null}
                  </div>
                )}
	              <div className="flex gap-4">
		                <Link
		                  href={backHref}
		                  className="flex-1 py-3 px-6 rounded-xl bg-slate-600 hover:bg-slate-500 text-white font-semibold text-center transition-colors"
		                >
                  ← Back to Home
                </Link>
		                {tabLeft && results.attempts < attemptsLimit && !quizId && (
		                  <button
		                    onClick={() => {
		                      autoSubmitRef.current = false;
	                      closeIntentRef.current = false;
	                      setSubmitted(false);
	                      setShowSubmitConfirm(false);
	                      setStarted(false);
	                      setAttemptId(null);
	                      setAttemptNumber(null);
	                      setExpiresAt(null);
	                      setTimeLeft(null);
	                      setRestrictionNotice(null);
	                      void refreshAttemptsInfo();
	                      setResults(null);
	                      setSubmissionSource("manual_submit");
	                      setMcAnswers({});
	                      setIdAnswers({});
	                      setEnumAnswers({});
	                      setTabLeft(false);
	                      setSubmitError(null);
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
        {showDeadlineSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-600 bg-slate-800 p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-100 mb-2">Deadline Reached</h3>
              <p className="text-slate-300 mb-6">
                The quiz deadline has passed. Your current answers can still be submitted now.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (deadlineSubmitLoading) return;
                    setShowDeadlineSubmitModal(false);
                    setPendingForcedSubmit(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleForceSubmitAfterDeadline}
                  disabled={deadlineSubmitLoading}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
                >
                  {deadlineSubmitLoading ? "Submitting..." : "Submit Current Answers"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
	          <Link href={backHref} className="text-slate-500 hover:text-cyan-400 text-sm mb-2 inline-block">← Back</Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            {quizTitle} Quiz
          </h1>
          <p className="text-slate-400 mt-2">Stay on this tab — switching tabs will auto-submit</p>
          {restrictionNotice && (
            <p className="mt-2 text-sm text-amber-300">{restrictionNotice}</p>
          )}
	          {quizId && (
	            <p className="text-slate-400 text-sm mt-2">
	              {typeof clampRemainingAttempts(attemptsRemainingInfo) === "number" && typeof attemptsUsedInfo === "number" ? (
	                <>
	                  Attempts: <span className="text-slate-100 font-semibold">{attemptsUsedInfo}</span>/
	                  <span className="text-slate-100 font-semibold">{attemptsLimit}</span>{" "}
	                  <span className="text-slate-500">
	                    (remaining{" "}
	                    <span className="text-slate-200 font-semibold">{clampRemainingAttempts(attemptsRemainingInfo)}</span>
	                    )
	                  </span>
	                </>
              ) : (
                <>
                  Attempts allowed: <span className="text-slate-100 font-semibold">{attemptsLimit}</span>
                </>
              )}
              {started && typeof displayCurrentAttempt === "number" && (
                <>
                  {" "}
                  · Current attempt{" "}
                  <span className="text-slate-100 font-semibold">{displayCurrentAttempt}</span>/
                  <span className="text-slate-100 font-semibold">{attemptsLimit}</span>
                  {typeof remainingAfterSubmit === "number" ? (
                    <span className="text-slate-500">
                      {" "}
                      (left after submit{" "}
                      <span className="text-slate-200 font-semibold">{remainingAfterSubmit}</span>)
                    </span>
                  ) : null}
                </>
              )}
            </p>
          )}
          {started && totalQuestions > 0 ? (
            <p className="text-slate-500 text-sm mt-1">Question {currentPage + 1} of {totalQuestions}</p>
          ) : (
            <p className="text-slate-500 text-sm mt-1">Section {section}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!started && (
            <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-4 md:p-6 shadow-2xl space-y-4">
            <div>
              <label className="block text-slate-300 font-medium mb-2">First Name</label>
		              <input
		                type="text"
		                value={studentFirstName}
		                onChange={(e) => setStudentFirstName(e.target.value)}
		                disabled={inputsLocked}
		                placeholder="Enter your first name..."
		                className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
		              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-2">Last Name</label>
		              <input
		                type="text"
		                value={studentLastName}
		                onChange={(e) => setStudentLastName(e.target.value)}
		                disabled={inputsLocked}
		                placeholder="Enter your last name..."
		                className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
		              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-2">Student ID</label>
		              <input
		                type="text"
		                value={studentId}
		                onChange={(e) => setStudentId(sanitizeStudentId(e.target.value))}
		                disabled={inputsLocked}
		                placeholder="Enter your student ID..."
		                className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
		              />
	            </div>
	            {studentLocked && (
	              <p className="text-slate-500 text-xs">Using your student profile details.</p>
	            )}
	            {quizId && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={startLoading || started}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
                >
                  {started ? "Quiz Started" : startLoading ? "Starting..." : "Start Quiz"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (typeof document === "undefined") return;
                    try {
                      if (!document.fullscreenElement) {
                        await document.documentElement.requestFullscreen();
                      } else {
                        await document.exitFullscreen();
                      }
                    } catch {
                      // Ignore fullscreen errors (browser or permissions).
                    }
                  }}
                  disabled={Boolean(quizId) && !started}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-semibold"
                >
                  {isFullscreen ? "Exit Focus Mode" : "Focus Mode"}
                </button>
                <span className="text-slate-400 text-sm">
                  Attempts allowed: {attemptsLimit}
                </span>
                {timeLimitMinutes ? (
                  <span className="text-slate-400 text-sm">Time limit: {timeLimitMinutes} min</span>
                ) : (
                  <span className="text-slate-400 text-sm">No time limit</span>
                )}
                {started && timeLeft !== null && (
                  <span className={`text-sm font-semibold ${timeLeft <= 30 ? "text-amber-300" : "text-cyan-300"}`}>
                    Time left: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                  </span>
                )}
              </div>
            )}
            </div>
          )}

          {submitError && (
            <div ref={errorRef} className="p-4 rounded-xl bg-red-500/20 border border-red-500/50 text-red-200 text-center">
              {submitError}
            </div>
          )}

          {started && (
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 px-4 py-3 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-3 text-slate-400">
                  <span>Section {section}</span>
                  <span>Question {currentPage + 1} of {totalQuestions || 1}</span>
                  {currentQuestion && (
                    <span>
                      Set {currentQuestion.setLabel}: {currentQuestion.sectionLabel} {currentQuestion.questionNumberInSection}/
                      {currentQuestion.sectionQuestionCount}
                    </span>
                  )}
                  {quizId && <span>Attempt {displayCurrentAttempt ?? 1} of {attemptsLimit}</span>}
                  {timeLimitMinutes ? <span>Time limit: {timeLimitMinutes} min</span> : <span>No time limit</span>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {timeLeft !== null && (
                    <span className={`text-sm font-semibold ${timeLeft <= 30 ? "text-amber-300" : "text-cyan-300"}`}>
                      Time left: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      if (typeof document === "undefined") return;
                      try {
                        if (!document.fullscreenElement) {
                          await document.documentElement.requestFullscreen();
                        } else {
                          await document.exitFullscreen();
                        }
                      } catch {
                        // Ignore fullscreen errors (browser or permissions).
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold"
                  >
                    {isFullscreen ? "Exit Focus Mode" : "Focus Mode"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {quizId && !started ? (
            <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 text-center text-slate-400 shadow-2xl">
	              Click &quot;Start Quiz&quot; to begin. The timer will start immediately.
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6 md:p-8 shadow-2xl">
            {currentQuestion?.kind === "mc" && (
              <MCQuestion
                question={currentQuestion.question}
                index={currentPage + 1}
                value={mcAnswers[currentQuestion.id] ?? ""}
                onChange={(v) => setMcAnswers((prev) => ({ ...prev, [currentQuestion.id]: v }))}
              />
            )}

            {currentQuestion?.kind === "id" && (
              <IdQuestion
                question={currentQuestion.question}
                index={currentPage + 1}
                value={idAnswers[currentQuestion.id] ?? ""}
                onChange={(v) => setIdAnswers((prev) => ({ ...prev, [currentQuestion.id]: v }))}
              />
            )}

            {currentQuestion?.kind === "enum" && (
              <div className="space-y-5">
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-amber-100">
                  <p className="text-sm">
                    Enumeration: separate your answers with commas, new lines, or semicolons. Order does not matter.
                  </p>
                </div>
                <EnumQuestion
                  question={currentQuestion.question}
                  index={currentPage + 1}
                  value={enumAnswers[currentQuestion.id] ?? ""}
                  onChange={(v) => setEnumAnswers((prev) => ({ ...prev, [currentQuestion.id]: v }))}
                />
              </div>
            )}

	            {currentQuestion?.kind === "hands_on" && (
	              <HandsOnQuestionCard
	                question={currentQuestion.question}
	                index={currentPage + 1}
	                value={handsOnAnswers[currentQuestion.id]}
	                onChange={(next) => setHandsOnAnswers((prev) => ({ ...prev, [currentQuestion.id]: next }))}
	              />
	            )}
          </div>
          )}

          <div className="flex justify-between items-center gap-4">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowSubmitConfirm(false);
                setSubmitError(null);
                setCurrentPage((p) => Math.max(0, p - 1));
              }}
              disabled={currentPage === 0 || (Boolean(quizId) && !started)}
              className="px-6 py-3 rounded-xl bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
            >
              ← Previous
            </button>
            {currentPage < totalQuestions - 1 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowSubmitConfirm(false);
                  setSubmitError(null);
                  setCurrentPage((p) => Math.min(totalQuestions - 1, p + 1));
                }}
                disabled={Boolean(quizId) && !started}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                type="submit"
                disabled={Boolean(quizId) && !started}
                className="px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-colors"
              >
                Submit Quiz
              </button>
            )}
          </div>
        </form>
        {showSubmitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-600 bg-slate-800 p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-100 mb-2">Confirm Submission</h3>
              <p className="text-slate-300 mb-6">Are you sure you want to submit your answer?</p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(false)}
                  className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSubmitConfirm(false);
                    gradeQuiz("manual_submit");
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  Yes, Submit
                </button>
              </div>
            </div>
          </div>
        )}
        {showDeadlineSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-600 bg-slate-800 p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-100 mb-2">Deadline Reached</h3>
              <p className="text-slate-300 mb-6">
                The quiz deadline has passed. Your current answers can still be submitted now.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (deadlineSubmitLoading) return;
                    setShowDeadlineSubmitModal(false);
                    setPendingForcedSubmit(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleForceSubmitAfterDeadline}
                  disabled={deadlineSubmitLoading}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
                >
                  {deadlineSubmitLoading ? "Submitting..." : "Submit Current Answers"}
                </button>
              </div>
            </div>
          </div>
        )}
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
      {question.imageUrl && (
        <div className="mb-3">
          <img
            src={question.imageUrl}
            alt="Question illustration"
            className="w-full max-h-80 object-contain rounded-lg border border-slate-600/50 bg-slate-900/40"
          />
        </div>
      )}
      <p className="font-medium text-slate-200 mb-3">
        {index}. {question.question}
      </p>
      <div className="grid gap-2">
        {question.options.map((opt, idx) => (
          <label
            key={`${question.id}-${idx}`}
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
      {question.imageUrl && (
        <div className="mb-3">
          <img
            src={question.imageUrl}
            alt="Question illustration"
            className="w-full max-h-80 object-contain rounded-lg border border-slate-600/50 bg-slate-900/40"
          />
        </div>
      )}
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
      {question.imageUrl && (
        <div className="mb-3">
          <img
            src={question.imageUrl}
            alt="Question illustration"
            className="w-full max-h-80 object-contain rounded-lg border border-slate-600/50 bg-slate-900/40"
          />
        </div>
      )}
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

function HandsOnQuestionCard({
  question,
  index,
  value,
  onChange,
}: {
  question: HandsOnQuestion;
  index: number;
  value?: HandsOnAnswer;
  onChange: (v: HandsOnAnswer) => void;
}) {
  const { mode, html, css, java, javaInput, consoleOutput } = getEffectiveHandsOnAnswer(question, value);
  const preview = buildHandsOnPreviewDoc(html, css);
  const htmlHighlightRef = useRef<HTMLPreElement | null>(null);
  const htmlEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const javaConsoleRef = useRef<HTMLInputElement | null>(null);
  const javaHighlightRef = useRef<HTMLPreElement | null>(null);
  const javaEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const javaLineNumberRef = useRef<HTMLDivElement | null>(null);
  const javaErrors = useMemo(() => getBasicJavaErrors(java), [java]);
  const [javaRunLoading, setJavaRunLoading] = useState(false);
  const [javaRunError, setJavaRunError] = useState<string | null>(null);
  const [javaSessionId, setJavaSessionId] = useState<string | null>(null);
  const [javaConsoleTranscript, setJavaConsoleTranscript] = useState(consoleOutput);
  const [javaConsoleDraft, setJavaConsoleDraft] = useState(javaInput ?? "");
  const javaNeedsInput = useMemo(() => javaProgramNeedsConsoleInput(java), [java]);
  const javaConsolePrompt = useMemo(() => extractJavaConsolePrompt(java), [java]);
  const javaLineNumbers = useMemo(
    () => Array.from({ length: java.split("\n").length || 1 }, (_, index) => index + 1),
    [java]
  );
  const persistJavaConsoleState = (nextDraft: string, nextTranscript: string) => {
    onChange({ mode, html, css, java, javaInput: nextDraft, consoleOutput: nextTranscript });
  };
  const handleHtmlChange = (nextHtml: string) => onChange({ mode, html: nextHtml, css, java, javaInput, consoleOutput });
  const handleCssChange = (nextCss: string) => onChange({ mode, html, css: nextCss, java, javaInput, consoleOutput });
  const handleJavaChange = (nextJava: string) => onChange({ mode, html, css, java: nextJava, javaInput, consoleOutput });
  useEffect(() => {
    if (!javaSessionId) setJavaConsoleTranscript(consoleOutput);
  }, [consoleOutput, javaSessionId]);
  useEffect(() => {
    if (!javaSessionId) setJavaConsoleDraft(javaInput ?? "");
  }, [javaInput, javaSessionId]);
  useEffect(() => {
    if (!javaSessionId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/java-run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "poll", sessionId: javaSessionId }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { output?: string; exited?: boolean; sessionId?: string };
        if (cancelled) return;
        const nextTranscript = String(data.output ?? "");
        setJavaConsoleTranscript(nextTranscript);
        persistJavaConsoleState(javaConsoleDraft, nextTranscript);
        if (data.exited) {
          setJavaSessionId(null);
          setJavaRunLoading(false);
        }
      } catch {
        if (!cancelled) {
          setJavaSessionId(null);
          setJavaRunLoading(false);
        }
      }
    };

    const timer = setInterval(() => {
      void poll();
    }, 400);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [javaSessionId, javaConsoleDraft, mode, html, css, java, onChange, consoleOutput]);
  const executeJavaStart = async () => {
    setJavaRunLoading(true);
    setJavaRunError(null);
    try {
      if (javaSessionId) {
        await fetch("/api/java-run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", sessionId: javaSessionId }),
        });
      }
      const res = await fetch("/api/java-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", code: java }),
      });
      const data = (await res.json()) as { output?: string; error?: string; sessionId?: string; exited?: boolean };
      if (!res.ok) {
        setJavaRunError(data.error ?? "Failed to run Java code.");
        setJavaRunLoading(false);
        return;
      }
      const nextTranscript = String(data.output ?? "");
      setJavaConsoleTranscript(nextTranscript);
      setJavaConsoleDraft("");
      persistJavaConsoleState("", nextTranscript);
      if (data.exited) {
        setJavaSessionId(null);
        setJavaRunLoading(false);
      } else {
        setJavaSessionId(String(data.sessionId ?? ""));
        setJavaRunLoading(false);
        window.requestAnimationFrame(() => {
          javaConsoleRef.current?.focus();
        });
      }
    } catch (error) {
      setJavaRunError(error instanceof Error ? error.message : "Failed to run Java code.");
      setJavaRunLoading(false);
    } finally {
    }
  };
  const handleRunJava = async () => {
    await executeJavaStart();
  };
  const handleConsoleInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!javaSessionId) return;
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    setJavaRunLoading(true);
    setJavaRunError(null);
    try {
      const sentInput = javaConsoleDraft;
      const res = await fetch("/api/java-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "input", sessionId: javaSessionId, input: sentInput }),
      });
      const data = (await res.json()) as { output?: string; error?: string; exited?: boolean };
      if (!res.ok) {
        setJavaRunError(data.error ?? "Failed to send Java input.");
        return;
      }
      const nextTranscript = String(data.output ?? "");
      setJavaConsoleTranscript(nextTranscript);
      setJavaConsoleDraft("");
      persistJavaConsoleState("", nextTranscript);
      if (data.exited) {
        setJavaSessionId(null);
      } else {
        window.requestAnimationFrame(() => {
          javaConsoleRef.current?.focus();
        });
      }
    } catch (error) {
      setJavaRunError(error instanceof Error ? error.message : "Failed to send Java input.");
    } finally {
      setJavaRunLoading(false);
    }
  };
  const handleHtmlKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (e.key === "Tab") {
      e.preventDefault();
      const next = `${html.slice(0, start)}  ${html.slice(end)}`;
      handleHtmlChange(next);
      setCursorPosition(el, start + 2);
      return;
    }

    if (e.key === ">" && start === end) {
      const tag = getAutoClosingTag(html, start);
      if (!tag) return;
      e.preventDefault();
      const closingTag = `></${tag}>`;
      const next = `${html.slice(0, start)}${closingTag}${html.slice(end)}`;
      handleHtmlChange(next);
      setCursorPosition(el, start + 1);
      return;
    }

    if (e.key === "Enter" && start === end) {
      const before = html.slice(0, start);
      const after = html.slice(end);
      const openMatch = before.match(/<([A-Za-z][\w-]*)[^<>]*>$/);
      const closeMatch = after.match(/^<\/([A-Za-z][\w-]*)>/);
      if (openMatch?.[1] && closeMatch?.[1] && openMatch[1] === closeMatch[1]) {
        e.preventDefault();
        const indent = getIndentOfLine(html, start);
        const next = `${before}\n${indent}  \n${indent}${after}`;
        handleHtmlChange(next);
        setCursorPosition(el, start + indent.length + 3);
      }
    }
  };

  const syncHtmlScroll = () => {
    const editor = htmlEditorRef.current;
    const highlight = htmlHighlightRef.current;
    if (!editor || !highlight) return;
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
  };

  const syncJavaScroll = () => {
    const editor = javaEditorRef.current;
    const highlight = javaHighlightRef.current;
    const lineNumbers = javaLineNumberRef.current;
    if (!editor || !highlight) return;
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
    if (lineNumbers) {
      lineNumbers.scrollTop = editor.scrollTop;
    }
  };

  const handleJavaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (e.key === "Tab") {
      e.preventDefault();
      if (start !== end) {
        const lineStart = getLineStart(java, start);
        const lineEnd = getLineEnd(java, end);
        const selectedBlock = java.slice(lineStart, lineEnd);
        const indentedBlock = selectedBlock
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n");
        const next = `${java.slice(0, lineStart)}${indentedBlock}${java.slice(lineEnd)}`;
        handleJavaChange(next);
        const lineCount = selectedBlock.split("\n").length;
        setCursorPosition(el, start + 2, end + lineCount * 2);
        return;
      }

      const next = `${java.slice(0, start)}  ${java.slice(end)}`;
      handleJavaChange(next);
      setCursorPosition(el, start + 2);
      return;
    }

    if (start === end) {
      const pair = getJavaAutoPair(e.key);
      if (pair) {
        e.preventDefault();
        const next = `${java.slice(0, start)}${e.key}${pair}${java.slice(end)}`;
        handleJavaChange(next);
        setCursorPosition(el, start + 1);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const before = java.slice(0, start);
      const after = java.slice(end);
      const indent = getIndentOfLine(java, start);
      const trimmedBefore = before.trimEnd();
      const nextChar = after[0] ?? "";
      const shouldIncreaseIndent =
        trimmedBefore.endsWith("{") ||
        trimmedBefore.endsWith("(") ||
        trimmedBefore.endsWith("[");
      const innerIndent = shouldIncreaseIndent ? `${indent}  ` : indent;

      if (
        (trimmedBefore.endsWith("{") && nextChar === "}") ||
        (trimmedBefore.endsWith("(") && nextChar === ")") ||
        (trimmedBefore.endsWith("[") && nextChar === "]")
      ) {
        const next = `${before}\n${innerIndent}\n${indent}${after}`;
        handleJavaChange(next);
        setCursorPosition(el, start + innerIndent.length + 1);
        return;
      }

      const next = `${before}\n${innerIndent}${after}`;
      handleJavaChange(next);
      setCursorPosition(el, start + innerIndent.length + 1);
      return;
    }

    if (start === end && (e.key === ")" || e.key === "]" || e.key === "}" || e.key === '"' || e.key === "'")) {
      if (java.slice(start, start + 1) === e.key) {
        e.preventDefault();
        setCursorPosition(el, start + 1);
      }
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 p-4">
        {question.imageUrl && (
          <div className="mb-3">
            <img
              src={question.imageUrl}
              alt="Question illustration"
              className="w-full max-h-80 object-contain rounded-lg border border-slate-600/50 bg-slate-900/40"
            />
          </div>
        )}
        <p className="font-medium text-slate-100 mb-2">
          {index}. {question.question}
        </p>
	        <p className="text-sm text-cyan-100">
	          {mode === "java_console"
	            ? "Write and run your Java code below. Your latest code and console output will be submitted."
	            : "Write your HTML and CSS below. Your latest code and preview will be submitted."}
	        </p>
          <p className="mt-2 text-xs text-cyan-200/80">
            Mobile tip: rotate to landscape for a wider coding area and easier scrolling.
          </p>
        {question.rubric && (
          <div className="mt-3 rounded-lg bg-slate-900/40 border border-slate-700/60 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Task Notes</p>
            <p className="text-sm whitespace-pre-wrap text-slate-200">{question.rubric}</p>
          </div>
        )}
      </div>

	      {mode === "java_console" ? (
	        <>
		          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
		            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
	              <p className="text-sm font-semibold text-cyan-100">Basic Java Checks</p>
	              <p className="text-xs text-cyan-200/80">Helpful hints only, not a real compiler</p>
	            </div>
	            {javaErrors.length > 0 ? (
	              <ul className="mt-3 space-y-2 text-sm text-amber-100">
	                {javaErrors.map((error, index) => (
	                  <li key={`${question.id}-java-error-${index}`} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
	                    {error}
	                  </li>
	                ))}
	              </ul>
	            ) : (
	              <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
	                No basic Java structure issues detected.
	              </p>
	            )}
	          </div>

			          <div className="rounded-xl bg-slate-700/30 border border-slate-600/30 p-4">
			            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			              <p className="text-sm font-semibold text-slate-200">Java Console</p>
			              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
			                <p className="text-xs text-slate-400">Real compiler output</p>
		                <button
		                  type="button"
		                  onClick={handleRunJava}
		                  disabled={javaRunLoading}
		                  className="min-h-11 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
		                >
		                  {javaRunLoading ? "Running..." : "Run Java"}
		                </button>
		              </div>
		            </div>
		            {javaRunError && (
		              <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
		                {javaRunError}
		              </p>
		            )}
		            {javaRunLoading && (
		              <div className="mb-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-3">
		                <div className="mb-2 flex items-center justify-between text-xs text-cyan-100">
		                  <span>Running Java code...</span>
		                  <span>Please wait</span>
		                </div>
		                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
		                  <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400" />
		                </div>
		              </div>
		            )}
				            <div className="rounded-lg border border-slate-700 bg-[#111827] px-4 py-3 font-mono text-sm text-emerald-300">
				              <div className="mb-2 text-slate-400">Console Input / Output</div>
				              <pre className="min-h-[10rem] max-h-[40vh] overflow-auto whitespace-pre-wrap break-words text-emerald-300 [webkit-overflow-scrolling:touch]">
				                {javaConsoleTranscript || "Run the code to see console output here."}
				              </pre>
				              {javaSessionId && (
				                <div className="mt-3 flex flex-col gap-2 border-t border-slate-700 pt-3 sm:flex-row sm:items-center">
				                  <span className="text-cyan-300">{javaConsolePrompt || "input >"}</span>
				                  <input
				                    ref={javaConsoleRef}
			                    value={javaConsoleDraft}
			                    onChange={(e) => {
			                      setJavaConsoleDraft(e.target.value);
			                      setJavaRunError(null);
			                      persistJavaConsoleState(e.target.value, javaConsoleTranscript);
			                    }}
				                    onKeyDown={handleConsoleInputKeyDown}
				                    spellCheck={false}
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    enterKeyHint="send"
				                    placeholder="Type input and press Enter"
				                    className="min-h-11 flex-1 rounded-md bg-slate-900/40 px-3 py-2 text-emerald-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
				                  />
				                </div>
				              )}
				            </div>
			            {javaSessionId && (
			              <p className="mt-2 text-xs text-cyan-200">
			                Java is still running. Type the next input and press `Enter`.
			              </p>
			            )}
			            {javaNeedsInput && !javaSessionId && (
			              <p className="mt-2 text-xs text-slate-400">
			                This program uses `Scanner`. Click `Run Java` to start it. If it asks for input, type in the console row and press `Enter`.
			              </p>
			            )}
		          </div>

			          <div className="rounded-xl bg-slate-700/30 border border-slate-600/30 p-4">
			            <label className="block text-sm font-semibold text-slate-200 mb-2">Java Program</label>
			            <div className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-950 focus-within:ring-2 focus-within:ring-cyan-500">
			              <div
			                ref={javaLineNumberRef}
			                aria-hidden="true"
			                className="pointer-events-none absolute inset-y-0 left-0 w-10 overflow-hidden border-r border-slate-800 bg-slate-900/90 px-1.5 py-3 text-right font-mono text-xs leading-6 text-slate-500 sm:w-12 sm:px-2 sm:text-sm"
			              >
		                {javaLineNumbers.map((line) => (
		                  <div key={`${question.id}-java-line-${line}`}>{line}</div>
		                ))}
		              </div>
			              <pre
			                ref={javaHighlightRef}
			                aria-hidden="true"
			                className="pointer-events-none absolute inset-0 overflow-auto px-3 py-3 pl-12 whitespace-pre-wrap break-words font-mono text-xs leading-6 [webkit-overflow-scrolling:touch] sm:px-4 sm:pl-16 sm:text-sm"
			              >
			                {renderHighlightedJava(java)}
			              </pre>
			              <textarea
			                ref={javaEditorRef}
	                value={java}
	                onChange={(e) => handleJavaChange(e.target.value)}
	                onKeyDown={handleJavaKeyDown}
		                onScroll={syncJavaScroll}
			                rows={18}
			                spellCheck={false}
			                autoCapitalize="off"
			                autoCorrect="off"
                            enterKeyHint="done"
			                className="relative z-10 min-h-[20rem] w-full resize-y overflow-auto bg-transparent px-3 py-3 pl-12 font-mono text-xs leading-6 text-transparent caret-slate-100 focus:outline-none selection:bg-cyan-500/30 [webkit-overflow-scrolling:touch] sm:px-4 sm:pl-16 sm:text-sm"
			              />
			            </div>
	            <p className="mt-2 text-xs text-slate-400">
	              Java keywords, strings, comments, and common class names are color-coded. `Tab` adds spaces for formatting.
	            </p>
	          </div>
	        </>
      ) : (
        <>
	          <div className="rounded-xl bg-slate-700/30 border border-slate-600/30 p-4">
	            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
	              <p className="text-sm font-semibold text-slate-200">Live Preview</p>
	              <p className="text-xs text-slate-400">Rendered in an isolated frame</p>
	            </div>
            <iframe
              title={`Hands-on preview ${question.id}`}
              srcDoc={preview}
              sandbox="allow-scripts"
              tabIndex={-1}
              aria-hidden="true"
              onPointerDown={() => {
                ignoreAutoSubmitUntil = Date.now() + 750;
              }}
	              className="pointer-events-none w-full min-h-[16rem] rounded-lg border border-slate-600/50 bg-white sm:min-h-[20rem]"
	            />
	          </div>

		          <div className="grid gap-4 xl:grid-cols-2">
		            <div className="rounded-xl bg-slate-700/30 border border-slate-600/30 p-4">
		              <label className="block text-sm font-semibold text-slate-200 mb-2">HTML</label>
		              <div className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-950 focus-within:ring-2 focus-within:ring-cyan-500">
	                <pre
	                  ref={htmlHighlightRef}
	                  aria-hidden="true"
	                  className="pointer-events-none absolute inset-0 overflow-auto px-3 py-3 whitespace-pre-wrap break-words font-mono text-xs leading-6 [webkit-overflow-scrolling:touch] sm:px-4 sm:text-sm"
	                >
	                  {renderHighlightedHtml(html)}
	                </pre>
		                <textarea
	                  ref={htmlEditorRef}
	                  value={html}
	                  onChange={(e) => handleHtmlChange(e.target.value)}
	                  onKeyDown={handleHtmlKeyDown}
		                  onScroll={syncHtmlScroll}
		                  rows={22}
		                  spellCheck={false}
                          autoCapitalize="off"
                          autoCorrect="off"
                          enterKeyHint="done"
		                  className="relative z-10 min-h-[20rem] w-full resize-y overflow-auto bg-transparent px-3 py-3 font-mono text-xs leading-6 text-transparent caret-slate-100 focus:outline-none selection:bg-cyan-500/30 [webkit-overflow-scrolling:touch] sm:px-4 sm:text-sm"
		                />
		              </div>
              <p className="mt-2 text-xs text-slate-400">
                Tags are color-coded, mismatched tags are highlighted, and typing helpers still work. `Tab` adds spaces, `Enter` indents, and opening tags auto-close.
              </p>
            </div>
	            <div className="rounded-xl bg-slate-700/30 border border-slate-600/30 p-4">
	              <label className="block text-sm font-semibold text-slate-200 mb-2">CSS</label>
	              <textarea
	                value={css}
	                onChange={(e) => handleCssChange(e.target.value)}
	                rows={14}
	                spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    enterKeyHint="done"
	                className="min-h-[14rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-y [webkit-overflow-scrolling:touch] sm:px-4 sm:text-sm"
	              />
	            </div>
	          </div>
        </>
      )}
    </div>
  );
}
