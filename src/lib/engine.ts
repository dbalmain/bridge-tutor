import {
  cardSuit,
  contractTrump,
  legalCards,
  nextSeat,
  trickWinner,
} from "./cards";
import type { Bid, Card, Lesson, Seat } from "./types";

export type Phase = "intro" | "bidding" | "play" | "complete";

export interface Feedback {
  kind: "ok" | "mistake" | "info" | "complete";
  title: string;
  body: string;
  expected?: string;
  actual?: string;
}

export interface EngineState {
  phase: Phase;
  bidIndex: number;
  playIndex: number;
  hands: Record<Seat, Card[]>;
  auctionLog: { seat: Seat; bid: string }[];
  tricks: { lead: Seat; cards: Card[]; winner: Seat }[];
  currentTrick: Card[];
  currentLead: Seat | null;
  /** Seat that owns the next scripted card (S/N = user). */
  nextToPlay: Seat | null;
  nsTricks: number;
  ewTricks: number;
  mistakesThisRun: number;
  feedback: Feedback | null;
  awaitingCorrection: boolean;
  lastExpected: string | null;
}

function cloneHands(hands: Record<Seat, Card[]>): Record<Seat, Card[]> {
  return {
    S: [...hands.S],
    W: [...hands.W],
    N: [...hands.N],
    E: [...hands.E],
  };
}

/** Which seat still holds this card? */
function ownerOf(hands: Record<Seat, Card[]>, card: Card): Seat | null {
  for (const seat of ["S", "W", "N", "E"] as Seat[]) {
    if (hands[seat].includes(card)) return seat;
  }
  return null;
}

export function initialEngine(lesson: Lesson): EngineState {
  return {
    phase: "intro",
    bidIndex: 0,
    playIndex: 0,
    hands: cloneHands(lesson.hands),
    auctionLog: [],
    tricks: [],
    currentTrick: [],
    currentLead: null,
    nextToPlay: null,
    nsTricks: 0,
    ewTricks: 0,
    mistakesThisRun: 0,
    feedback: {
      kind: "info",
      title: "Lesson start",
      body: lesson.tip,
    },
    awaitingCorrection: false,
    lastExpected: null,
  };
}

export function startBidding(state: EngineState): EngineState {
  return {
    ...state,
    phase: "bidding",
    feedback: {
      kind: "info",
      title: "Bidding",
      body: "Choose your bids when it is your turn (South). Other seats follow the lesson script.",
    },
  };
}

export function advanceAutoBids(lesson: Lesson, state: EngineState): EngineState {
  let s: EngineState = { ...state, auctionLog: [...state.auctionLog] };
  while (s.phase === "bidding" && s.bidIndex < lesson.auction.length) {
    const ev = lesson.auction[s.bidIndex];
    if (ev.seat === "S") break;
    s.auctionLog.push({ seat: ev.seat, bid: ev.bid });
    s.bidIndex += 1;
    if (ev.teaching || ev.annotation) {
      s.feedback = {
        kind: "info",
        title: `${ev.seat} bids ${ev.bid}`,
        body: ev.teaching || ev.annotation || "",
      };
    }
  }
  if (s.phase === "bidding" && s.bidIndex >= lesson.auction.length) {
    s = beginPlay(lesson, s);
  }
  return s;
}

export function submitBid(
  lesson: Lesson,
  state: EngineState,
  bid: string,
): EngineState {
  if (state.phase !== "bidding") return state;
  if (state.bidIndex >= lesson.auction.length) return state;

  const ev = lesson.auction[state.bidIndex];
  if (ev.seat !== "S") return state;

  const expected = ev.bid;
  if (normalizeBid(bid) !== normalizeBid(expected)) {
    return {
      ...state,
      mistakesThisRun: state.mistakesThisRun + 1,
      awaitingCorrection: true,
      lastExpected: expected,
      feedback: {
        kind: "mistake",
        title: "Bidding mistake",
        body:
          ev.teaching ||
          ev.annotation ||
          `The recommended bid is ${expected}.`,
        expected,
        actual: bid,
      },
    };
  }

  let s: EngineState = {
    ...state,
    auctionLog: [...state.auctionLog, { seat: "S", bid: expected }],
    bidIndex: state.bidIndex + 1,
    awaitingCorrection: false,
    lastExpected: null,
    feedback: {
      kind: "ok",
      title: `You bid ${expected}`,
      body: ev.teaching || ev.annotation || "Correct.",
      expected,
      actual: bid,
    },
  };
  s = advanceAutoBids(lesson, s);
  return s;
}

