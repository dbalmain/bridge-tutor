import type { LessonProgress, Mistake, ProgressState } from "./types";

const KEY = "bridge-tutor-progress-v1";

function empty(): ProgressState {
  return {
    version: 1,
    lessons: {},
    mistakes: [],
    currentLessonId: null,
  };
}

export function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as ProgressState;
    if (data.version !== 1) return empty();
    return data;
  } catch {
    return empty();
  }
}

export function saveProgress(state: ProgressState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getLessonProgress(
  state: ProgressState,
  lessonId: string,
): LessonProgress {
  return (
    state.lessons[lessonId] ?? {
      lessonId,
      attempts: 0,
      completed: false,
      optimal: false,
      bestMistakes: null,
      lastPlayedAt: null,
    }
  );
}

export function recordAttemptStart(
  state: ProgressState,
  lessonId: string,
): ProgressState {
  const prev = getLessonProgress(state, lessonId);
  const lessons = {
    ...state.lessons,
    [lessonId]: {
      ...prev,
      attempts: prev.attempts + 1,
      lastPlayedAt: new Date().toISOString(),
    },
  };
  return { ...state, lessons, currentLessonId: lessonId };
}

export function recordMistake(
  state: ProgressState,
  mistake: Mistake,
): ProgressState {
  return {
    ...state,
    mistakes: [mistake, ...state.mistakes].slice(0, 500),
  };
}

export function recordLessonComplete(
  state: ProgressState,
  lessonId: string,
  mistakeCount: number,
): ProgressState {
  const prev = getLessonProgress(state, lessonId);
  const best =
    prev.bestMistakes == null
      ? mistakeCount
      : Math.min(prev.bestMistakes, mistakeCount);
  const lessons = {
    ...state.lessons,
    [lessonId]: {
      ...prev,
      completed: true,
      optimal: prev.optimal || mistakeCount === 0,
      bestMistakes: best,
      lastPlayedAt: new Date().toISOString(),
    },
  };
  return { ...state, lessons };
}

export function mistakeSummary(state: ProgressState): {
  tag: string;
  count: number;
}[] {
  const counts = new Map<string, number>();
  for (const m of state.mistakes) {
    for (const tag of m.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function exportProgressJson(state: ProgressState): string {
  return JSON.stringify(state, null, 2);
}

export function clearProgress(): ProgressState {
  const e = empty();
  saveProgress(e);
  return e;
}
