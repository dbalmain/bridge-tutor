#!/usr/bin/env node
/**
 * Local Sol coach bridge for the Bridge Tutor UI.
 *
 * Spawns `codex exec` (model gpt-5.6-sol, reasoning high) per hand, resumes the
 * same thread for mistakes and free chat, and keeps a move log so Sol always
 * sees the auction/play context.
 *
 * Endpoints (JSON):
 *   GET  /api/coach/health
 *   POST /api/coach/sessions          { lesson }
 *   POST /api/coach/sessions/:id/move { text }
 *   POST /api/coach/sessions/:id/mistake { phase, actual, expected, teaching?, context? }
 *   POST /api/coach/sessions/:id/chat { message }
 *   POST /api/coach/sessions/:id/end
 *   GET  /api/coach/sessions/:id
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, appendFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = Number(process.env.COACH_PORT ?? 8787);
const HOST = process.env.COACH_HOST ?? "127.0.0.1";
const CODEX_BIN = process.env.CODEX_BIN ?? "codex";
const MODEL = process.env.COACH_MODEL ?? "gpt-5.6-sol";
const REASONING = process.env.COACH_REASONING ?? "high";
const SESSIONS_DIR = join(ROOT, ".coach-sessions");
const TURN_TIMEOUT_MS = Number(process.env.COACH_TURN_TIMEOUT_MS ?? 10 * 60 * 1000);

if (!existsSync(SESSIONS_DIR)) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

/** @typedef {{ role: 'system'|'coach'|'user'|'note', text: string, at: string, kind?: string }} Msg */
/** @typedef {{
 *   id: string,
 *   codexSessionId: string | null,
 *   status: 'starting'|'ready'|'busy'|'error'|'ended',
 *   error: string | null,
 *   lesson: object,
 *   moveLog: string[],
 *   messages: Msg[],
 *   queue: Promise<unknown>,
 *   createdAt: string,
 * }} Session */

/** @type {Map<string, Session>} */
const sessions = new Map();

function nowIso() {
  return new Date().toISOString();
}

function logLine(sessionId, obj) {
  const path = join(SESSIONS_DIR, `${sessionId}.jsonl`);
  appendFileSync(path, `${JSON.stringify({ at: nowIso(), ...obj })}\n`);
}

/**
 * Parse codex --json JSONL for thread id and assistant text.
 * @param {string} stdout
 */
function parseCodexJsonl(stdout) {
  let threadId = null;
  let assistantText = "";
  const errors = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof ev.thread_id === "string") threadId = ev.thread_id;
    if (ev.type === "thread.started" && typeof ev.thread_id === "string") {
      threadId = ev.thread_id;
    }
    if (ev.type === "error" || ev.type === "turn.failed") {
      const msg =
        typeof ev.error === "string"
          ? ev.error
          : (ev.error?.message ?? ev.message ?? "codex error");
      errors.push(msg);
    }
    if (
      ev.type === "item.completed" &&
      ev.item?.type === "agent_message" &&
      typeof ev.item.text === "string"
    ) {
      assistantText += `${ev.item.text}\n`;
    }
  }
  return {
    threadId,
    assistantText: assistantText.trim(),
    errors,
  };
}

/**
 * @param {string[]} args
 * @param {string} stdinText
 * @param {number} timeoutMs
 */
function runCodex(args, stdinText, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(CODEX_BIN, args, {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        exitCode: null,
        timedOut: true,
        stdout,
        stderr,
        spawnError: null,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr,
        spawnError: String(err),
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: code,
        timedOut: false,
        stdout,
        stderr,
        spawnError: null,
      });
    });

    child.stdin.write(stdinText);
    child.stdin.end();
  });
}

function baseExecArgs() {
  return [
    "exec",
    "-C",
    ROOT,
    "-m",
    MODEL,
    "-c",
    `model_reasoning_effort="${REASONING}"`,
    "-s",
    "read-only",
    "--skip-git-repo-check",
    "--json",
  ];
}

/**
 * @param {Session} session
 * @param {string} prompt
 * @param {{ expectReply?: boolean }} [opts]
 */
