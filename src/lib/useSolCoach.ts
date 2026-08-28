import { useCallback, useEffect, useRef, useState } from "react";
import {
  coachUiName,
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
  updateCoachSessionConfig,
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
  /** Badge frozen with the thinking label so it cannot lag on "Sol". */
  const [thinkingBadge, setThinkingBadge] = useState<string | null>(null);
  const [prefs, setPrefsState] = useState<CoachPrefs>(() => loadCoachPrefs());

  const setThinking = useCallback((label: string | null, badge?: string | null) => {
    setThinkingLabel(label);
    setThinkingBadge(label ? (badge ?? null) : null);
  }, []);
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
  /** Abort in-flight mistake/chat when the hand restarts. */
  const turnAbortRef = useRef<AbortController | null>(null);
  const lastPayloadRef = useRef<LessonCoachPayload | null>(null);
  const pendingMistakesRef = useRef<MistakeBody[]>([]);
  const pendingMovesRef = useRef<string[]>([]);
  const mountedRef = useRef(true);
  const statusRef = useRef<CoachUiStatus>("idle");
  const prefsRef = useRef(prefs);

  const abortInFlightTurn = useCallback(() => {
    turnAbortRef.current?.abort();
    turnAbortRef.current = null;
  }, []);

  const beginTurnAbort = useCallback(() => {
    abortInFlightTurn();
    const ac = new AbortController();
    turnAbortRef.current = ac;
    return ac;
  }, [abortInFlightTurn]);

  const setStatusBoth = useCallback((next: CoachUiStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /** Prefs chosen while a turn is in flight; applied when it ends. */
  const pendingPrefsApplyRef = useRef<CoachPrefs | null>(null);

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

  const applyPrefsToSession = useCallback(
    async (next: CoachPrefs, { quiet }: { quiet?: boolean } = {}) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      try {
        const { session, changed } = await updateCoachSessionConfig(
          sessionId,
          next,
        );
        if (sessionIdRef.current !== sessionId) return;
        const applied: CoachPrefs = {
          harness: (session.harness as CoachHarnessId) ?? next.harness,
          model: session.model ?? next.model,
          thinking: session.thinking ?? next.thinking,
        };
        setSessionPrefs(applied);
        if (transcriptRef.current) {
          persist({
            ...transcriptRef.current,
            harness: applied.harness,
            model: applied.model,
            thinking: applied.thinking,
            agentSessionId: null,
            codexSessionId: null,
            updatedAt: new Date().toISOString(),
          });
        }
        if (changed && !quiet) {
          pushEntry(
            entryFromCoach(
              `Switched coach to ${formatCoachLabel(applied)}. Next mistake or chat uses this setup.`,
              "info",
              "system",
            ),
          );
        }
        if (statusRef.current === "error") {
          setStatusBoth("ready");
          setError(null);
        }
      } catch (err) {
        if (sessionIdRef.current !== sessionId) return;
        pushEntry(
          entryFromCoach(
            `Could not switch coach: ${err instanceof Error ? err.message : String(err)}. Try again when the coach is idle, or Restart the hand.`,
            "info",
            "system",
          ),
        );
      }
    },
    [persist, pushEntry, setStatusBoth],
  );

  const setPrefs = useCallback(
    (next: CoachPrefs) => {
      const prev = prefsRef.current;
      prefsRef.current = next;
      setPrefsState(next);
      saveCoachPrefs(next);

      const same =
        prev.harness === next.harness &&
        prev.model === next.model &&
        prev.thinking === next.thinking;
      if (same) return;

      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        // Hand not started; start() will use prefsRef.
        return;
      }

      // Don't reconfigure while a turn is in flight — queue until idle.
      if (
        statusRef.current === "thinking" ||
        statusRef.current === "starting"
      ) {
        pendingPrefsApplyRef.current = next;
        pushEntry(
          entryFromCoach(
            `Will switch to ${formatCoachLabel(next)} when the current reply finishes.`,
            "info",
            "system",
          ),
        );
        return;
      }

      pendingPrefsApplyRef.current = null;
      void applyPrefsToSession(next);
    },
    [applyPrefsToSession, pushEntry],
  );

  const flushPendingPrefs = useCallback(() => {
    const pending = pendingPrefsApplyRef.current;
    if (!pending || !sessionIdRef.current) return;
    pendingPrefsApplyRef.current = null;
    void applyPrefsToSession(pending);
  }, [applyPrefsToSession]);

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
        if (sessionIdRef.current !== sessionId) return;
        const name = coachUiName(prefsRef.current);
        const ac = beginTurnAbort();
        setStatusBoth("thinking");
        setThinking(
          `${name} is explaining that mistake… (first reply can take ~30–90s)`,
          name,
        );
        try {
          const { reply, message, session } = await explainCoachMistake(
            sessionId,
            body,
            { signal: ac.signal },
          );
          if (generationRef.current !== gen) return;
          if (sessionIdRef.current !== sessionId) return;
          rememberAgentSession(session);
          const key = `${message.at}|${reply.slice(0, 40)}`;
          seenCoachKeys.current.add(key);
          pushEntry(entryFromCoach(reply, "coach", body.phase, message.at));
          setStatusBoth("ready");
          setThinking(null);
          flushPendingPrefs();
        } catch (err) {
          if (generationRef.current !== gen) return;
          if (sessionIdRef.current !== sessionId) return;
          if (ac.signal.aborted) return;
          setStatusBoth("error");
          setError(String(err instanceof Error ? err.message : err));
          setThinking(null);
          pushEntry(
            entryFromCoach(
              `${name} could not explain that mistake: ${err instanceof Error ? err.message : String(err)}`,
              "info",
              "system",
            ),
          );
          flushPendingPrefs();
        }
      }
    },
    [
      beginTurnAbort,
      flushPendingPrefs,
      pushEntry,
      rememberAgentSession,
      setStatusBoth,
      setThinking,
    ],
  );

  const start = useCallback(
    async (payload: LessonCoachPayload) => {
      lastPayloadRef.current = payload;
      generationRef.current += 1;
      const gen = generationRef.current;
      const activePrefs = prefsRef.current;
      abortInFlightTurn();
      pendingPrefsApplyRef.current = null;

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

      const name = coachUiName(activePrefs);
      pushEntry(
        entryFromCoach(`Connecting to ${name} coach…`, "info", "system"),
      );
      setStatusBoth("starting");
      setThinking("Checking coach server…");

      const health = await coachHealth();
      if (generationRef.current !== gen) return;

      if (health.available) setAvailable(health.available);

      if (!health.ok) {
        setStatusBoth("unavailable");
        setError(
          "Coach server is not reachable. Run `npm run dev` (starts UI + coach) or `npm run coach` alongside the UI.",
        );
        setThinking(null);
        pushEntry(
          entryFromCoach(
            "Coach unavailable — start the coach server (`npm run dev` or `npm run coach` on port 8787), then Restart the hand.",
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
        setThinking(null);
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
          `${name} on standby (${formatCoachLabel(activePrefs)} · ${via}). Moves are queued; the coach only runs on a mistake or your chat.`,
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
          setError(session.error ?? "Coach session error");
          setThinking(null);
          return;
        }

        setStatusBoth("ready");
        setThinking(null);
      } catch (err) {
        if (generationRef.current !== gen) return;
        setStatusBoth("error");
        setError(String(err instanceof Error ? err.message : err));
        setThinking(null);
        pushEntry(
          entryFromCoach(
            `Could not open coach session: ${err instanceof Error ? err.message : String(err)}`,
            "info",
            "system",
          ),
        );
      }
    },
    [
      flushPending,
      abortInFlightTurn,
      lesson.chapterId,
      lesson.id,
      persist,
      pushEntry,
      setStatusBoth,
      setThinking,
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
      const gen = generationRef.current;
      const name = coachUiName(prefsRef.current);
      if (!id) {
        pendingMistakesRef.current.push(body);
        pushEntry(
          entryFromCoach(
            `Noted your mistake — ${name} will explain once the coach session is ready…`,
            "info",
            "system",
          ),
        );
        return;
      }
      const ac = beginTurnAbort();
      setStatusBoth("thinking");
      setThinking(
        `${name} is explaining that mistake… (first reply can take ~30–90s)`,
        name,
      );
      try {
        const { reply, message, session } = await explainCoachMistake(
          id,
          body,
          { signal: ac.signal },
        );
        if (generationRef.current !== gen) return;
        if (sessionIdRef.current !== id) return;
        rememberAgentSession(session);
        const key = `${message.at}|${reply.slice(0, 40)}`;
        seenCoachKeys.current.add(key);
        pushEntry(entryFromCoach(reply, "coach", body.phase, message.at));
        setStatusBoth("ready");
        setThinking(null);
        flushPendingPrefs();
      } catch (err) {
        if (generationRef.current !== gen) return;
        if (sessionIdRef.current !== id) return;
        if (ac.signal.aborted) return;
        setStatusBoth("error");
        setError(String(err instanceof Error ? err.message : err));
        setThinking(null);
        pushEntry(
          entryFromCoach(
            `${name} could not explain that mistake: ${err instanceof Error ? err.message : String(err)}`,
            "info",
            "system",
          ),
        );
        flushPendingPrefs();
      }
    },
    [
      beginTurnAbort,
      flushPendingPrefs,
      pushEntry,
      rememberAgentSession,
      setStatusBoth,
      setThinking,
    ],
  );

  const chat = useCallback(
    async (message: string) => {
      const id = sessionIdRef.current;
      const gen = generationRef.current;
      const trimmed = message.trim();
      const name = coachUiName(prefsRef.current);
      if (!trimmed) return;
      if (!id) {
        pushEntry(entryFromCoach(trimmed, "user", "chat"));
        pushEntry(
          entryFromCoach(
            `${name} is not connected yet — wait for the session, or Restart the hand.`,
            "info",
            "system",
          ),
        );
        return;
      }
      const ac = beginTurnAbort();
      pushEntry(entryFromCoach(trimmed, "user", "chat"));
      setStatusBoth("thinking");
      setThinking(`${name} is thinking…`, name);
      try {
        const { reply, message: coachMsg, session } = await chatWithCoach(
          id,
          trimmed,
          { signal: ac.signal },
        );
        if (generationRef.current !== gen) return;
        if (sessionIdRef.current !== id) return;
        rememberAgentSession(session);
        const key = `${coachMsg.at}|${reply.slice(0, 40)}`;
        seenCoachKeys.current.add(key);
        pushEntry(entryFromCoach(reply, "coach", "chat", coachMsg.at));
        setStatusBoth("ready");
        setThinking(null);
        flushPendingPrefs();
      } catch (err) {
        if (generationRef.current !== gen) return;
        if (sessionIdRef.current !== id) return;
        if (ac.signal.aborted) return;
        setStatusBoth("error");
        setError(String(err instanceof Error ? err.message : err));
        setThinking(null);
        pushEntry(
          entryFromCoach(
            `${name} could not reply: ${err instanceof Error ? err.message : String(err)}`,
            "info",
            "system",
          ),
        );
        flushPendingPrefs();
      }
    },
    [
      beginTurnAbort,
      flushPendingPrefs,
      pushEntry,
      rememberAgentSession,
      setStatusBoth,
      setThinking,
    ],
  );

  const resetLocal = useCallback(() => {
    generationRef.current += 1;
    abortInFlightTurn();
    const id = sessionIdRef.current;
    if (id) void endCoachSession(id);
    sessionIdRef.current = null;
    transcriptRef.current = null;
    seenCoachKeys.current = new Set();
    pendingMistakesRef.current = [];
    pendingMovesRef.current = [];
    pendingPrefsApplyRef.current = null;
    lastPayloadRef.current = null;
    setEntries([]);
    setSessionPrefs(null);
    setStatusBoth("idle");
    setError(null);
    setThinking(null);
  }, [abortInFlightTurn, setStatusBoth, setThinking]);

  const retry = useCallback(() => {
    const payload = lastPayloadRef.current;
    if (payload) void start(payload);
  }, [start]);

  return {
    status,
    error,
    entries,
    thinkingLabel,
    thinkingBadge,
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
