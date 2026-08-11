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

const BASE = "/api/coach";

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    const msg =
      typeof (data as { error?: string }).error === "string"
        ? (data as { error: string }).error
        : `coach request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function coachHealth(): Promise<{
  ok: boolean;
  model?: string;
  reasoning?: string;
}> {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) return { ok: false };
    return (await res.json()) as { ok: boolean; model?: string; reasoning?: string };
  } catch {
    return { ok: false };
  }
}

export async function startCoachSession(
  lesson: LessonCoachPayload,
): Promise<CoachSessionInfo> {
  const res = await fetch(`${BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lesson }),
  });
  return parseJson<CoachSessionInfo>(res);
}

export async function getCoachSession(
  sessionId: string,
): Promise<CoachSessionInfo> {
  const res = await fetch(`${BASE}/sessions/${sessionId}`);
  return parseJson<CoachSessionInfo>(res);
}

export async function noteCoachMove(
  sessionId: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/move`, {
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
  const res = await fetch(`${BASE}/sessions/${sessionId}/mistake`, {
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
  const res = await fetch(`${BASE}/sessions/${sessionId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return parseJson(res);
}

export async function endCoachSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${BASE}/sessions/${sessionId}/end`, { method: "POST" });
  } catch {
    // best-effort
  }
}