async function runTurn(session, prompt, opts = {}) {
  const expectReply = opts.expectReply !== false;
  const isFirst = !session.codexSessionId;
  const args = isFirst
    ? [...baseExecArgs(), "-"]
    : [
        "exec",
        "resume",
        session.codexSessionId,
        "-m",
        MODEL,
        "-c",
        `model_reasoning_effort="${REASONING}"`,
        "--skip-git-repo-check",
        "--json",
        "-",
      ];

  logLine(session.id, {
    type: "turn_start",
    first: isFirst,
    codexSessionId: session.codexSessionId,
    promptPreview: prompt.slice(0, 500),
  });

  const proc = await runCodex(args, prompt, TURN_TIMEOUT_MS);
  if (proc.spawnError) {
    throw new Error(`cannot start codex: ${proc.spawnError}`);
  }
  if (proc.timedOut) {
    throw new Error(`codex timed out after ${TURN_TIMEOUT_MS}ms`);
  }

  const parsed = parseCodexJsonl(proc.stdout);
  if (parsed.threadId) session.codexSessionId = parsed.threadId;
  if (parsed.errors.length) {
    throw new Error(parsed.errors.join("; "));
  }
  if (proc.exitCode !== 0 && !parsed.assistantText) {
    const detail = (proc.stderr || proc.stdout).trim().slice(0, 400);
    throw new Error(`codex exited ${proc.exitCode}: ${detail || "no output"}`);
  }

  logLine(session.id, {
    type: "turn_end",
    codexSessionId: session.codexSessionId,
    replyPreview: parsed.assistantText.slice(0, 500),
  });

  if (expectReply && !parsed.assistantText) {
    return "(Sol had no reply — try asking again.)";
  }
  return parsed.assistantText;
}

