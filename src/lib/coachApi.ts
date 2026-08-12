/** Thin client for scripts/coach-server.mjs (proxied at /api/coach). */

import type { CoachHarnessId, CoachPrefs } from "./coachConfig";

export type CoachStatus = "starting" | "ready" | "busy" | "error" | "ended";

export interface CoachServerMessage {
  role: "system" | "coach" | "user" | "note";
  text: string;
  at: string;
  kind?: string;
}

export interface CoachSessionInfo {
  id: string;
  harness?: CoachHarnessId | string;
  model?: string;
  thinking?: string;
  agentSessionId: string | null;
  /** @deprecated server still sends this as an alias */
  codexSessionId?: string | null;
  status: CoachStatus;
  error: string | null;
  createdAt: string;
  moveCount: number;
  messages: CoachServerMessage[];
}

export interface LessonCoachPayload {
  id: string;
  title: string;
  chapterId: string;
  chapterNumber: number;
  handNumber: number;
  dealer: string;
  vulnerability: string;
  tip: string;
  contract: string | null;
  declarer: string | null;
  hands: Record<string, string[]>;
}

/** Same-origin proxy (Vite). Falls back to direct loopback if proxy is down. */
const PROXY_BASE = "/api/coach";
const DIRECT_BASE = "http://127.0.0.1:8787/api/coach";

let resolvedBase: string | null = null;

async function probe(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

/** Prefer Vite proxy; fall back to coach server CORS on :8787. */
export async function resolveCoachBase(force = false): Promise<string | null> {
  if (!force && resolvedBase) {
    if (await probe(resolvedBase)) return resolvedBase;
    resolvedBase = null;
  }
  if (await probe(PROXY_BASE)) {
    resolvedBase = PROXY_BASE;
    return resolvedBase;
  }
  if (await probe(DIRECT_BASE)) {
    resolvedBase = DIRECT_BASE;
    return resolvedBase;
  }
  return null;
}

function baseOrThrow(): string {
  if (!resolvedBase) {
    throw new Error(
      "Sol coach server not reachable (tried /api/coach and http://127.0.0.1:8787)",
    );
  }
  return resolvedBase;
}

async function parseJson<T>(res: Response): Promise<T> {
  let data: T & { error?: string };
  try {
    data = (await res.json()) as T & { error?: string };
  } catch {
    throw new Error(`coach request failed (${res.status}, non-JSON body)`);
  }
  if (!res.ok) {
    const msg =
      typeof data.error === "string"
        ? data.error
        : `coach request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function coachHealth(): Promise<{
  ok: boolean;
  defaults?: Partial<CoachPrefs>;
  available?: Partial<Record<CoachHarnessId, boolean>>;
  base?: string;
}> {
  const base = await resolveCoachBase(true);
  if (!base) return { ok: false };
  try {
    const res = await fetch(`${base}/health`);
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      ok: boolean;
      defaults?: Partial<CoachPrefs>;
      available?: Partial<Record<CoachHarnessId, boolean>>;
      /** legacy fields from older servers */
      model?: string;
      reasoning?: string;
    };
    const defaults = data.defaults ?? {
      model: data.model,
      thinking: data.reasoning,
      harness: "codex" as CoachHarnessId,
    };
    return { ...data, defaults, base };
  } catch {
    return { ok: false };
  }
}

export async function startCoachSession(
  lesson: LessonCoachPayload,
  prefs: CoachPrefs,
): Promise<CoachSessionInfo> {
  await resolveCoachBase();
  const res = await fetch(`${baseOrThrow()}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lesson,
      harness: prefs.harness,
      model: prefs.model,
      thinking: prefs.thinking,
    }),
  });
  return parseJson<CoachSessionInfo>(res);
}

/** Update harness/model/thinking on an open session (resets agent thread). */
export async function updateCoachSessionConfig(
  sessionId: string,
  prefs: CoachPrefs,
): Promise<{
  ok: boolean;
  changed: boolean;
  session: CoachSessionInfo;
}> {
  const res = await fetch(`${baseOrThrow()}/sessions/${sessionId}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      harness: prefs.harness,
      model: prefs.model,
      thinking: prefs.thinking,
    }),
  });
  return parseJson(res);
}

export async function getCoachSession(
  sessionId: string,
): Promise<CoachSessionInfo> {
  const res = await fetch(`${baseOrThrow()}/sessions/${sessionId}`);
  return parseJson<CoachSessionInfo>(res);
}

export async function noteCoachMove(
  sessionId: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${baseOrThrow()}/sessions/${sessionId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  await parseJson(res);
}

export async function explainCoachMistake(
  sessionId: string,
  body: {
    phase: "bidding" | "play";
    actual: string;
    expected: string;
    teaching?: string;
    context?: string;
  },
  opts?: { signal?: AbortSignal },
): Promise<{
  reply: string;
  message: CoachServerMessage;
  session?: CoachSessionInfo;
}> {
  const res = await fetch(`${baseOrThrow()}/sessions/${sessionId}/mistake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
  return parseJson(res);
}

export async function chatWithCoach(
  sessionId: string,
  message: string,
  opts?: { signal?: AbortSignal },
): Promise<{
  reply: string;
  userMessage: CoachServerMessage;
  message: CoachServerMessage;
  session?: CoachSessionInfo;
}> {
  const res = await fetch(`${baseOrThrow()}/sessions/${sessionId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal: opts?.signal,
  });
  return parseJson(res);
}

export async function endCoachSession(sessionId: string): Promise<void> {
  try {
    const base = resolvedBase ?? (await resolveCoachBase());
    if (!base) return;
    await fetch(`${base}/sessions/${sessionId}/end`, { method: "POST" });
  } catch {
    // best-effort
  }
}

export function agentSessionIdOf(
  session?: CoachSessionInfo | null,
): string | null {
  if (!session) return null;
  return session.agentSessionId ?? session.codexSessionId ?? null;
}
