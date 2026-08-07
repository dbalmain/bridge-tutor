import {
  areEquivalentPlays,
  bidDisplay,
  cardLabel,
  cardSuit,
  contractTrump,
  legalCards,
  nextSeat,
  trickWinner,
} from "./cards";
import type {
  Bid,
  Card,
  CommentaryEntry,
  EngineState,
  Lesson,
  Seat,
} from "./types";

export type {
  CommentaryEntry,
  EngineState,
  Feedback,
  Phase,
} from "./types";

let commentarySeq = 0;

function pushCommentary(
  list: CommentaryEntry[],
  entry: Omit<CommentaryEntry, "id">,
): CommentaryEntry[] {
  commentarySeq += 1;
  return [...list, { ...entry, id: `c-${commentarySeq}` }];
}

function seatName(seat: Seat): string {
  if (seat === "S") return "You";
  if (seat === "N") return "Partner (North)";
  if (seat === "W") return "West";
  return "East";
}

function formatBidAction(bid: string): string {
  const n = normalizeBid(bid);
  if (n === "Pass") return "Pass";
  if (n === "X") return "Double";
  if (n === "XX") return "Redouble";
  return bidDisplay(n);
}

function bidHeadline(seat: Seat, bid: string): string {
  const action = formatBidAction(bid);
  const who = seatName(seat);
  if (action === "Pass") {
    return seat === "S" ? "You pass" : `${who} passes`;
  }
  if (action === "Double") {
    return seat === "S" ? "You double" : `${who} doubles`;
  }
  if (action === "Redouble") {
    return seat === "S" ? "You redouble" : `${who} redoubles`;
  }
  return seat === "S" ? `You bid ${action}` : `${who} bids ${action}`;
}

function combineNotes(
  annotation?: string,
  teaching?: string,
): string {
  const parts = [annotation, teaching]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .filter(
      (p) =>
        !/click the word declarer/i.test(p) &&
        !/click next when ready/i.test(p),
    );

  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];

  // Prefer the longer note when one contains the other; otherwise join both.
  const [a, b] = parts;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al.includes(bl)) return a;
  if (bl.includes(al)) return b;
  return `${a} ${b}`;
}

function playHeadline(seat: Seat, card: Card): string {
  const who =
    seat === "S" ? "You" : seat === "N" ? "Dummy" : seatName(seat);
  return `${who} play${seat === "S" ? "" : "s"} ${cardLabel(card)}`;
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
  commentarySeq = 0;
  return {
    phase: "intro",
    bidIndex: 0,
    playIndex: 0,
    playCards: lesson.play.map((p) => p.card),
    hands: cloneHands(lesson.hands),
    auctionLog: [],
    commentary: [],
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
    awaitingTrickAdvance: false,
    pendingNextLead: null,
    lastTrickWinner: null,
  };
}

/** After playing alternate card `played` for scripted `expected`, fix the rest of the line. */
function remapPlayLine(
  playCards: Card[],
  fromIndex: number,
  expected: Card,
  played: Card,
): Card[] {
  if (expected === played) return playCards;
  // Current step is consumed as `played`. Any later `played` must become
  // `expected` (the card still in hand that will stand in for those steps).
  const next = [...playCards];
  for (let i = fromIndex + 1; i < next.length; i++) {
    if (next[i] === played) next[i] = expected;
  }
  next[fromIndex] = played; // record what was actually played at this index
  return next;
}

export function startBidding(state: EngineState): EngineState {
  const commentary = pushCommentary(state.commentary, {
    kind: "info",
    phase: "system",
    text: "Auction begins. Choose your bids when it is your turn (South).",
  });
  return {
    ...state,
    phase: "bidding",
    commentary,
    feedback: {
      kind: "info",
      title: "Bidding",
      body: "Choose your bids when it is your turn (South). Other seats follow the lesson script.",
    },
  };
}

