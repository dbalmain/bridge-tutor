import data from "../data/bidding-curriculum.json";

export interface BidChapter {
  id: string;
  number: number;
  title: string;
  summary: string;
  concepts: string[];
}

/** A rule taught in an earlier lesson that this one leans on. */
export interface BidRevisit {
  lessonId: string;
  lessonNumber: number;
  what: string;
}

export interface BidLesson {
  id: string;
  chapterId: string;
  chapterNumber: number;
  lessonNumber: number;
  title: string;
  tip: string;
  /** The one thing this lesson adds that no earlier lesson taught. */
  newHere?: string;
  revisits?: BidRevisit[];
  teaching: string[];
  rules: string[];
  leaves: string[];
  quizCount: number;
}

export interface BidCurriculum {
  meta: {
    title: string;
    system: string;
    source: string;
    version: number;
  };
  chapters: BidChapter[];
  lessons: BidLesson[];
}

export const biddingCurriculum = data as BidCurriculum;

export function findBidLesson(id: string | undefined): BidLesson | undefined {
  if (!id) return undefined;
  return biddingCurriculum.lessons.find((l) => l.id === id);
}

export function chapterOfBid(lesson: BidLesson): BidChapter | undefined {
  return biddingCurriculum.chapters.find((c) => c.id === lesson.chapterId);
}

export function nextBidLesson(lesson: BidLesson): BidLesson | undefined {
  return biddingCurriculum.lessons.find(
    (l) =>
      l.chapterNumber > lesson.chapterNumber ||
      (l.chapterNumber === lesson.chapterNumber &&
        l.lessonNumber > lesson.lessonNumber),
  );
}

/**
 * Opening-family lessons stop the student after the opening; the rest of
 * the uncontested auction plays itself. Later lessons bid every in-tree
 * South call through to pass-out.
 */
export function lessonStudentBids(lesson: BidLesson): number | undefined {
  if (lesson.leaves.length > 0 && lesson.leaves.every((id) => id.startsWith("open."))) {
    return 1;
  }
  return undefined;
}

/**
 * The same bound, for one hand rather than a whole lesson.
 *
 * A run mixes the lesson's own leaves with review hands from earlier
 * lessons, and those can be a different family — an opening drill inside a
 * responding lesson. The bound belongs to the hand on the table, not to the
 * lesson it appears in.
 */
export function leafStudentBids(leafId: string | undefined): number | undefined {
  return leafId?.startsWith("open.") ? 1 : undefined;
}

/** Lessons that come before this one, in course order. */
function lessonsBefore(lesson: BidLesson): BidLesson[] {
  return biddingCurriculum.lessons.filter(
    (l) =>
      l.chapterNumber < lesson.chapterNumber ||
      (l.chapterNumber === lesson.chapterNumber &&
        l.lessonNumber < lesson.lessonNumber),
  );
}

/** Every leaf taught before this lesson — the pool review hands come from. */
export function reviewLeavesFor(lesson: BidLesson): string[] {
  const seen = new Set<string>();
  for (const l of lessonsBefore(lesson)) for (const id of l.leaves) seen.add(id);
  for (const id of lesson.leaves) seen.delete(id);
  return [...seen];
}

/**
 * How many hands a run actually deals: the lesson's own quota plus half
 * again, rounded up, drawn from everything taught so far.
 *
 * A lesson that only ever deals its own leaves telegraphs its answer — in
 * the 1NT lesson you know before you look that the call is 1NT, so the
 * hand is not really being read. The review half restores the question
 * the course is actually teaching, which is "what do I open?", not "how do
 * I open 1NT?". Lesson 1 has nothing behind it and stays at its own count.
 */
export function lessonHandCount(lesson: BidLesson): number {
  if (reviewLeavesFor(lesson).length === 0) return lesson.quizCount;
  return Math.ceil(lesson.quizCount * 1.5);
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Draw `count` leaves from `pool`, cycling so coverage is even.
 *
 * Sampling independently is what made a three-hand run of Lesson 5 deal 2♣
 * twice and 2NT once, leaving half the lesson unexercised. Cycling a
 * shuffled pool means no leaf appears twice until every leaf has appeared.
 */
function drawEvenly(pool: string[], count: number, rand: () => number): string[] {
  const out: string[] = [];
  while (out.length < count) {
    out.push(...shuffled(pool, rand).slice(0, count - out.length));
  }
  return out;
}

/**
 * The leaf to deal for each hand of one run, in order.
 *
 * The first hand is always the lesson's own material — it has just been
 * taught and the run should open on it — and the review hands are shuffled
 * through the rest rather than trailing at the end, so a hand's family is
 * not predictable from its position.
 */
export function buildLessonPlan(
  lesson: BidLesson,
  rand: () => number = Math.random,
): string[] {
  const own = drawEvenly(lesson.leaves, lesson.quizCount, rand);
  const review = reviewLeavesFor(lesson);
  const reviewCount = lessonHandCount(lesson) - lesson.quizCount;
  const rest = shuffled(
    [...own.slice(1), ...drawEvenly(review, reviewCount, rand)],
    rand,
  );
  return [own[0]!, ...rest];
}
