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