function beginPlay(lesson: Lesson, state: EngineState): EngineState {
  const hands = state.hands;
  const firstCard = lesson.play[0]?.card;
  const lead =
    (firstCard && ownerOf(hands, firstCard)) || lesson.leadSeat;

  return {
    ...state,
    phase: "play",
    currentLead: lead,
    nextToPlay: lead,
    currentTrick: [],
    feedback: {
      kind: "info",
      title: `Contract: ${lesson.contract ?? "?"} by ${lesson.declarer ?? "?"}`,
      body: "You play South and Dummy (North). Click a card when it is your turn. Match the lesson line for an optimal result.",
    },
  };
}

export function advanceAutoPlays(
  lesson: Lesson,
  state: EngineState,
): EngineState {
  let s = { ...state };

  // Safety cap against infinite loops
  let guard = 0;
  while (s.phase === "play" && s.playIndex < lesson.play.length && guard++ < 60) {
    const expected = lesson.play[s.playIndex].card;
    const seat = ownerOf(s.hands, expected);
    if (!seat) {
      s = {
        ...s,
        feedback: {
          kind: "mistake",
          title: "Script desync",
          body: `Could not find card ${expected} in any hand. Try restarting the hand.`,
        },
      };
      break;
    }
    s = { ...s, nextToPlay: seat };
    // User seats: stop and wait
    if (seat === "S" || seat === "N") break;

    s = applyScriptedCard(lesson, s, seat, expected, true);
  }

  if (s.phase === "play" && s.playIndex >= lesson.play.length) {
    s = completeHand(lesson, s);
  }
  return s;
}

function applyScriptedCard(
  lesson: Lesson,
  state: EngineState,
  seat: Seat,
  card: Card,
  isAuto: boolean,
): EngineState {
  const hands = cloneHands(state.hands);
  if (!hands[seat].includes(card)) {
    return {
      ...state,
      feedback: {
        kind: "mistake",
        title: "Illegal card",
        body: `${card} is not in ${seat}'s hand.`,
        actual: card,
      },
    };
  }
  hands[seat] = hands[seat].filter((c) => c !== card);

  const currentTrick = [...state.currentTrick, card];
  const lead = state.currentLead ?? seat;
  let tricks = state.tricks;
  let nsTricks = state.nsTricks;
  let ewTricks = state.ewTricks;
  let currentLead: Seat | null = lead;
  let nextToPlay: Seat | null = nextSeat(seat);
  const playIndex = state.playIndex + 1;
  const ev = lesson.play[state.playIndex];

  let feedback = state.feedback;
  if (!isAuto && (ev?.teaching || ev?.annotation)) {
    feedback = {
      kind: "ok",
      title: `You played ${card}`,
      body: ev.teaching || ev.annotation || "Correct.",
      expected: card,
      actual: card,
    };
  } else if (isAuto && (ev?.teaching || ev?.annotation)) {
    feedback = {
      kind: "info",
      title: `${seat} plays ${card}`,
      body: ev.teaching || ev.annotation || "",
    };
  }

  if (currentTrick.length === 4) {
    const winner = trickWinner(
      lead,
      currentTrick,
      contractTrump(lesson.contract),
    );
    tricks = [...tricks, { lead, cards: currentTrick, winner }];
    if (winner === "N" || winner === "S") nsTricks += 1;
    else ewTricks += 1;

    // Next lead seat is inferred from next scripted card owner if available
    const nextCard = lesson.play[playIndex]?.card;
    const nextOwner = nextCard ? ownerOf(hands, nextCard) : null;
    nextToPlay = nextOwner ?? winner;
    currentLead = nextToPlay;

    return {
      ...state,
      hands,
      currentTrick: [],
      currentLead,
      nextToPlay,
      tricks,
      nsTricks,
      ewTricks,
      playIndex,
      feedback,
      awaitingCorrection: false,
      lastExpected: null,
    };
  }

  // Mid-trick: next seat from ownership of next scripted card
  const nextCard = lesson.play[playIndex]?.card;
  const nextOwner = nextCard ? ownerOf(hands, nextCard) : nextSeat(seat);
  nextToPlay = nextOwner;

  return {
    ...state,
    hands,
    currentTrick,
    currentLead: lead,
    nextToPlay,
    tricks,
    nsTricks,
    ewTricks,
    playIndex,
    feedback,
    awaitingCorrection: false,
    lastExpected: null,
  };
}

