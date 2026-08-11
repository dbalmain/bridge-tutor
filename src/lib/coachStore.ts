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
  codexSessionId?: string | null;
}): CoachTranscript {
  const now = new Date().toISOString();
  return {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lessonId: meta.lessonId,
    chapterId: meta.chapterId,
    startedAt: now,
    updatedAt: now,
    codexSessionId: meta.codexSessionId ?? null,
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

export function setTranscriptCodexId(
  transcript: CoachTranscript,
  codexSessionId: string | null,
): CoachTranscript {
  return {
    ...transcript,
    codexSessionId,
    updatedAt: new Date().toISOString(),
  };
}

export function transcriptsForLesson(
  store: CoachStore,
  lessonId: string,
): CoachTranscript[] {
  return store.transcripts.filter((t) => t.lessonId === lessonId);
}
