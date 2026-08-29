#!/usr/bin/env node
/**
 * Local Sol coach bridge for the Bridge Tutor UI.
 *
 * Creates a per-hand session that only *queues* auction/play notes. The chosen
 * harness (Codex / Grok / OpenCode / Claude) is not started until the student
 * makes a MISTAKE or sends CHAT — then we open (or resume) a thread with the
 * full deal + move log. Clean hands cost no model tokens.
 *
 * Endpoints (JSON):
 *   GET  /api/coach/health
 *   GET  /api/coach/options
 *   POST /api/coach/sessions          { lesson, harness?, model?, thinking? }
 *   POST /api/coach/sessions/:id/config { harness?, model?, thinking? }
 *   POST /api/coach/sessions/:id/move { text }
 *   POST /api/coach/sessions/:id/mistake { phase, actual, expected, teaching?, context? }
 *   POST /api/coach/sessions/:id/chat { message }
 *   POST /api/coach/sessions/:id/end
 *   GET  /api/coach/sessions/:id
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  mkdirSync,
  appendFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = Number(process.env.COACH_PORT ?? 8787);
const HOST = process.env.COACH_HOST ?? "127.0.0.1";
const SESSIONS_DIR = join(ROOT, ".coach-sessions");
const TURN_TIMEOUT_MS = Number(process.env.COACH_TURN_TIMEOUT_MS ?? 10 * 60 * 1000);

const BINS = {
  codex: process.env.CODEX_BIN ?? "codex",
  grok: process.env.GROK_BIN ?? "grok",
  opencode: process.env.OPENCODE_BIN ?? "opencode",
  claude: process.env.CLAUDE_BIN ?? "claude",
};

const DEFAULTS = {
  harness: process.env.COACH_HARNESS ?? "codex",
  model: process.env.COACH_MODEL ?? "gpt-5.6-sol",
  thinking: process.env.COACH_REASONING ?? process.env.COACH_THINKING ?? "high",
};

const HARNESS_META = {
  codex: {
    id: "codex",
    label: "Codex",
    defaultModel: "gpt-5.6-sol",
    defaultThinking: "high",
    thinkingLevels: ["low", "medium", "high"],
  },
  grok: {
    id: "grok",
    label: "Grok Build",
    defaultModel: "grok-4.5",
    defaultThinking: "medium",
    thinkingLevels: ["low", "medium", "high"],
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    defaultModel: "opencode-go/grok-4.5",
    defaultThinking: "medium",
    thinkingLevels: ["minimal", "low", "medium", "high", "max"],
  },
  claude: {
    id: "claude",
    label: "Claude Code",
    defaultModel: "sonnet",
    defaultThinking: "medium",
    thinkingLevels: ["low", "medium", "high", "xhigh", "max"],
  },
};

if (!existsSync(SESSIONS_DIR)) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

/** @typedef {{ role: 'system'|'coach'|'user'|'note', text: string, at: string, kind?: string }} Msg */
/** @typedef {{
 *   id: string,
 *   harness: string,
 *   model: string,
 *   thinking: string,
 *   agentSessionId: string | null,
 *   status: 'starting'|'ready'|'busy'|'error'|'ended',
 *   error: string | null,
 *   lesson: object,
 *   moveLog: string[],
 *   messages: Msg[],
 *   queue: Promise<unknown>,
 *   createdAt: string,
 *   activeChild: import('node:child_process').ChildProcess | null,
 *   ended: boolean,
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

function binOnPath(bin) {
  try {
    const r = spawnSync("which", [bin], { encoding: "utf8" });
    return r.status === 0 && Boolean(r.stdout?.trim());
  } catch {
    return false;
  }
}

/**
 * @param {import('node:child_process').ChildProcess | null | undefined} child
 */
function killChildTree(child) {
  if (!child?.pid) return;
  try {
    // Negative PID: signal the process group when we spawned detached.
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }, 1500);
}

/**
 * @param {string} bin
 * @param {string[]} args
 * @param {string | null} stdinText
 * @param {number} timeoutMs
 * @param {{ onSpawn?: (child: import('node:child_process').ChildProcess) => void }} [hooks]
 */