function logBidEvent(
  commentary: CommentaryEntry[],
  seat: Seat,
  bid: string,
  annotation?: string,
  teaching?: string,
  kind: CommentaryEntry["kind"] = "info",
): CommentaryEntry[] {
  const notes = combineNotes(annotation, teaching);
  const headline = bidHeadline(seat, bid);
  return pushCommentary(commentary, {
    kind,
    phase: "bidding",
    seat,
    action: normalizeBid(bid),
    text: notes ? `${headline} — ${notes}` : headline,
  });
}

export function advanceAutoBids(lesson: Lesson, state: EngineState): EngineState {
  let s: EngineState = {
    ...state,
    auctionLog: [...state.auctionLog],
    commentary: [...state.commentary],
  };
  let lastBody = "";
  while (s.phase === "bidding" && s.bidIndex < lesson.auction.length) {
    const ev = lesson.auction[s.bidIndex];
    if (ev.seat === "S") break;
    s.auctionLog.push({ seat: ev.seat, bid: ev.bid });
    s.commentary = logBidEvent(
      s.commentary,
      ev.seat,
      ev.bid,
      ev.annotation,
      ev.teaching,
    );
    s.bidIndex += 1;
    const notes = combineNotes(ev.annotation, ev.teaching);
    lastBody = notes || bidHeadline(ev.seat, ev.bid);
    s.feedback = {
      kind: "info",
      title: bidHeadline(ev.seat, ev.bid),
      body: lastBody,
    };
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

  const chosen = normalizeBid(bid);

  // Law-of-bridge check first — don't serve coaching for illegal calls
  const legality = validateCall(state.auctionLog, chosen, "S");
  if (!legality.ok) {
    return {
      ...state,
      // Not a lesson mistake — just an illegal call
      awaitingCorrection: false,
      lastExpected: null,
      commentary: pushCommentary(state.commentary, {
        kind: "mistake",
        phase: "bidding",
        seat: "S",
        action: chosen,
        text: `Illegal bid (${formatBidAction(chosen)}): ${legality.reason}`,
      }),
      feedback: {
        kind: "mistake",
        title: "Illegal bid",
        body: legality.reason,
        actual: chosen,
      },
    };
  }

  const expected = normalizeBid(ev.bid);
  if (chosen !== expected) {
    const tip =
      combineNotes(ev.annotation, ev.teaching) ||
      `The recommended bid is ${formatBidAction(expected)}.`;
    return {
      ...state,
      mistakesThisRun: state.mistakesThisRun + 1,
      awaitingCorrection: true,
      lastExpected: expected,
      commentary: pushCommentary(state.commentary, {
        kind: "mistake",
        phase: "bidding",
        seat: "S",
        action: chosen,
        text: `Not ${formatBidAction(chosen)} — ${tip}`,
      }),
      feedback: {
        kind: "mistake",
        title: "Bidding mistake",
        body: tip,
        expected,
        actual: chosen,
      },
    };
  }

  const notes = combineNotes(ev.annotation, ev.teaching) || "Correct.";
  const commentary = logBidEvent(
    state.commentary,
    "S",
    expected,
    ev.annotation,
    ev.teaching,
    "ok",
  );

  let s: EngineState = {
    ...state,
    auctionLog: [...state.auctionLog, { seat: "S", bid: expected }],
    commentary,
    bidIndex: state.bidIndex + 1,
    awaitingCorrection: false,
    lastExpected: null,
    feedback: {
      kind: "ok",
      title: bidHeadline("S", expected),
      body: notes,
      expected,
      actual: chosen,
    },
  };
  s = advanceAutoBids(lesson, s);
  return s;
}

function beginPlay(lesson: Lesson, state: EngineState): EngineState {
  // Free play with DDS scoring (see playEngine.ts / submitCardDds).
  // Lead from the lesson's opening leader (left of declarer).
  const lead = lesson.leadSeat;
  const body =
    "You play South and Dummy. Opponents play double-dummy best (DDS). " +
    "You are only called out when a card costs ≥1 trick versus optimal.";
  const commentary = pushCommentary(state.commentary, {
    kind: "info",
    phase: "system",
    text: `Contract: ${lesson.contract ?? "?"} by ${lesson.declarer ?? "?"}. ${body}`,
  });

  return {
    ...state,
    phase: "play",
    commentary,
    currentLead: lead,
    nextToPlay: lead,
    currentTrick: [],
    feedback: {
      kind: "info",
      title: `Contract: ${lesson.contract ?? "?"} by ${lesson.declarer ?? "?"}`,
      body,
    },
  };
}

// Re-export free-play entry points for the UI
export {
  advanceAutoPlaysDds,
  advanceTrickDds,
  submitCardDds,
} from "./playEngine";

export function advanceAutoPlays(
  lesson: Lesson,
  state: EngineState,
): EngineState {
  let s = { ...state };

  if (s.awaitingTrickAdvance) return s;

  // Safety cap against infinite loops
  let guard = 0;
  while (s.phase === "play" && s.playIndex < s.playCards.length && guard++ < 60) {
    if (s.awaitingTrickAdvance) break;

    const expected = s.playCards[s.playIndex];
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

  // Only complete when the last trick has been reviewed (or no pending pause)
  if (
    s.phase === "play" &&
    s.playIndex >= s.playCards.length &&
    !s.awaitingTrickAdvance
  ) {
    s = completeHand(lesson, s);
  }
  return s;
}

/** Clear the completed trick from the table and continue. */
export function advanceTrick(
  lesson: Lesson,
  state: EngineState,
): EngineState {
  if (!state.awaitingTrickAdvance) return state;

  const nextLead = state.pendingNextLead;
  let s: EngineState = {
    ...state,
    currentTrick: [],
    currentLead: nextLead,
    nextToPlay: nextLead,
    awaitingTrickAdvance: false,
    pendingNextLead: null,
    lastTrickWinner: null,
    feedback: {
      kind: "info",
      title: "Next trick",
      body: nextLead
        ? `${nextLead === "N" ? "Dummy" : nextLead === "S" ? "You" : nextLead} leads.`
        : "Continue.",
    },
  };

  if (s.playIndex >= s.playCards.length) {
    return completeHand(lesson, s);
  }

  s = advanceAutoPlays(lesson, s);
  return s;
}

function applyScriptedCard(
  lesson: Lesson,
  state: EngineState,
  seat: Seat,
  card: Card,
  isAuto: boolean,
  options?: { equivalentTo?: Card },
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
  let nextToPlay: Seat | null = nextSeat(seat);
  const playIndex = state.playIndex + 1;
  const ev = lesson.play[state.playIndex];
  const scripted = options?.equivalentTo ?? card;
  const playCards =
    options?.equivalentTo && options.equivalentTo !== card
      ? remapPlayLine(state.playCards, state.playIndex, options.equivalentTo, card)
      : state.playCards;

  const notes = combineNotes(ev?.annotation, ev?.teaching);
  const headline = playHeadline(seat, card);
  const kind: CommentaryEntry["kind"] = isAuto ? "info" : "ok";
  let text = notes ? `${headline} — ${notes}` : headline;
  if (options?.equivalentTo && options.equivalentTo !== card) {
    text = `${headline} — Fine (equivalent to ${cardLabel(scripted)}; order of equals does not matter here).${notes ? ` ${notes}` : ""}`;
  }
  let commentary = pushCommentary(state.commentary, {
    kind,
    phase: "play",
    seat,
    action: card,
    text,
  });

  let feedback = state.feedback;
  if (options?.equivalentTo && options.equivalentTo !== card) {
    feedback = {
      kind: "ok",
      title: headline,
      body: `Fine — equivalent to ${cardLabel(scripted)}. With nothing between these spots still out, either card works.`,
      expected: scripted,
      actual: card,
    };
  } else if (notes) {
    feedback = {
      kind: isAuto ? "info" : "ok",
      title: headline,
      body: notes,
      expected: card,
      actual: card,
    };
  } else if (!isAuto) {
    feedback = {
      kind: "ok",
      title: headline,
      body: "Correct.",
      expected: card,
      actual: card,
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

    // Keep all four cards visible until the user clicks Next
    const nextCard = playCards[playIndex];
    const nextOwner = nextCard ? ownerOf(hands, nextCard) : null;
    const pendingNextLead = nextOwner ?? winner;

    const winnerLabel =
      winner === "S"
        ? "You"
        : winner === "N"
          ? "Dummy"
          : winner === "W"
            ? "West"
            : "East";

    commentary = pushCommentary(commentary, {
      kind: "info",
      phase: "play",
      seat: winner,
      text: `${winnerLabel} won the trick. Review the cards, then click Next trick.`,
    });

    return {
      ...state,
      hands,
      playCards,
      commentary,
      currentTrick,
      currentLead: lead,
      nextToPlay: null,
      tricks,
      nsTricks,
      ewTricks,
      playIndex,
      feedback: {
        kind: "info",
        title: `${winnerLabel} won the trick`,
        body: "Review the four cards, then click Next trick.",
      },
      awaitingCorrection: false,
      lastExpected: null,
      awaitingTrickAdvance: true,
      pendingNextLead,
      lastTrickWinner: winner,
    };
  }

  // Mid-trick: next seat from ownership of next scripted card
  const nextCard = playCards[playIndex];
  const nextOwner = nextCard ? ownerOf(hands, nextCard) : nextSeat(seat);
  nextToPlay = nextOwner;

  return {
    ...state,
    hands,
    playCards,
    commentary,
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
    awaitingTrickAdvance: false,
    pendingNextLead: null,
    lastTrickWinner: null,
  };
}

export function submitCard(
  lesson: Lesson,
  state: EngineState,
  card: Card,
): EngineState {
  if (state.phase !== "play") return state;
  if (state.awaitingTrickAdvance) return state;
  if (state.playIndex >= state.playCards.length) return state;

  const expected = state.playCards[state.playIndex];
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
    // Spot cards / cashing equals: accept without counting a mistake
    if (areEquivalentPlays(state.hands, seat, expected, card)) {
      let s = applyScriptedCard(lesson, state, seat, card, false, {
        equivalentTo: expected,
      });
      s = advanceAutoPlays(lesson, s);
      return s;
    }

    const tip =
      combineNotes(ev.teaching, ev.annotation) ||
      `The recommended card is ${cardLabel(expected)}. Try again — keep going until the line is optimal.`;
    return {
      ...state,
      nextToPlay: seat,
      mistakesThisRun: state.mistakesThisRun + 1,
      awaitingCorrection: true,
      lastExpected: expected,
      commentary: pushCommentary(state.commentary, {
        kind: "mistake",
        phase: "play",
        seat,
        action: card,
        text: `Not ${cardLabel(card)} — ${tip}`,
      }),
      feedback: {
        kind: "mistake",
        title: "Card-play mistake",
        body: tip,
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
  const body =
    state.mistakesThisRun === 0
      ? `You matched the lesson line with no mistakes. NS tricks: ${state.nsTricks}. Contract ${lesson.contract} ${made ? "made" : "—"}.`
      : `Finished with ${state.mistakesThisRun} mistake(s). Replay until you can do it with zero mistakes for an optimal mark.`;
  const title = state.mistakesThisRun === 0 ? "Optimal!" : "Hand complete";
  return {
    ...state,
    phase: "complete",
    nextToPlay: null,
    commentary: pushCommentary(state.commentary, {
      kind: state.mistakesThisRun === 0 ? "ok" : "info",
      phase: "system",
      text: `${title} ${body}`,
    }),
    feedback: {
      kind: "complete",
      title,
      body,
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

const STRAIN_RANK: Record<string, number> = {
  C: 0,
  D: 1,
  H: 2,
  S: 3,
  NT: 4,
};

function bidRank(bid: string): number | null {
  const n = normalizeBid(bid);
  const m = n.match(/^([1-7])(C|D|H|S|NT)$/);
  if (!m) return null;
  return (Number(m[1]) - 1) * 5 + STRAIN_RANK[m[2]];
}

function sameSide(a: Seat, b: Seat): boolean {
  const ns = (s: Seat) => s === "N" || s === "S";
  return ns(a) === ns(b);
}

interface ContractState {
  contract: string | null;
  contractSeat: Seat | null;
  doubled: boolean;
  redoubled: boolean;
}

function contractState(
  log: { seat: Seat; bid: string }[],
): ContractState {
  let contract: string | null = null;
  let contractSeat: Seat | null = null;
  let doubled = false;
  let redoubled = false;
  for (const { seat, bid } of log) {
    const n = normalizeBid(bid);
    if (n === "Pass") continue;
    if (n === "X") {
      doubled = true;
      redoubled = false;
      continue;
    }
    if (n === "XX") {
      redoubled = true;
      continue;
    }
    if (bidRank(n) != null) {
      contract = n;
      contractSeat = seat;
      doubled = false;
      redoubled = false;
    }
  }
  return { contract, contractSeat, doubled, redoubled };
}

function lastNonPass(
  log: { seat: Seat; bid: string }[],
): { seat: Seat; bid: string } | null {
  for (let i = log.length - 1; i >= 0; i--) {
    if (normalizeBid(log[i].bid) !== "Pass") return log[i];
  }
  return null;
}

/**
 * Whether a call is legal under the Laws of Duplicate Bridge
 * (sufficient bid / double / redouble rules).
 */
export function validateCall(
  log: { seat: Seat; bid: string }[],
  bid: string,
  seat: Seat,
): { ok: true } | { ok: false; reason: string } {
  const n = normalizeBid(bid);
  const state = contractState(log);
  const last = lastNonPass(log);

  if (n === "Pass") return { ok: true };

  if (n === "X") {
    if (!state.contract) {
      return { ok: false, reason: "Nothing to double — no bid has been made yet." };
    }
    if (state.doubled || state.redoubled) {
      return {
        ok: false,
        reason: state.redoubled
          ? "The contract is already redoubled."
          : "The contract is already doubled.",
      };
    }
    if (state.contractSeat && sameSide(state.contractSeat, seat)) {
      return {
        ok: false,
        reason: "You cannot double your own side's bid.",
      };
    }
    // Last non-pass must be by the other side (their bid, possibly followed by passes)
    if (last && sameSide(last.seat, seat) && bidRank(last.bid) != null) {
      return {
        ok: false,
        reason: "You cannot double your own side's bid.",
      };
    }
    return { ok: true };
  }

  if (n === "XX") {
    if (!state.contract || !state.doubled || state.redoubled) {
      return {
        ok: false,
        reason: "Redouble is only allowed after the opponents double your side's bid.",
      };
    }
    if (!state.contractSeat || !sameSide(state.contractSeat, seat)) {
      return {
        ok: false,
        reason: "Only the side that was doubled may redouble.",
      };
    }
    return { ok: true };
  }

  const rank = bidRank(n);
  if (rank == null) {
    return { ok: false, reason: "That is not a recognised bid." };
  }

  if (state.contract) {
    const current = bidRank(state.contract);
    if (current != null && rank <= current) {
      return {
        ok: false,
        reason: `Insufficient bid: the auction is already at ${bidDisplay(state.contract)}. You must bid something higher, or Pass${state.doubled || state.redoubled ? "" : " (or Double if allowed)"}.`,
      };
    }
  }

  return { ok: true };
}

export function isLegalCall(
  log: { seat: Seat; bid: string }[],
  bid: string,
  seat: Seat = "S",
): boolean {
  return validateCall(log, bid, seat).ok;
}

/** Level rows for the bidding box: 1♣…1NT through 7 (1 at top). */
export function bidLevelRows(): string[][] {
  const strains = ["C", "D", "H", "S", "NT"] as const;
  const rows: string[][] = [];
  for (let level = 1; level <= 7; level++) {
    rows.push(strains.map((s) => `${level}${s}`));
  }
  return rows;
}

/** Non-level calls shown under the level grid. */
export function specialBids(): string[] {
  return ["Pass", "X", "XX"];
}

export type { Bid };