export function submitCard(
  lesson: Lesson,
  state: EngineState,
  card: Card,
): EngineState {
  if (state.phase !== "play") return state;
  if (state.playIndex >= lesson.play.length) return state;

  const expected = lesson.play[state.playIndex].card;
  const expectedSeat = ownerOf(state.hands, expected);
  if (!expectedSeat || (expectedSeat !== "S" && expectedSeat !== "N")) {
    // Not user's turn according to script
    return state;
  }

  const seat = expectedSeat;
  // Ensure user clicked from the correct hand
  if (!state.hands[seat].includes(card)) {
    // Maybe they clicked the other NS hand
    return {
      ...state,
      feedback: {
        kind: "info",
        title: "Wrong hand",
        body: `Play from ${seat === "N" ? "Dummy (North)" : "your hand (South)"} this time.`,
      },
    };
  }

  const ledSuit =
    state.currentTrick.length > 0 ? cardSuit(state.currentTrick[0]) : null;
  const legal = legalCards(state.hands[seat], ledSuit);
  if (!legal.includes(card)) {
    return {
      ...state,
      feedback: {
        kind: "mistake",
        title: "Illegal card",
        body: ledSuit
          ? "You must follow suit if you can."
          : "That card is not playable.",
        actual: card,
      },
    };
  }

  const ev = lesson.play[state.playIndex];
  if (card !== expected) {
    return {
      ...state,
      nextToPlay: seat,
      mistakesThisRun: state.mistakesThisRun + 1,
      awaitingCorrection: true,
      lastExpected: expected,
      feedback: {
        kind: "mistake",
        title: "Card-play mistake",
        body:
          ev.teaching ||
          ev.annotation ||
          `The recommended card is ${expected}. Try again — keep going until the line is optimal.`,
        expected,
        actual: card,
      },
    };
  }

  let s = applyScriptedCard(lesson, state, seat, card, false);
  s = advanceAutoPlays(lesson, s);
  return s;
}

function completeHand(lesson: Lesson, state: EngineState): EngineState {
  const needed = lesson.contract ? Number(lesson.contract[0]) + 6 : 7;
  const made = state.nsTricks >= needed;
  return {
    ...state,
    phase: "complete",
    nextToPlay: null,
    feedback: {
      kind: "complete",
      title: state.mistakesThisRun === 0 ? "Optimal!" : "Hand complete",
      body:
        state.mistakesThisRun === 0
          ? `You matched the lesson line with no mistakes. NS tricks: ${state.nsTricks}. Contract ${lesson.contract} ${made ? "made" : "—"}.`
          : `Finished with ${state.mistakesThisRun} mistake(s). Replay until you can do it with zero mistakes for an optimal mark.`,
    },
  };
}

function normalizeBid(b: string): string {
  const u = b.trim().toUpperCase();
  if (u === "P" || u === "PASS") return "Pass";
  if (u === "D" || u === "X" || u === "DBL") return "X";
  if (u === "R" || u === "XX") return "XX";
  if (/^[1-7]N$/.test(u)) return u[0] + "NT";
  if (/^[1-7]NT$/.test(u)) return u;
  return u;
}

export function beginnerBidOptions(): string[] {
  return [
    "Pass",
    "X",
    "1C",
    "1D",
    "1H",
    "1S",
    "1NT",
    "2C",
    "2D",
    "2H",
    "2S",
    "2NT",
    "3C",
    "3D",
    "3H",
    "3S",
    "3NT",
    "4H",
    "4S",
    "4NT",
    "5C",
    "5D",
    "6NT",
    "7NT",
  ];
}

export type { Bid };