function runProcess(bin, args, stdinText, timeoutMs, hooks = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
      // Own process group so we can kill the whole tree on cancel/timeout.
      detached: true,
    });
    hooks.onSpawn?.(child);
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      killChildTree(child);
      finish({
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
      finish({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr,
        spawnError: String(err),
      });
    });
    child.on("close", (code) => {
      finish({
        exitCode: code,
        timedOut: false,
        stdout,
        stderr,
        spawnError: null,
      });
    });

    const stdin = child.stdin;
    if (stdin) {
      // Failed spawn / EPIPE must not become an unhandled stream error
      // that takes down the whole process (and every other session).
      stdin.on("error", () => {});
      if (stdinText != null) {
        stdin.write(stdinText);
      }
      stdin.end();
    }
  });
}

// ─── harness parsers ────────────────────────────────────────────────────────

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
    sessionId: threadId,
    text: assistantText.trim(),
    errors,
  };
}

/** Best-effort parse of Grok --output-format json. */
function parseGrokJson(stdout) {
  const errors = [];
  let sessionId = null;
  let text = "";
  const trimmed = stdout.trim();
  if (!trimmed) return { sessionId, text, errors };

  // Single JSON object
  try {
    const obj = JSON.parse(trimmed);
    sessionId =
      obj.session_id ?? obj.sessionId ?? obj.id ?? obj.uuid ?? null;
    text =
      obj.result ??
      obj.text ??
      obj.message ??
      obj.content ??
      obj.output ??
      "";
    if (typeof text !== "string") {
      text = JSON.stringify(text);
    }
    if (obj.error) {
      errors.push(
        typeof obj.error === "string" ? obj.error : JSON.stringify(obj.error),
      );
    }
    return { sessionId, text: String(text).trim(), errors };
  } catch {
    // fall through to JSONL / embedded
  }

  for (const line of trimmed.split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof ev.session_id === "string") sessionId = ev.session_id;
    if (typeof ev.sessionId === "string") sessionId = ev.sessionId;
    if (ev.type === "session" && typeof ev.id === "string") sessionId = ev.id;
    if (ev.type === "result" || ev.type === "assistant" || ev.role === "assistant") {
      const t = ev.result ?? ev.text ?? ev.content ?? ev.message;
      if (typeof t === "string") text += `${t}\n`;
      else if (Array.isArray(t)) {
        for (const part of t) {
          if (typeof part === "string") text += `${part}\n`;
          else if (part?.text) text += `${part.text}\n`;
        }
      }
    }
    if (ev.type === "error") {
      errors.push(ev.message ?? ev.error ?? "grok error");
    }
  }
  if (!text) {
    // last resort: plain text (if --output-format plain leaked)
    const plain = trimmed
      .split("\n")
      .filter((l) => l && !l.startsWith("{"))
      .join("\n")
      .trim();
    if (plain) text = plain;
  }
  return { sessionId, text: text.trim(), errors };
}

/** Parse OpenCode --format json event stream. */
function parseOpenCodeJson(stdout) {
  const errors = [];
  let sessionId = null;
  let text = "";
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    // session id
    if (typeof ev.sessionID === "string") sessionId = ev.sessionID;
    if (typeof ev.sessionId === "string") sessionId = ev.sessionId;
    if (typeof ev.session_id === "string") sessionId = ev.session_id;
    if (ev.type === "session" && typeof (ev.session?.id ?? ev.id) === "string") {
      sessionId = ev.session?.id ?? ev.id;
    }
    if (ev.properties?.sessionID) sessionId = ev.properties.sessionID;

    // assistant text — several OpenCode event shapes over versions
    const part = ev.part ?? ev.properties?.part;
    if (part?.type === "text" && typeof part.text === "string") {
      text += part.text;
    }
    if (ev.type === "message" || ev.type === "text") {
      const t = ev.text ?? ev.message ?? ev.content;
      if (typeof t === "string") text += t;
    }
    if (
      (ev.type === "message.updated" || ev.type === "message.part.updated") &&
      typeof ev.properties?.part?.text === "string"
    ) {
      // streaming updates often replace; keep last full message via accumulation of deltas if any
      if (ev.properties.part.type === "text") {
        // prefer final completed texts only — use delta if present
        if (typeof ev.properties.delta === "string") {
          text += ev.properties.delta;
        }
      }
    }
    if (ev.type === "error" || ev.error) {
      errors.push(
        typeof ev.error === "string"
          ? ev.error
          : (ev.message ?? JSON.stringify(ev.error ?? ev)),
      );
    }
  }
  // Fallback: whole stdout as one JSON
  if (!text && !sessionId) {
    try {
      const obj = JSON.parse(stdout.trim());
      sessionId = obj.sessionID ?? obj.sessionId ?? obj.id ?? null;
      text = obj.result ?? obj.text ?? obj.message ?? "";
    } catch {
      // ignore
    }
  }
  return { sessionId, text: String(text).trim(), errors };
}

