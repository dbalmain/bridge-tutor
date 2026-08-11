import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatCoachLabel,
  loadCoachPrefs,
  saveCoachPrefs,
  type CoachHarnessId,
  type CoachPrefs,
} from "./coachConfig";
import {
  appendTranscriptEntry,
  createTranscript,
  loadCoachStore,
  saveCoachStore,
  setTranscriptAgentSessionId,
  upsertTranscript,
} from "./coachStore";
import {
  agentSessionIdOf,
  chatWithCoach,
  coachHealth,
  endCoachSession,
  explainCoachMistake,
  noteCoachMove,
  startCoachSession,
  type CoachSessionInfo,
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
  const [prefs, setPrefsState] = useState<CoachPrefs>(() => loadCoachPrefs());
  /** Prefs locked into the current hand's server session (null if none). */
  const [sessionPrefs, setSessionPrefs] = useState<CoachPrefs | null>(null);
  const [available, setAvailable] = useState<
    Partial<Record<CoachHarnessId, boolean>>
  >({});

  const sessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<CoachTranscript | null>(null);
  const seenCoachKeys = useRef(new Set<string>());
  /** Ignore stale async work after stop/restart. */
  const generationRef = useRef(0);
  const lastPayloadRef = useRef<LessonCoachPayload | null>(null);
  const pendingMistakesRef = useRef<MistakeBody[]>([]);
  const pendingMovesRef = useRef<string[]>([]);
  const mountedRef = useRef(true);
  const statusRef = useRef<CoachUiStatus>("idle");
  const prefsRef = useRef(prefs);

  const setStatusBoth = useCallback((next: CoachUiStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const setPrefs = useCallback((next: CoachPrefs) => {
    prefsRef.current = next;
    setPrefsState(next);
    saveCoachPrefs(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Soft probe so harness dropdown can grey out missing CLIs before Start.
  useEffect(() => {
    let cancelled = false;
    void coachHealth().then((h) => {
      if (cancelled || !h.available) return;
      setAvailable(h.available);
    });
    return () => {
      cancelled = true;
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

  const rememberAgentSession = useCallback(
    (session?: CoachSessionInfo) => {
      const agentId = agentSessionIdOf(session);
      if (!agentId || !transcriptRef.current) return;
      if (transcriptRef.current.agentSessionId === agentId) return;
      persist(setTranscriptAgentSessionId(transcriptRef.current, agentId));
    },
    [persist],
  );

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
          const { reply, message, session } = await explainCoachMistake(
            sessionId,
            body,
          );
          if (generationRef.current !== gen) return;
          rememberAgentSession(session);
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
    [pushEntry, rememberAgentSession, setStatusBoth],
  );

  const start = useCallback(
    async (payload: LessonCoachPayload) => {
      lastPayloadRef.current = payload;
      generationRef.current += 1;
      const gen = generationRef.current;
      const activePrefs = prefsRef.current;

      if (sessionIdRef.current) {
        const old = sessionIdRef.current;
        sessionIdRef.current = null;
        void endCoachSession(old);
      }

      setEntries([]);
      setError(null);
      setSessionPrefs(null);
      seenCoachKeys.current = new Set();
      pendingMistakesRef.current = [];
      pendingMovesRef.current = [];

      pushEntry(
        entryFromCoach("Connecting to Sol coach…", "info", "system"),
      );
      setStatusBoth("starting");
      setThinkingLabel("Checking coach server…");

      const health = await coachHealth();
      if (generationRef.current !== gen) return;

      if (health.available) setAvailable(health.available);

      if (!health.ok) {
        setStatusBoth("unavailable");
        setError(
          "Sol coach server is not reachable. Run `npm run dev` (starts UI + coach) or `npm run coach` alongside the UI.",
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

      if (health.available && health.available[activePrefs.harness] === false) {
        setStatusBoth("error");
        setError(
          `Harness "${activePrefs.harness}" CLI not found. Pick another harness in the coach settings.`,
        );
        setThinkingLabel(null);
        pushEntry(
          entryFromCoach(
            `Harness "${activePrefs.harness}" is not installed on this machine. Choose Codex, Grok, OpenCode, or Claude Code above.`,
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
          `Sol on standby (${formatCoachLabel(activePrefs)} · ${via}). Moves are queued; Sol only runs on a mistake or your chat.`,
          "info",
          "system",
        ),
      );

      const transcript = createTranscript({
        lessonId: lesson.id,
        chapterId: lesson.chapterId,
        harness: activePrefs.harness,
        model: activePrefs.model,
        thinking: activePrefs.thinking,
      });
      transcriptRef.current = transcript;
      persist(transcript);

      try {
        const session = await startCoachSession(payload, activePrefs);
        if (generationRef.current !== gen) return;

        sessionIdRef.current = session.id;
        setSessionPrefs({
          harness: (session.harness as CoachHarnessId) ?? activePrefs.harness,
          model: session.model ?? activePrefs.model,
          thinking: session.thinking ?? activePrefs.thinking,
        });
        // Local session only — agent starts on first mistake/chat.
        void flushPending(session.id, gen);

        if (session.status === "error") {
          setStatusBoth("error");
          setError(session.error ?? "Sol session error");
          setThinkingLabel(null);
          return;
        }

        setStatusBoth("ready");
        setThinkingLabel(null);
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
        const { reply, message, session } = await explainCoachMistake(id, body);
        rememberAgentSession(session);
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
    [pushEntry, rememberAgentSession, setStatusBoth],
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
        const { reply, message: coachMsg, session } = await chatWithCoach(
          id,
          trimmed,
        );
        rememberAgentSession(session);
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
    [pushEntry, rememberAgentSession, setStatusBoth],
  );

  const resetLocal = useCallback(() => {
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
    setSessionPrefs(null);
    setStatusBoth("idle");
    setError(null);
    setThinkingLabel(null);
  }, [setStatusBoth]);

  const retry = useCallback(() => {
    const payload = lastPayloadRef.current;
    if (payload) void start(payload);
  }, [start]);

  return {
    status,
    error,
    entries,
    thinkingLabel,
    prefs,
    setPrefs,
    sessionPrefs,
    available,
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
