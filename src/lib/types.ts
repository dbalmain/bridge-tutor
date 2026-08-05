export type Seat = "S" | "W" | "N" | "E";
export type Suit = "S" | "H" | "D" | "C";
export type Rank =
  | "A"
  | "K"
  | "Q"
  | "J"
  | "T"
  | "9"
  | "8"
  | "7"
  | "6"
  | "5"
  | "4"
  | "3"
  | "2";

/** Card encoded as suit + rank, e.g. "SA", "HT", "C2" */
export type Card = string;

export type Bid =
  | "Pass"
  | "X"
  | "XX"
  | `${1 | 2 | 3 | 4 | 5 | 6 | 7}${"C" | "D" | "H" | "S" | "NT"}`;

export interface BidEvent {
  type: "bid";
  bid: Bid | string;
  seat: Seat;
  annotation?: string;
  teaching?: string;
}

export interface PlayEvent {
  type: "play";
  card: Card;
  index: number;
  annotation?: string;
  teaching?: string;
}

export interface Lesson {
  id: string;
  chapterId: string;
  chapterNumber: number;
  handNumber: number;
  title: string;
  board: number;
  dealer: Seat;
  vulnerability: string;
  hands: Record<Seat, Card[]>;
  auction: BidEvent[];
  play: PlayEvent[];
  contract: string | null;
  declarer: Seat | null;
  leadSeat: Seat;
  tip: string;
  external?: { tutorialLin?: string };
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  summary: string;
  concepts: string[];
}

export interface Curriculum {
  meta: {
    title: string;
    system: string;
    course: string;
    source: string;
    version: number;
  };
  chapters: Chapter[];
  lessons: Lesson[];
}

export type MistakePhase = "bidding" | "play";

export interface Mistake {
  id: string;
  at: string; // ISO timestamp
  lessonId: string;
  chapterId: string;
  phase: MistakePhase;
  expected: string;
  actual: string;
  context: string;
  teaching?: string;
  tags: string[];
}

export interface LessonProgress {
  lessonId: string;
  attempts: number;
  completed: boolean;
  optimal: boolean; // completed with zero mistakes this attempt
  bestMistakes: number | null;
  lastPlayedAt: string | null;
}

export interface ProgressState {
  version: 1;
  lessons: Record<string, LessonProgress>;
  mistakes: Mistake[];
  currentLessonId: string | null;
}