function parseClaudeJson(stdout) {
  const errors = [];
  let sessionId = null;
  let text = "";
  const trimmed = stdout.trim();
  try {
    const obj = JSON.parse(trimmed);
    sessionId = obj.session_id ?? obj.sessionId ?? null;
    text = obj.result ?? obj.content ?? obj.text ?? "";
    if (obj.is_error || obj.type === "error") {
      errors.push(obj.result ?? obj.error ?? "claude error");
    }
    return { sessionId, text: String(text).trim(), errors };
  } catch {
    // stream-json lines
  }
  for (const line of trimmed.split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof ev.session_id === "string") sessionId = ev.session_id;
    if (ev.type === "result" && typeof ev.result === "string") {
      text = ev.result;
    }
    if (ev.type === "assistant" && ev.message?.content) {
      for (const c of ev.message.content) {
        if (c.type === "text" && c.text) text += `${c.text}\n`;
      }
    }
    if (ev.type === "error") {
      errors.push(ev.error?.message ?? ev.message ?? "claude error");
    }
  }
  return { sessionId, text: text.trim(), errors };
}

// ─── harness runners ────────────────────────────────────────────────────────

/**
 * @param {Session} session
 * @param {string} prompt
 * @returns {Promise<{ sessionId: string|null, text: string, errors: string[], raw: {stdout:string,stderr:string,exitCode:number|null} }>}
 */
/**
 * @param {Session} session
 * @param {string} bin
 * @param {string[]} args
 * @param {string | null} stdinText
 */
async function runSessionProcess(session, bin, args, stdinText) {
  if (session.ended) {
    throw new Error("session ended");
  }
  const proc = await runProcess(bin, args, stdinText, TURN_TIMEOUT_MS, {
    onSpawn(child) {
      session.activeChild = child;
    },
  });
  if (session.activeChild) session.activeChild = null;
  if (session.ended) {
    throw new Error("session ended");
  }
  return proc;
}

/** Codex `-c key="value"` is not a shell, but `"` still closes the value. */
function codexConfigValue(s) {
  return String(s ?? "").replace(/[^a-zA-Z0-9._-]/g, "");
}

