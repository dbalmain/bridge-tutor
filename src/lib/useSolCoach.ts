import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendTranscriptEntry,
  createTranscript,
  loadCoachStore,
  saveCoachStore,
  setTranscriptCodexId,
  upsertTranscript,
} from "./coachStore";
import {
  chatWithCoach,
  coachHealth,
  endCoachSession,
  explainCoachMistake,
  getCoachSession,
  noteCoachMove,
  startCoachSession,
  type LessonCoachPayload,
} from "./coachApi";
import type { CoachTranscript, CommentaryEntry } from "./types";

export type CoachUiStatus =
  | "idle"
  | "unavailable"
  | "starting"
  | "ready"
  | "thinking"
  | "error";

type MistakeBody = {
  phase: "bidding" | "play";
  actual: string;
  expected: string;
  teaching?: string;
  context?: string;
};

function entryFromCoach(
  text: string,
  kind: CommentaryEntry["kind"],
  phase: CommentaryEntry["phase"] = "chat",
  at?: string,
): CommentaryEntry {
  return {
    id: `sol-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    phase,
    text,
    at: at ?? new Date().toISOString(),
  };
}

export function useSolCoach(lesson: {
  id: string;
  chapterId: string;
}) {
  const [status, setStatus] = useState<CoachUiStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<CommentaryEntry[]>([]);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<CoachTranscript | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenCoachKeys = useRef(new Set<string>());
  /** Ignore stale async work after stop/restart. */
  const generationRef = useRef(0);
  const lastPayloadRef = useRef<LessonCoachPayload | null>(null);
  const pendingMistakesRef = useRef<MistakeBody[]>([]);
  const pendingMovesRef = useRef<string[]>([]);
  const mountedRef = useRef(true);
  const statusRef = useRef<CoachUiStatus>("idle");

  const setStatusBoth = useCallback((next: CoachUiStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Do not end the codex session on React Strict Mode remount — only on
      // intentional stop/reset. Clearing the poll timer is enough here.
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const persist = useCallback((t: CoachTranscript) => {
    transcriptRef.current = t;
    saveCoachStore(upsertTranscript(loadCoachStore(), t));
  }, []);

  const pushEntry = useCallback(
    (entry: CommentaryEntry) => {
      if (!mountedRef.current) return;
      setEntries((prev) => [...prev, entry]);
      if (transcriptRef.current) {
        persist(appendTranscriptEntry(transcriptRef.current, entry));
      }
    },
    [persist],
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const flushPending = useCallback(
    async (sessionId: string, gen: number) => {
      const moves = pendingMovesRef.current.splice(0);
      for (const text of moves) {
        if (generationRef.current !== gen) return;
        try {
          await noteCoachMove(sessionId, text);
        } catch {
          // ignore
        }
      }
      const mistakes = pendingMistakesRef.current.splice(0);
      for (const body of mistakes) {
        if (generationRef.current !== gen) return;
        if (!mountedRef.current) return;
        setStatusBoth("thinking");
        setThinkingLabel("Sol is explaining that mistake…");
        try {
          const { reply, message } = await explainCoachMistake(sessionId, body);
          if (generationRef.current !== gen) return;
          const key = `${message.at}|${reply.slice(0, 40)}`;
          seenCoachKeys.current.add(key);
          pushEntry(entryFromCoach(reply, "coach", body.phase, message.at));
          setStatusBoth("ready");
          setThinkingLabel(null);
        } catch (err) {
          if (generationRef.current !== gen) return;
          setStatusBoth("error");
          setError(String(err instanceof Error ? err.message : err));
          setThinkingLabel(null);
          pushEntry(
            entryFromCoach(
              `Sol could not explain that mistake: ${err instanceof Error ? err.message : String(err)}`,
              "info",
              "system",
            ),
          );
        }
      }
    },
    [pushEntry, setStatusBoth],
  );

  const start = useCallback(
    async (payload: LessonCoachPayload) => {
      lastPayloadRef.current = payload;
      stopPolling();
      generationRef.current += 1;
      const gen = generationRef.current;

      if (sessionIdRef.current) {
        const old = sessionIdRef.current;
        sessionIdRef.current = null;
        void endCoachSession(old);
      }

      setEntries([]);
      setError(null);
      seenCoachKeys.current = new Set();
      pendingMistakesRef.current = [];
      pendingMovesRef.current = [];

      pushEntry(
        entryFromCoach(
          "Connecting to Sol coach…",
          "info",
          "system",
        ),
      );
      setStatusBoth("starting");
      setThinkingLabel("Sol is joining this hand…");

      const health = await coachHealth();
      if (generationRef.current !== gen) return;

      if (!health.ok) {
        setStatusBoth("unavailable");
        setError(
          "Sol coach server is not reachable. Run `npm run dev` (starts UI + coach) or `npm run coach` alongside the UI. Needs the codex CLI logged in.",
        );
        setThinkingLabel(null);
        pushEntry(
          entryFromCoach(
            "Sol coach unavailable — start the coach server (`npm run dev` or `npm run coach` on port 8787), then Restart the hand.",
            "info",
            "system",
          ),
        );
        return;
      }

      const via =
        health.base === "/api/coach" ? "Vite proxy" : "direct :8787";
      pushEntry(
        entryFromCoach(
          `Sol coach online (${health.model ?? "model?"} · ${health.reasoning ?? "?"} · ${via}). Opening session…`,
          "info",
          "system",
        ),
      );

      const transcript = createTranscript({
        lessonId: lesson.id,
        chapterId: lesson.chapterId,
      });
      transcriptRef.current = transcript;
      persist(transcript);

      try {
        const session = await startCoachSession(payload);
        if (generationRef.current !== gen) return;

        sessionIdRef.current = session.id;
        // Session id is enough to feed moves / queue mistakes while Sol boots.
        void flushPending(session.id, gen);

        pollRef.current = setInterval(() => {
          void (async () => {
            if (generationRef.current !== gen) {
              stopPolling();
              return;
            }
            const id = sessionIdRef.current;
            if (!id) return;
            try {
              const s = await getCoachSession(id);
              if (s.codexSessionId && transcriptRef.current) {
                persist(
                  setTranscriptCodexId(transcriptRef.current, s.codexSessionId),
                );
              }
              for (const m of s.messages) {
                if (m.role !== "coach") continue;
                const key = `${m.at}|${m.text.slice(0, 40)}`;
                if (seenCoachKeys.current.has(key)) continue;
                seenCoachKeys.current.add(key);
                pushEntry(entryFromCoach(m.text, "coach", "system", m.at));
              }
              if (s.status === "ready") {
                setStatusBoth("ready");
                setThinkingLabel(null);
                stopPolling();
              } else if (s.status === "error") {
                setStatusBoth("error");
                setError(s.error ?? "Sol failed to start");
                setThinkingLabel(null);
                pushEntry(
                  entryFromCoach(
                    `Sol failed to start: ${s.error ?? "unknown error"}`,
                    "info",
                    "system",
                  ),
                );
                stopPolling();
              }
            } catch (err) {
              // Keep polling for a bit; surface after many failures via timeout below.
              console.warn("[sol-coach] poll failed", err);
            }
          })();
        }, 1500);

        // Safety: if Sol never becomes ready, stop the spinner after 3 minutes.
        window.setTimeout(() => {
          if (generationRef.current !== gen) return;
          if (statusRef.current !== "starting") return;
          stopPolling();
          setStatusBoth("error");
          setError("Sol is taking too long to join — try Restart hand.");
          setThinkingLabel(null);
          pushEntry(
            entryFromCoach(
              "Sol is taking too long to join this hand. You can keep playing; Restart to retry coaching.",
              "info",
              "system",
            ),
          );
        }, 180_000);
      } catch (err) {
        if (generationRef.current !== gen) return;
        setStatusBoth("error");
        setError(String(err instanceof Error ? err.message : err));
        setThinkingLabel(null);
        pushEntry(
          entryFromCoach(
            `Could not open Sol session: ${err instanceof Error ? err.message : String(err)}`,
            "info",
            "system",
          ),
        );
      }
    },
    [
      flushPending,
      lesson.chapterId,
      lesson.id,
      persist,
      pushEntry,
      setStatusBoth,
      stopPolling,
    ],
  );

  const noteMove = useCallback(async (text: string) => {
    const id = sessionIdRef.current;
    if (!id) {
      pendingMovesRef.current.push(text);
      return;
    }
    try {
      await noteCoachMove(id, text);
    } catch {
      // non-fatal
    }
  }, []);

  const explainMistake = useCallback(
    async (body: MistakeBody) => {
      const id = sessionIdRef.current;
      if (!id) {
        pendingMistakesRef.current.push(body);
        pushEntry(
          entryFromCoach(
            "Noted your mistake — Sol will explain once the coach session is ready…",
            "info",
            "system",
          ),
        );
        return;
      }
      setStatusBoth("thinking");
      setThinkingLabel("Sol is explaining that mistake…");
      try {
        const { reply, message } = await explainCoachMistake(id, body);
        const key = `${message.at}|${reply.slice(0, 40)}`;
        seenCoachKeys.current.add(key);
        pushEntry(entryFromCoach(reply, "coach", body.phase, message.at));
        setStatusBoth("ready");
        setThinkingLabel(null);
      } catch (err) {
        setStatusBoth("error");
        setError(String(err instanceof Error ? err.message : err));
        setThinkingLabel(null);
        pushEntry(
          entryFromCoach(
            `Sol could not explain that mistake: ${err instanceof Error ? err.message : String(err)}`,
            "info",
            "system",
          ),
        );
      }
    },
    [pushEntry, setStatusBoth],
  );

  const chat = useCallback(
    async (message: string) => {
      const id = sessionIdRef.current;
      const trimmed = message.trim();
      if (!trimmed) return;
      if (!id) {
        pushEntry(entryFromCoach(trimmed, "user", "chat"));
        pushEntry(
          entryFromCoach(
            "Sol is not connected yet — wait for the session, or Restart the hand.",
            "info",
            "system",
          ),
        );
        return;
      }
      pushEntry(entryFromCoach(trimmed, "user", "chat"));
      setStatusBoth("thinking");
      setThinkingLabel("Sol is thinking…");
      try {
        const { reply, message: coachMsg } = await chatWithCoach(id, trimmed);
        const key = `${coachMsg.at}|${reply.slice(0, 40)}`;
        seenCoachKeys.current.add(key);
        pushEntry(entryFromCoach(reply, "coach", "chat", coachMsg.at));
        setStatusBoth("ready");
        setThinkingLabel(null);
      } catch (err) {
        setStatusBoth("error");
        setError(String(err instanceof Error ? err.message : err));
        setThinkingLabel(null);
        pushEntry(
          entryFromCoach(
            `Sol could not reply: ${err instanceof Error ? err.message : String(err)}`,
            "info",
            "system",
          ),
        );
      }
    },
    [pushEntry, setStatusBoth],
  );

  const resetLocal = useCallback(() => {
    stopPolling();
    generationRef.current += 1;
    const id = sessionIdRef.current;
    if (id) void endCoachSession(id);
    sessionIdRef.current = null;
    transcriptRef.current = null;
    seenCoachKeys.current = new Set();
    pendingMistakesRef.current = [];
    pendingMovesRef.current = [];
    lastPayloadRef.current = null;
    setEntries([]);
    setStatusBoth("idle");
    setError(null);
    setThinkingLabel(null);
  }, [setStatusBoth, stopPolling]);

  const retry = useCallback(() => {
    const payload = lastPayloadRef.current;
    if (payload) void start(payload);
  }, [start]);

  return {
    status,
    error,
    entries,
    thinkingLabel,
    start,
    stop: resetLocal,
    retry,
    noteMove,
    explainMistake,
    chat,
    /** Show the composer once we've attempted a connection this hand. */
    sessionActive: status !== "idle",
    canChat:
      status === "ready" ||
      status === "thinking" ||
      status === "starting" ||
      status === "error",
  };
}
