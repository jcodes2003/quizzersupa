import { NextRequest, NextResponse } from "next/server";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const JAVA_TIMEOUT_MS = 5000;
const SESSION_IDLE_MS = 10 * 60 * 1000;

type ProcessResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

type JavaSession = {
  id: string;
  child: ChildProcessWithoutNullStreams;
  workdir: string;
  output: string;
  exited: boolean;
  lastActivity: number;
  hasErrorBanner: boolean;
};

type StartBody = {
  action?: "start" | "poll" | "input" | "stop";
  code?: string;
  sessionId?: string;
  input?: string;
};

const globalSessions = globalThis as typeof globalThis & {
  __javaRunSessions?: Map<string, JavaSession>;
};

const sessions = globalSessions.__javaRunSessions ?? (globalSessions.__javaRunSessions = new Map<string, JavaSession>());

function normalizeOutput(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

async function runProcess(command: string, args: string[], cwd: string): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, JAVA_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: normalizeOutput(stdout),
        stderr: normalizeOutput(stderr),
        timedOut,
      });
    });
  });
}

function formatCompileError(message: string): string {
  const body = message.trim();
  const hint = body.includes("NoSuchElementException: No line found")
    ? "\nHint: your code requested more Scanner input than was provided."
    : "";
  return `ERROR!\n${body}${hint}${body || hint ? "\n\n" : "\n"}=== Code Exited With Errors ===`;
}

function appendSessionOutput(session: JavaSession, chunk: string, isError = false) {
  const text = normalizeOutput(chunk);
  if (!text) return;

  if (isError && !session.hasErrorBanner) {
    if (session.output && !session.output.endsWith("\n")) session.output += "\n";
    session.output += "ERROR!\n";
    session.hasErrorBanner = true;
  }

  session.output += text;
  session.lastActivity = Date.now();
}

async function disposeSession(session: JavaSession) {
  sessions.delete(session.id);
  try {
    if (!session.child.killed && !session.exited) {
      session.child.kill();
    }
  } catch {}
  await rm(session.workdir, { recursive: true, force: true });
}

async function pruneSessions() {
  const now = Date.now();
  const stale = [...sessions.values()].filter((session) => now - session.lastActivity > SESSION_IDLE_MS);
  for (const session of stale) {
    await disposeSession(session);
  }
}

function serializeSession(session: JavaSession) {
  return {
    ok: true,
    sessionId: session.id,
    output: session.output,
    exited: session.exited,
  };
}

async function waitForInitialOutput() {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

export async function POST(request: NextRequest) {
  await pruneSessions();

  try {
    const body = (await request.json()) as StartBody;
    const action = body.action ?? "start";

    if (action === "poll") {
      const session = sessions.get(String(body.sessionId ?? ""));
      if (!session) {
        return NextResponse.json({ error: "Java session not found." }, { status: 404 });
      }
      session.lastActivity = Date.now();
      return NextResponse.json(serializeSession(session));
    }

    if (action === "input") {
      const session = sessions.get(String(body.sessionId ?? ""));
      if (!session) {
        return NextResponse.json({ error: "Java session not found." }, { status: 404 });
      }

      const input = String(body.input ?? "");
      if (!session.exited) {
        session.child.stdin.write(`${input}\n`);
        appendSessionOutput(session, `${input}\n`);
      }
      await waitForInitialOutput();
      return NextResponse.json(serializeSession(session));
    }

    if (action === "stop") {
      const session = sessions.get(String(body.sessionId ?? ""));
      if (session) {
        await disposeSession(session);
      }
      return NextResponse.json({ ok: true });
    }

    const code = String(body.code ?? "");
    if (!code.trim()) {
      return NextResponse.json({ error: "Java code is required." }, { status: 400 });
    }

    const tempRoot = path.join(process.cwd(), ".tmp");
    await mkdir(tempRoot, { recursive: true });
    const workdir = await mkdtemp(path.join(tempRoot, "java-run-"));

    try {
      await writeFile(path.join(workdir, "Main.java"), code, "utf8");

      const compileResult = await runProcess("javac", ["Main.java"], workdir);
      if (compileResult.timedOut) {
        await rm(workdir, { recursive: true, force: true });
        return NextResponse.json({
          ok: false,
          output: formatCompileError("Compilation timed out after 5 seconds."),
          exited: true,
        });
      }

      if (compileResult.code !== 0) {
        await rm(workdir, { recursive: true, force: true });
        return NextResponse.json({
          ok: false,
          output: formatCompileError(compileResult.stderr || compileResult.stdout || "Compilation failed."),
          exited: true,
        });
      }

      const child = spawn("java", ["Main"], {
        cwd: workdir,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      const session: JavaSession = {
        id: randomUUID(),
        child,
        workdir,
        output: "",
        exited: false,
        lastActivity: Date.now(),
        hasErrorBanner: false,
      };

      child.stdout.on("data", (chunk) => {
        appendSessionOutput(session, String(chunk));
      });

      child.stderr.on("data", (chunk) => {
        appendSessionOutput(session, String(chunk), true);
      });

      child.on("close", async (code) => {
        session.exited = true;
        if (!session.output.endsWith("\n") && session.output.length > 0) session.output += "\n";
        session.output += code === 0 ? "\n=== Code Execution Successful ===" : "\n=== Code Exited With Errors ===";
        session.lastActivity = Date.now();
        setTimeout(() => {
          void disposeSession(session);
        }, 30_000);
      });

      child.on("error", (error) => {
        appendSessionOutput(session, String(error instanceof Error ? error.message : error), true);
        session.exited = true;
      });

      sessions.set(session.id, session);
      await waitForInitialOutput();
      return NextResponse.json(serializeSession(session));
    } catch (error) {
      await rm(workdir, { recursive: true, force: true });
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Java runner failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