async function runHarnessTurn(session, prompt) {
  const { harness, model, thinking } = session;
  const isFirst = !session.agentSessionId;

  if (harness === "codex") {
    const bin = BINS.codex;
    const args = isFirst
      ? [
          "exec",
          "-C",
          ROOT,
          "-m",
          model,
          "-c",
          `model_reasoning_effort="${codexConfigValue(thinking)}"`,
          "-s",
          "read-only",
          "--skip-git-repo-check",
          "--json",
          "-",
        ]
      : [
          "exec",
          "resume",
          session.agentSessionId,
          "-m",
          model,
          "-c",
          `model_reasoning_effort="${codexConfigValue(thinking)}"`,
          "--skip-git-repo-check",
          "--json",
          "-",
        ];
    const proc = await runSessionProcess(session, bin, args, prompt);
    if (proc.spawnError) throw new Error(`cannot start codex: ${proc.spawnError}`);
    if (proc.timedOut) throw new Error(`codex timed out after ${TURN_TIMEOUT_MS}ms`);
    const parsed = parseCodexJsonl(proc.stdout);
    if (proc.exitCode !== 0 && !parsed.text) {
      const detail = (proc.stderr || proc.stdout).trim().slice(0, 400);
      throw new Error(`codex exited ${proc.exitCode}: ${detail || "no output"}`);
    }
    return { ...parsed, raw: proc };
  }

  if (harness === "grok") {
    const bin = BINS.grok;
    // Prefer --prompt-file for long coach prompts (avoids ARG_MAX / argv noise).
    const promptPath = join(SESSIONS_DIR, `${session.id}-prompt.txt`);
    writeFileSync(promptPath, prompt, "utf8");
    // Headless via --prompt-file (mutually exclusive with -p). Empty --tools
    // disables built-ins so the coach cannot wander into the repo.
    const args = [
      "--prompt-file",
      promptPath,
      "-m",
      model,
      "--reasoning-effort",
      thinking,
      "--output-format",
      "json",
      "--permission-mode",
      "dontAsk",
      "--disable-web-search",
      "--tools",
      "",
      "--max-turns",
      "1",
    ];
    if (!isFirst && session.agentSessionId) {
      args.push("--resume", session.agentSessionId);
    }
    try {
      const proc = await runSessionProcess(session, bin, args, null);
      if (proc.spawnError) throw new Error(`cannot start grok: ${proc.spawnError}`);
      if (proc.timedOut) throw new Error(`grok timed out after ${TURN_TIMEOUT_MS}ms`);
      const parsed = parseGrokJson(proc.stdout || proc.stderr);
      // plain fallback
      if (!parsed.text && proc.stdout.trim()) {
        parsed.text = proc.stdout.trim();
      }
      if (proc.exitCode !== 0 && !parsed.text) {
        const detail = (proc.stderr || proc.stdout).trim().slice(0, 400);
        throw new Error(`grok exited ${proc.exitCode}: ${detail || "no output"}`);
      }
      return { ...parsed, raw: proc };
    } finally {
      try {
        unlinkSync(promptPath);
      } catch {
        // ignore
      }
    }
  }

  if (harness === "opencode") {
    const bin = BINS.opencode;
    const args = [
      "run",
      "-m",
      model,
      "--variant",
      thinking,
      "--format",
      "json",
      "--title",
      `bridge-coach-${session.id.slice(0, 8)}`,
    ];
    if (!isFirst && session.agentSessionId) {
      args.push("-s", session.agentSessionId);
    }
    // message as final positional (spawn array = no shell quoting issues)
    args.push(prompt);
    const proc = await runSessionProcess(session, bin, args, null);
    if (proc.spawnError) {
      throw new Error(`cannot start opencode: ${proc.spawnError}`);
    }
    if (proc.timedOut) {
      throw new Error(`opencode timed out after ${TURN_TIMEOUT_MS}ms`);
    }
    const parsed = parseOpenCodeJson(proc.stdout);
    if (!parsed.text && proc.stdout.trim()) {
      // default format sometimes still prints human text on stderr/stdout
      const lines = proc.stdout
        .split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith("{"));
      if (lines.length) parsed.text = lines.join("\n").trim();
    }
    if (proc.exitCode !== 0 && !parsed.text) {
      const detail = (proc.stderr || proc.stdout).trim().slice(0, 400);
      throw new Error(
        `opencode exited ${proc.exitCode}: ${detail || "no output"}`,
      );
    }
    return { ...parsed, raw: proc };
  }

  if (harness === "claude") {
    const bin = BINS.claude;
    const args = [
      "-p",
      "--output-format",
      "json",
      "--model",
      model,
      "--effort",
      thinking,
      "--tools",
      "",
      "--permission-mode",
      "dontAsk",
    ];
    if (!isFirst && session.agentSessionId) {
      args.push("--resume", session.agentSessionId);
    }
    args.push(prompt);
    const proc = await runSessionProcess(session, bin, args, null);
    if (proc.spawnError) {
      throw new Error(`cannot start claude: ${proc.spawnError}`);
    }
    if (proc.timedOut) {
      throw new Error(`claude timed out after ${TURN_TIMEOUT_MS}ms`);
    }
    const parsed = parseClaudeJson(proc.stdout);
    if (proc.exitCode !== 0 && !parsed.text) {
      const detail = (proc.stderr || proc.stdout).trim().slice(0, 400);
      throw new Error(
        `claude exited ${proc.exitCode}: ${detail || "no output"}`,
      );
    }
    return { ...parsed, raw: proc };
  }

  throw new Error(`unknown harness: ${harness}`);
}

/**
 * @param {Session} session
 * @param {string} prompt
 * @param {{ expectReply?: boolean }} [opts]
 */
