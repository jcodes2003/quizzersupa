import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8080);
const JAVA_TIMEOUT_MS = Number(process.env.JAVA_TIMEOUT_MS ?? 5000);
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MS ?? 10 * 60 * 1000);
const RUNNER_TOKEN = String(process.env.JAVA_RUNNER_TOKEN ?? "").trim();

const sessions = new Map();

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function normalizeOutput(value) {
  return String(value ?? "").replace(/\r\n/g, "\n");
}

function isMissingCommandError(error) {
  return error instanceof Error && String(error.code ?? "").toUpperCase() === "ENOENT";
}

function getMissingJavaToolMessage(tool) {
  if (tool === "javac") {
    return "Java compiler is not available on this server. Install a JDK on the runner service host.";
  }
  return "Java runtime is not available on this server. Install Java on the runner service host.";
}

function formatCompileError(message) {
  const body = String(message ?? "").trim();
  const hint = body.includes("NoSuchElementException: No line found")
    ? "\nHint: your code requested more Scanner input than was provided."
    : "";
  return `ERROR!\n${body}${hint}${body || hint ? "\n\n" : "\n"}=== Code Exited With Errors ===`;
}

function appendSessionOutput(session, chunk, isError = false) {
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

function serializeSession(session) {
  return {
    ok: true,
    sessionId: session.id,
    output: session.output,
    exited: session.exited,
  };
}

async function disposeSession(session) {
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

function getJavaTempRoot() {
  const candidates = [
    process.env.TMPDIR,
    process.env.TEMP,
    process.env.TMP,
    tmpdir(),
    path.join(process.cwd(), ".tmp"),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  return candidates[0];
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

async function runProcess(command, args, cwd) {
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

async function waitForInitialOutput() {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

const server = createServer(async (req, res) => {
  await pruneSessions();

  if (RUNNER_TOKEN) {
    const authHeader = String(req.headers.authorization ?? "");
    if (authHeader !== `Bearer ${RUNNER_TOKEN}`) {
      json(res, 401, { error: "Unauthorized Java runner request." });
      return;
    }
  }

  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST" || req.url !== "/java-run") {
    json(res, 404, { error: "Not found." });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const action = body.action ?? "start";

    if (action === "poll") {
      const session = sessions.get(String(body.sessionId ?? ""));
      if (!session) {
        json(res, 404, { error: "Java session not found." });
        return;
      }
      session.lastActivity = Date.now();
      json(res, 200, serializeSession(session));
      return;
    }

    if (action === "input") {
      const session = sessions.get(String(body.sessionId ?? ""));
      if (!session) {
        json(res, 404, { error: "Java session not found." });
        return;
      }
      const input = String(body.input ?? "");
      if (!session.exited) {
        session.child.stdin.write(`${input}\n`);
        appendSessionOutput(session, `${input}\n`);
      }
      await waitForInitialOutput();
      json(res, 200, serializeSession(session));
      return;
    }

    if (action === "stop") {
      const session = sessions.get(String(body.sessionId ?? ""));
      if (session) {
        await disposeSession(session);
      }
      json(res, 200, { ok: true });
      return;
    }

    const code = String(body.code ?? "");
    if (!code.trim()) {
      json(res, 400, { error: "Java code is required." });
      return;
    }

    const tempRoot = path.join(getJavaTempRoot(), "java-run");
    await mkdir(tempRoot, { recursive: true });
    const workdir = await mkdtemp(path.join(tempRoot, "java-run-"));

    try {
      await writeFile(path.join(workdir, "Main.java"), code, "utf8");

      let compileResult;
      try {
        compileResult = await runProcess("javac", ["Main.java"], workdir);
      } catch (error) {
        if (isMissingCommandError(error)) {
          await rm(workdir, { recursive: true, force: true });
          json(res, 200, {
            ok: false,
            output: formatCompileError(getMissingJavaToolMessage("javac")),
            exited: true,
          });
          return;
        }
        throw error;
      }

      if (compileResult.timedOut) {
        await rm(workdir, { recursive: true, force: true });
        json(res, 200, {
          ok: false,
          output: formatCompileError(`Compilation timed out after ${Math.floor(JAVA_TIMEOUT_MS / 1000)} seconds.`),
          exited: true,
        });
        return;
      }

      if (compileResult.code !== 0) {
        await rm(workdir, { recursive: true, force: true });
        json(res, 200, {
          ok: false,
          output: formatCompileError(compileResult.stderr || compileResult.stdout || "Compilation failed."),
          exited: true,
        });
        return;
      }

      let child;
      try {
        child = spawn("java", ["Main"], {
          cwd: workdir,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
      } catch (error) {
        if (isMissingCommandError(error)) {
          await rm(workdir, { recursive: true, force: true });
          json(res, 200, {
            ok: false,
            output: formatCompileError(getMissingJavaToolMessage("java")),
            exited: true,
          });
          return;
        }
        throw error;
      }

      const session = {
        id: randomUUID(),
        child,
        workdir,
        output: "",
        exited: false,
        lastActivity: Date.now(),
        hasErrorBanner: false,
      };

      child.stdout.on("data", (chunk) => appendSessionOutput(session, String(chunk)));
      child.stderr.on("data", (chunk) => appendSessionOutput(session, String(chunk), true));
      child.on("close", (code) => {
        session.exited = true;
        if (!session.output.endsWith("\n") && session.output.length > 0) session.output += "\n";
        session.output += code === 0 ? "\n=== Code Execution Successful ===" : "\n=== Code Exited With Errors ===";
        session.lastActivity = Date.now();
        setTimeout(() => {
          void disposeSession(session);
        }, 30_000);
      });
      child.on("error", (error) => {
        appendSessionOutput(
          session,
          isMissingCommandError(error) ? getMissingJavaToolMessage("java") : String(error instanceof Error ? error.message : error),
          true
        );
        session.exited = true;
      });

      sessions.set(session.id, session);
      await waitForInitialOutput();
      json(res, 200, serializeSession(session));
    } catch (error) {
      await rm(workdir, { recursive: true, force: true });
      throw error;
    }
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Java runner failed." });
  }
});

server.listen(PORT, () => {
  console.log(`Java runner service listening on port ${PORT}`);
});
