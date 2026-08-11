import type { CoachStore, CoachTranscript, CommentaryEntry } from "./types";

const KEY = "bridge-tutor-coach-v1";
const MAX_TRANSCRIPTS = 100;
const MAX_ENTRIES_PER = 400;

function empty(): CoachStore {
  return { version: 1, transcripts: [] };
}

export function loadCoachStore(): CoachStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as CoachStore;
    if (data.version !== 1 || !Array.isArray(data.transcripts)) return empty();
    // Migrate older transcripts that only stored codexSessionId.
    data.transcripts = data.transcripts.map((t) => {
      const agentSessionId =
        t.agentSessionId ?? t.codexSessionId ?? null;
      return { ...t, agentSessionId, codexSessionId: agentSessionId };
    });
    return data;
  } catch {
    return empty();
  }
}

export function saveCoachStore(store: CoachStore): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function createTranscript(meta: {
  lessonId: string;
  chapterId: string;
  harness?: string;
  model?: string;
  thinking?: string;
  agentSessionId?: string | null;
  codexSessionId?: string | null;
}): CoachTranscript {
  const now = new Date().toISOString();
  const agentId = meta.agentSessionId ?? meta.codexSessionId ?? null;
  return {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lessonId: meta.lessonId,
    chapterId: meta.chapterId,
    startedAt: now,
    updatedAt: now,
    harness: meta.harness,
    model: meta.model,
    thinking: meta.thinking,
    agentSessionId: agentId,
    codexSessionId: agentId,
    entries: [],
  };
}

export function upsertTranscript(
  store: CoachStore,
  transcript: CoachTranscript,
): CoachStore {
  const rest = store.transcripts.filter((t) => t.id !== transcript.id);
  return {
    ...store,
    transcripts: [transcript, ...rest].slice(0, MAX_TRANSCRIPTS),
  };
}

export function appendTranscriptEntry(
  transcript: CoachTranscript,
  entry: Omit<CommentaryEntry, "id"> & { id?: string },
): CoachTranscript {
  const id =
    entry.id ??
    `ce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const next: CommentaryEntry = {
    ...entry,
    id,
    at: entry.at ?? new Date().toISOString(),
  };
  return {
    ...transcript,
    updatedAt: next.at!,
    entries: [...transcript.entries, next].slice(-MAX_ENTRIES_PER),
  };
}

export function setTranscriptAgentSessionId(
  transcript: CoachTranscript,
  agentSessionId: string | null,
): CoachTranscript {
  return {
    ...transcript,
    agentSessionId,
    codexSessionId: agentSessionId,
    updatedAt: new Date().toISOString(),
  };
}

/** @deprecated use setTranscriptAgentSessionId */
export const setTranscriptCodexId = setTranscriptAgentSessionId;

export function transcriptsForLesson(
  store: CoachStore,
  lessonId: string,
): CoachTranscript[] {
  return store.transcripts.filter((t) => t.lessonId === lessonId);
}