async function runTurn(session, prompt, opts = {}) {
  const expectReply = opts.expectReply !== false;
  const isFirst = !session.agentSessionId;

  logLine(session.id, {
    type: "turn_start",
    first: isFirst,
    harness: session.harness,
    model: session.model,
    thinking: session.thinking,
    agentSessionId: session.agentSessionId,
    promptPreview: prompt.slice(0, 500),
  });

  const result = await runHarnessTurn(session, prompt);
  if (result.errors?.length) {
    throw new Error(result.errors.join("; "));
  }
  if (result.sessionId) session.agentSessionId = result.sessionId;

  logLine(session.id, {
    type: "turn_end",
    harness: session.harness,
    agentSessionId: session.agentSessionId,
    replyPreview: (result.text ?? "").slice(0, 500),
  });

  if (expectReply && !result.text) {
    return "(Coach had no reply — try asking again.)";
  }
  return result.text;
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

/** Full deal + persona — only included on the first agent turn for a session. */
function buildLessonContext(lesson, harness) {
  const hands = lesson.hands ?? {};
  const harnessLabel =
    HARNESS_META[harness]?.label ?? harness ?? "the coach";
  return `You are a patient bridge coach embedded in a beginners' tutor (running via ${harnessLabel}).

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
- Auction and card-play notes appear in the move log below — treat them as context only.
- On MISTAKE, explain in clear detail: what was wrong, the better thought process, and a rule of thumb the student can reuse. Avoid spoiling future cards unless needed to explain this error.
- On CHAT, answer the student's questions at a beginner level. Prefer short paragraphs over dense lists.
- Do not run tools or edit files. Coaching only. Reply with coaching text only.
- Bidding feedback follows the course line; card play is scored by double-dummy (DDS) — only significant (≥1 trick) errors are flagged.`;
}

function formatMoveLog(session, { recentOnly = false } = {}) {
  if (session.moveLog.length === 0) {
    return recentOnly ? "(no moves yet)" : "(no moves logged yet)";
  }
  const lines = recentOnly ? session.moveLog.slice(-24) : session.moveLog;
  return lines.map((m, i) => `${i + 1}. ${m}`).join("\n");
}

function withFirstTurnContext(session, body) {
  if (session.agentSessionId) return body;
  return `${buildLessonContext(session.lesson, session.harness)}

---

${body}`;
}

function buildMistakePrompt(session, body) {
  const moves = formatMoveLog(session);
  return withFirstTurnContext(
    session,
    `MISTAKE during ${body.phase}.
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

Keep it friendly and concrete. No tools.`,
  );
}

function buildChatPrompt(session, message) {
  const moves = formatMoveLog(session, { recentOnly: true });
  return withFirstTurnContext(
    session,
    `CHAT from the student:
${message}

Recent move log (context only):
${moves}

Answer as their bridge coach. No tools.`,
  );
}

function endSession(session) {
  session.ended = true;
  session.status = "ended";
  if (session.activeChild) {
    killChildTree(session.activeChild);
    session.activeChild = null;
  }
  logLine(session.id, { type: "ended" });
}

function publicSession(session) {
  return {
    id: session.id,
    harness: session.harness,
    model: session.model,
    thinking: session.thinking,
    agentSessionId: session.agentSessionId,
    /** @deprecated alias for older clients */
    codexSessionId: session.agentSessionId,
    status: session.status,
    error: session.error,
    createdAt: session.createdAt,
    moveCount: session.moveLog.length,
    messages: session.messages,
  };
}

function normalizeHarness(raw) {
  const id = String(raw ?? DEFAULTS.harness).toLowerCase();
  if (id in HARNESS_META) return id;
  return "codex";
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

function harnessAvailability() {
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const id of Object.keys(HARNESS_META)) {
    out[id] = binOnPath(BINS[id]);
  }
  return out;
}

async function handle(req, res) {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;
  console.log(`[coach] ${req.method} ${path}`);

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
      const available = harnessAvailability();
      sendJson(res, 200, {
        ok: true,
        defaults: DEFAULTS,
        available,
        bins: BINS,
      });
      return;
    }

    if (req.method === "GET" && path === "/api/coach/options") {
      const available = harnessAvailability();
      sendJson(res, 200, {
        defaults: DEFAULTS,
        harnesses: Object.values(HARNESS_META).map((h) => ({
          ...h,
          available: available[h.id] === true,
          bin: BINS[h.id],
        })),
      });
      return;
    }

    if (req.method === "POST" && path === "/api/coach/sessions") {
      const body = await readBody(req);
      const lesson = body.lesson ?? {};
      const harness = normalizeHarness(body.harness);
      const meta = HARNESS_META[harness];
      const model =
        typeof body.model === "string" && body.model.trim()
          ? body.model.trim()
          : (meta.defaultModel ?? DEFAULTS.model);
      const thinking =
        typeof body.thinking === "string" && body.thinking.trim()
          ? body.thinking.trim()
          : (meta.defaultThinking ?? DEFAULTS.thinking);

      if (!binOnPath(BINS[harness])) {
        sendJson(res, 400, {
          error: `Harness "${harness}" CLI not found on PATH (${BINS[harness]}). Install it or pick another harness.`,
        });
        return;
      }

      const id = randomUUID();
      /** @type {Session} */
      const session = {
        id,
        harness,
        model,
        thinking,
        agentSessionId: null,
        status: "ready",
        error: null,
        lesson,
        moveLog: [],
        messages: [],
        queue: Promise.resolve(),
        createdAt: nowIso(),
        activeChild: null,
        ended: false,
      };
      sessions.set(id, session);
      writeFileSync(
        join(SESSIONS_DIR, `${id}.meta.json`),
        JSON.stringify(
          {
            id,
            lessonId: lesson.id,
            harness,
            model,
            thinking,
            createdAt: session.createdAt,
          },
          null,
          2,
        ),
      );
      logLine(id, {
        type: "created",
        lessonId: lesson.id,
        lazy: true,
        harness,
        model,
        thinking,
      });

      sendJson(res, 201, publicSession(session));
      return;
    }

    const sessionMatch = path.match(
      /^\/api\/coach\/sessions\/([^/]+)(?:\/(move|mistake|chat|end|config))?$/,
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

      // Switch harness/model/thinking mid-hand. Keeps the move log; drops any
      // open agent thread so the next mistake/chat starts a fresh thread with
      // full lesson context under the new settings.
      if (req.method === "POST" && action === "config") {
        if (session.status === "busy") {
          sendJson(res, 409, {
            error: "coach is busy — wait for the current reply, then switch",
          });
          return;
        }
        if (session.status === "ended") {
          sendJson(res, 400, { error: "session already ended" });
          return;
        }
        const body = await readBody(req);
        const prev = {
          harness: session.harness,
          model: session.model,
          thinking: session.thinking,
          agentSessionId: session.agentSessionId,
        };
        const harness = body.harness
          ? normalizeHarness(body.harness)
          : session.harness;
        const meta = HARNESS_META[harness] ?? HARNESS_META.codex;
        if (!binOnPath(BINS[harness])) {
          sendJson(res, 400, {
            error: `Harness "${harness}" CLI not found on PATH (${BINS[harness]}).`,
          });
          return;
        }
        const model =
          typeof body.model === "string" && body.model.trim()
            ? body.model.trim()
            : session.model;
        const thinking =
          typeof body.thinking === "string" && body.thinking.trim()
            ? body.thinking.trim()
            : session.thinking;

        const changed =
          harness !== session.harness ||
          model !== session.model ||
          thinking !== session.thinking;

        session.harness = harness;
        session.model = model;
        session.thinking = thinking;
        if (changed || body.forceReset) {
          session.agentSessionId = null;
          session.error = null;
          if (session.status === "error") session.status = "ready";
        }

        logLine(session.id, {
          type: "config",
          from: prev,
          to: { harness, model, thinking },
          agentReset: session.agentSessionId === null,
        });

        sendJson(res, 200, {
          ok: true,
          changed,
          session: publicSession(session),
        });
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
            if (session.status === "error" && !session.agentSessionId) {
              throw new Error(session.error ?? "coach unavailable");
            }
            if (session.error && !session.agentSessionId) {
              throw new Error(session.error);
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
          sendJson(res, 200, {
            reply,
            message: msg,
            session: publicSession(session),
          });
        } catch (err) {
          session.status = session.agentSessionId ? "ready" : "error";
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
          session.status = session.agentSessionId ? "ready" : "error";
          session.error = String(err?.message ?? err);
          sendJson(res, 502, { error: session.error });
        }
        return;
      }

      if (req.method === "POST" && action === "end") {
        endSession(session);
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
  const avail = harnessAvailability();
  const list = Object.entries(avail)
    .map(([k, v]) => `${k}${v ? "" : "✗"}`)
    .join(" ");
  console.log(
    `[coach] Sol coach listening on http://${HOST}:${PORT}  default=${DEFAULTS.harness}/${DEFAULTS.model}/${DEFAULTS.thinking}  bins: ${list}`,
  );
});