/** Serialise turns so resume never races. */
function enqueue(session, fn) {
  const next = session.queue.then(fn, fn);
  session.queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function formatHand(seat, cards) {
  if (!Array.isArray(cards)) return `${seat}: ?`;
  return `${seat}: ${cards.join(" ")}`;
}

function buildStartPrompt(lesson) {
  const hands = lesson.hands ?? {};
  return `You are Sol, a patient bridge coach embedded in a beginners' tutor.

System: 5-card majors, strong 1NT (15–17). The student sits South.
Course hand: ${lesson.title ?? lesson.id} (chapter ${lesson.chapterNumber ?? "?"}).
Dealer: ${lesson.dealer ?? "?"}. Vulnerability: ${lesson.vulnerability ?? "—"}.
Lesson tip: ${lesson.tip ?? "—"}
Target contract (from the course script): ${lesson.contract ?? "?"} by ${lesson.declarer ?? "?"}.

Full deal (for your analysis; the student only sees their hand and later dummy):
${formatHand("S", hands.S)}
${formatHand("W", hands.W)}
${formatHand("N", hands.N)}
${formatHand("E", hands.E)}

How we work:
- I will send you MOVE notes (auction and card play) as the hand unfolds — treat them as context.
- On MISTAKE, explain in clear detail: what was wrong, the better thought process, and a rule of thumb the student can reuse. Avoid spoiling future cards unless needed to explain this error.
- On CHAT, answer the student's questions at a beginner level. Prefer short paragraphs over dense lists.
- Do not run tools or edit files. Coaching only.
- Bidding feedback follows the course line; card play is scored by double-dummy (DDS) — only significant (≥1 trick) errors are flagged.

Reply with one short acknowledgement that you are ready to coach this hand (one or two sentences). Do not start teaching until a MISTAKE or CHAT arrives.`;
}

function buildMistakePrompt(session, body) {
  const moves =
    session.moveLog.length > 0
      ? session.moveLog.map((m, i) => `${i + 1}. ${m}`).join("\n")
      : "(no moves logged yet)";
  return `MISTAKE during ${body.phase}.
Student played/bid: ${body.actual}
Recommended: ${body.expected}
Engine note: ${body.teaching ?? "—"}
Context: ${body.context ?? "—"}

Move log so far:
${moves}

Explain this mistake in more detail than the engine note. Cover:
1) Why the student's choice is wrong (or sub-optimal) here.
2) The better bid/card and the reasoning a beginner should use.
3) One reusable tip.

Keep it friendly and concrete. No tools.`;
}

function buildChatPrompt(session, message) {
  const moves =
    session.moveLog.length > 0
      ? session.moveLog.slice(-24).map((m, i) => `${i + 1}. ${m}`).join("\n")
      : "(no moves yet)";
  return `CHAT from the student:
${message}

Recent move log (context only):
${moves}

Answer as Sol, their bridge coach. No tools.`;
}

function publicSession(session) {
  return {
    id: session.id,
    codexSessionId: session.codexSessionId,
    status: session.status,
    error: session.error,
    createdAt: session.createdAt,
    moveCount: session.moveLog.length,
    messages: session.messages,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`invalid JSON: ${err}`));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

async function handle(req, res) {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && path === "/api/coach/health") {
      sendJson(res, 200, {
        ok: true,
        model: MODEL,
        reasoning: REASONING,
        codexBin: CODEX_BIN,
      });
      return;
    }

    if (req.method === "POST" && path === "/api/coach/sessions") {
      const body = await readBody(req);
      const lesson = body.lesson ?? {};
      const id = randomUUID();
      /** @type {Session} */
      const session = {
        id,
        codexSessionId: null,
        status: "starting",
        error: null,
        lesson,
        moveLog: [],
        messages: [],
        queue: Promise.resolve(),
        createdAt: nowIso(),
      };
      sessions.set(id, session);
      writeFileSync(
        join(SESSIONS_DIR, `${id}.meta.json`),
        JSON.stringify({ id, lessonId: lesson.id, createdAt: session.createdAt }, null, 2),
      );
      logLine(id, { type: "created", lessonId: lesson.id });

      // Kick off Sol in the background; client may poll status.
      enqueue(session, async () => {
        try {
          const reply = await runTurn(session, buildStartPrompt(lesson));
          session.messages.push({
            role: "coach",
            kind: "ready",
            text: reply,
            at: nowIso(),
          });
          session.status = "ready";
          logLine(id, { type: "ready", codexSessionId: session.codexSessionId });
        } catch (err) {
          session.status = "error";
          session.error = String(err?.message ?? err);
          logLine(id, { type: "error", error: session.error });
        }
      });

      sendJson(res, 201, publicSession(session));
      return;
    }

    const sessionMatch = path.match(
      /^\/api\/coach\/sessions\/([^/]+)(?:\/(move|mistake|chat|end))?$/,
    );
    if (sessionMatch) {
      const session = sessions.get(sessionMatch[1]);
      if (!session) {
        sendJson(res, 404, { error: "session not found" });
        return;
      }
      const action = sessionMatch[2] ?? null;

      if (req.method === "GET" && !action) {
        sendJson(res, 200, publicSession(session));
        return;
      }

      if (req.method === "POST" && action === "move") {
        const body = await readBody(req);
        const text = String(body.text ?? "").trim();
        if (!text) {
          sendJson(res, 400, { error: "text required" });
          return;
        }
        session.moveLog.push(text);
        session.messages.push({
          role: "note",
          kind: "move",
          text,
          at: nowIso(),
        });
        logLine(session.id, { type: "move", text });
        sendJson(res, 200, { ok: true, moveCount: session.moveLog.length });
        return;
      }

      if (req.method === "POST" && action === "mistake") {
        const body = await readBody(req);
        if (!body.actual || !body.expected || !body.phase) {
          sendJson(res, 400, { error: "phase, actual, expected required" });
          return;
        }
        session.moveLog.push(
          `MISTAKE (${body.phase}): ${body.actual} (recommended ${body.expected})`,
        );
        session.status = "busy";
        try {
          const reply = await enqueue(session, async () => {
            if (session.status === "error" && !session.codexSessionId) {
              throw new Error(session.error ?? "coach unavailable");
            }
            // Wait until start finished if still starting.
            if (!session.codexSessionId && session.status === "starting") {
              // start is already on the queue ahead of us
            }
            if (!session.codexSessionId) {
              // Start may have failed
              if (session.error) throw new Error(session.error);
            }
            return runTurn(session, buildMistakePrompt(session, body));
          });
          const msg = {
            role: "coach",
            kind: "mistake",
            text: reply,
            at: nowIso(),
          };
          session.messages.push(msg);
          session.status = "ready";
          sendJson(res, 200, { reply, message: msg, session: publicSession(session) });
        } catch (err) {
          session.status = session.codexSessionId ? "ready" : "error";
          session.error = String(err?.message ?? err);
          sendJson(res, 502, { error: session.error });
        }
        return;
      }

      if (req.method === "POST" && action === "chat") {
        const body = await readBody(req);
        const message = String(body.message ?? "").trim();
        if (!message) {
          sendJson(res, 400, { error: "message required" });
          return;
        }
        const userMsg = {
          role: "user",
          kind: "chat",
          text: message,
          at: nowIso(),
        };
        session.messages.push(userMsg);
        session.status = "busy";
        try {
          const reply = await enqueue(session, async () =>
            runTurn(session, buildChatPrompt(session, message)),
          );
          const coachMsg = {
            role: "coach",
            kind: "chat",
            text: reply,
            at: nowIso(),
          };
          session.messages.push(coachMsg);
          session.status = "ready";
          sendJson(res, 200, {
            reply,
            userMessage: userMsg,
            message: coachMsg,
            session: publicSession(session),
          });
        } catch (err) {
          session.status = session.codexSessionId ? "ready" : "error";
          session.error = String(err?.message ?? err);
          sendJson(res, 502, { error: session.error });
        }
        return;
      }

      if (req.method === "POST" && action === "end") {
        session.status = "ended";
        logLine(session.id, { type: "ended" });
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    sendJson(res, 404, { error: "not found" });
  } catch (err) {
    sendJson(res, 500, { error: String(err?.message ?? err) });
  }
}

const server = createServer((req, res) => {
  void handle(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(
    `[coach] Sol coach listening on http://${HOST}:${PORT}  model=${MODEL} reasoning=${REASONING}`,
  );
});
