/** Thin client for scripts/coach-server.mjs (proxied at /api/coach). */

export type CoachStatus = "starting" | "ready" | "busy" | "error" | "ended";

export interface CoachServerMessage {
  role: "system" | "coach" | "user" | "note";
  text: string;
  at: string;
  kind?: string;
}

export interface CoachSessionInfo {
  id: string;
  codexSessionId: string | null;
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
  model?: string;
  reasoning?: string;
  base?: string;
}> {
  const base = await resolveCoachBase(true);
  if (!base) return { ok: false };
  try {
    const res = await fetch(`${base}/health`);
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      ok: boolean;
      model?: string;
      reasoning?: string;
    };
    return { ...data, base };
  } catch {
    return { ok: false };
  }
}

export async function startCoachSession(
  lesson: LessonCoachPayload,
): Promise<CoachSessionInfo> {
  await resolveCoachBase();
  const res = await fetch(`${baseOrThrow()}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lesson }),
  });
  return parseJson<CoachSessionInfo>(res);
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
): Promise<{ reply: string; message: CoachServerMessage }> {
  const res = await fetch(`${baseOrThrow()}/sessions/${sessionId}/mistake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function chatWithCoach(
  sessionId: string,
  message: string,
): Promise<{
  reply: string;
  userMessage: CoachServerMessage;
  message: CoachServerMessage;
}> {
  const res = await fetch(`${baseOrThrow()}/sessions/${sessionId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
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
