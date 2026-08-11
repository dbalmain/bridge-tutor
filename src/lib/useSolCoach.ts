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

  const persist = useCallback((t: CoachTranscript) => {
    transcriptRef.current = t;
    saveCoachStore(upsertTranscript(loadCoachStore(), t));
  }, []);

  const pushEntry = useCallback(
    (entry: CommentaryEntry) => {
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

  const stop = useCallback(async () => {
    stopPolling();
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    if (id) await endCoachSession(id);
    setStatus("idle");
    setThinkingLabel(null);
    setError(null);
  }, [stopPolling]);

  useEffect(() => () => {
    void stop();
  }, [stop]);

  const start = useCallback(
    async (payload: LessonCoachPayload) => {
      stopPolling();
      if (sessionIdRef.current) {
        await endCoachSession(sessionIdRef.current);
        sessionIdRef.current = null;
      }
      setEntries([]);
      setError(null);
      seenCoachKeys.current = new Set();

      const health = await coachHealth();
      if (!health.ok) {
        setStatus("unavailable");
        setError(
          "Sol coach server is not running. Start with npm run dev (or npm run coach).",
        );
        return;
      }

      setStatus("starting");
      setThinkingLabel("Sol is joining this hand…");

      const transcript = createTranscript({
        lessonId: lesson.id,
        chapterId: lesson.chapterId,
      });
      transcriptRef.current = transcript;
      persist(transcript);

      try {
        const session = await startCoachSession(payload);
        sessionIdRef.current = session.id;

        // Poll until the background start turn finishes.
        pollRef.current = setInterval(() => {
          void (async () => {
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
                pushEntry(
                  entryFromCoach(m.text, "coach", "system", m.at),
                );
              }
              if (s.status === "ready") {
                setStatus("ready");
                setThinkingLabel(null);
                stopPolling();
              } else if (s.status === "error") {
                setStatus("error");
                setError(s.error ?? "Sol failed to start");
                setThinkingLabel(null);
                stopPolling();
              }
            } catch {
              // keep polling briefly
            }
          })();
        }, 1500);
      } catch (err) {
        setStatus("error");
        setError(String(err instanceof Error ? err.message : err));
        setThinkingLabel(null);
      }
    },
    [lesson.chapterId, lesson.id, persist, pushEntry, stopPolling],
  );

  const noteMove = useCallback(async (text: string) => {
    const id = sessionIdRef.current;
    if (!id) return;
    try {
      await noteCoachMove(id, text);
    } catch {
      // non-fatal; play continues without coach context
    }
  }, []);

  const explainMistake = useCallback(
    async (body: {
      phase: "bidding" | "play";
      actual: string;
      expected: string;
      teaching?: string;
      context?: string;
    }) => {
      const id = sessionIdRef.current;
      if (!id) return;
      setStatus("thinking");
      setThinkingLabel("Sol is explaining that mistake…");
      try {
        const { reply, message } = await explainCoachMistake(id, body);
        const key = `${message.at}|${reply.slice(0, 40)}`;
        seenCoachKeys.current.add(key);
        pushEntry(entryFromCoach(reply, "coach", body.phase, message.at));
        setStatus("ready");
        setThinkingLabel(null);
      } catch (err) {
        setStatus("error");
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
    [pushEntry],
  );

  const chat = useCallback(
    async (message: string) => {
      const id = sessionIdRef.current;
      const trimmed = message.trim();
      if (!id || !trimmed) return;
      pushEntry(entryFromCoach(trimmed, "user", "chat"));
      setStatus("thinking");
      setThinkingLabel("Sol is thinking…");
      try {
        const { reply, message: coachMsg } = await chatWithCoach(id, trimmed);
        const key = `${coachMsg.at}|${reply.slice(0, 40)}`;
        seenCoachKeys.current.add(key);
        pushEntry(entryFromCoach(reply, "coach", "chat", coachMsg.at));
        setStatus("ready");
        setThinkingLabel(null);
      } catch (err) {
        setStatus("error");
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
    [pushEntry],
  );

  const resetLocal = useCallback(() => {
    stopPolling();
    const id = sessionIdRef.current;
    if (id) void endCoachSession(id);
    sessionIdRef.current = null;
    transcriptRef.current = null;
    seenCoachKeys.current = new Set();
    setEntries([]);
    setStatus("idle");
    setError(null);
    setThinkingLabel(null);
  }, [stopPolling]);

  return {
    status,
    error,
    entries,
    thinkingLabel,
    start,
    stop: resetLocal,
    noteMove,
    explainMistake,
    chat,
    canChat:
      status === "ready" || status === "thinking" || status === "error",
    /** True once we've attempted to open a Sol session for this hand. */
    sessionActive:
      status === "starting" ||
      status === "ready" ||
      status === "thinking" ||
      status === "error",
  };
}
