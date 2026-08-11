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

export type Phase = "intro" | "bidding" | "play" | "complete";

export interface Feedback {
  kind: "ok" | "mistake" | "info" | "complete";
  title: string;
  body: string;
  expected?: string;
  actual?: string;
}

export type CommentaryKind = "info" | "ok" | "mistake" | "coach" | "user";
export type CommentaryPhase = "bidding" | "play" | "system" | "chat";

export interface CommentaryEntry {
  id: string;
  kind: CommentaryKind;
  phase: CommentaryPhase;
  seat?: Seat;
  action?: string;
  text: string;
  /** ISO timestamp; set for coach/user chat so transcripts survive reloads. */
  at?: string;
}

/** One Sol coaching conversation for a hand attempt. */
export interface CoachTranscript {
  id: string;
  lessonId: string;
  chapterId: string;
  startedAt: string;
  updatedAt: string;
  /** Codex thread id when available. */
  codexSessionId: string | null;
  entries: CommentaryEntry[];
}

export interface EngineState {
  phase: Phase;
  bidIndex: number;
  playIndex: number;
  playCards: Card[];
  hands: Record<Seat, Card[]>;
  auctionLog: { seat: Seat; bid: string }[];
  commentary: CommentaryEntry[];
  tricks: { lead: Seat; cards: Card[]; winner: Seat }[];
  currentTrick: Card[];
  currentLead: Seat | null;
  nextToPlay: Seat | null;
  nsTricks: number;
  ewTricks: number;
  mistakesThisRun: number;
  feedback: Feedback | null;
  awaitingCorrection: boolean;
  lastExpected: string | null;
  awaitingTrickAdvance: boolean;
  pendingNextLead: Seat | null;
  lastTrickWinner: Seat | null;
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

/** Separate from ProgressState so coach history can grow without bumping progress version. */
export interface CoachStore {
  version: 1;
  /** Newest first. */
  transcripts: CoachTranscript[];
}
