import data from "../data/bidding-curriculum.json";

export interface BidChapter {
  id: string;
  number: number;
  title: string;
  summary: string;
  concepts: string[];
}

export interface BidLesson {
  id: string;
  chapterId: string;
  chapterNumber: number;
  lessonNumber: number;
  title: string;
  tip: string;
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
