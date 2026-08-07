/**
 * Free card-play engine: legal cards only, scored by DDS.
 * Opponents (E/W) autoplay the double-dummy best card.
 * Significant errors: bestScore - playedScore >= SIGNIFICANT_TRICK_LOSS.
 */
import {
  cardLabel,
  cardSuit,
  contractTrump,
  legalCards,
  nextSeat,
  trickWinner,
} from "./cards";
import {
  bestAutoCard,
  evaluatePlay,
  formatEvalMessage,
  SIGNIFICANT_TRICK_LOSS,
} from "./ddsEval";
import type {
  Card,
  CommentaryEntry,
  EngineState,
  Feedback,
  Lesson,
  Seat,
} from "./types";

function cloneHands(hands: Record<Seat, Card[]>): Record<Seat, Card[]> {
  return {
    S: [...hands.S],
    W: [...hands.W],
    N: [...hands.N],
    E: [...hands.E],
  };
}

let commentarySeq = 100000;

function pushCommentary(
  list: CommentaryEntry[],
  entry: Omit<CommentaryEntry, "id">,
): CommentaryEntry[] {
  commentarySeq += 1;
  return [...list, { ...entry, id: `c-${commentarySeq}` }];
}

function playHeadline(seat: Seat, card: Card): string {
  const who =
    seat === "S" ? "You" : seat === "N" ? "Dummy" : seat === "W" ? "West" : "East";
  return `${who} play${seat === "S" ? "" : "s"} ${cardLabel(card)}`;
}

function cardsLeft(hands: Record<Seat, Card[]>): number {
  return hands.S.length + hands.W.length + hands.N.length + hands.E.length;
}

function applyCard(
  state: EngineState,
  lesson: Lesson,
  seat: Seat,
  card: Card,
  feedback: Feedback | null,
  commentaryLine: string,
  kind: CommentaryEntry["kind"],
): EngineState {
  const hands = cloneHands(state.hands);
  if (!hands[seat].includes(card)) {
    return {
      ...state,
      feedback: {
        kind: "mistake",
        title: "Illegal card",
        body: `${cardLabel(card)} is not in that hand.`,
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
  let commentary = pushCommentary(state.commentary, {
    kind,
    phase: "play",
    seat,
    action: card,
    text: commentaryLine,
  });

  if (currentTrick.length < 4) {
    return {
      ...state,
      hands,
      commentary,
      currentTrick,
      currentLead: lead,
      nextToPlay: nextSeat(seat),
      feedback: feedback ?? state.feedback,
      awaitingCorrection: false,
      lastExpected: null,
      awaitingTrickAdvance: false,
      pendingNextLead: null,
      lastTrickWinner: null,
    };
  }

  const winner = trickWinner(
    lead,
    currentTrick,
    contractTrump(lesson.contract),
  );
  tricks = [...tricks, { lead, cards: currentTrick, winner }];
  if (winner === "N" || winner === "S") nsTricks += 1;
  else ewTricks += 1;

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
    commentary,
    currentTrick,
    currentLead: lead,
    nextToPlay: null,
    tricks,
    nsTricks,
    ewTricks,
    feedback: {
      kind: "info",
      title: `${winnerLabel} won the trick`,
      body: "Review the four cards, then click Next trick.",
    },
    awaitingCorrection: false,
    lastExpected: null,
    awaitingTrickAdvance: true,
    pendingNextLead: winner,
    lastTrickWinner: winner,
  };
}

function completeIfDone(lesson: Lesson, state: EngineState): EngineState {
  if (state.awaitingTrickAdvance) return state;
  if (cardsLeft(state.hands) > 0) return state;

  const needed = lesson.contract ? Number(lesson.contract[0]) + 6 : 7;
  const made = state.nsTricks >= needed;
  const body =
    state.mistakesThisRun === 0
      ? `No significant double-dummy errors. NS tricks: ${state.nsTricks}. Contract ${lesson.contract} ${made ? "made" : "—"}.`
      : `Finished with ${state.mistakesThisRun} significant error(s) (≥${SIGNIFICANT_TRICK_LOSS} trick vs DDS). Replay for a clean ★.`;
  const title =
    state.mistakesThisRun === 0 ? "Optimal (DDS)!" : "Hand complete";

  return {
    ...state,
    phase: "complete",
    nextToPlay: null,
    commentary: pushCommentary(state.commentary, {
      kind: state.mistakesThisRun === 0 ? "ok" : "info",
      phase: "system",
      text: `${title} ${body}`,
    }),
    feedback: { kind: "complete", title, body },
  };
}

/** After user clears a completed trick, continue; EW may autoplay. */
export async function advanceTrickDds(
  lesson: Lesson,
  state: EngineState,
): Promise<EngineState> {
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
  s = completeIfDone(lesson, s);
  if (s.phase === "complete") return s;
  s = await advanceAutoPlaysDds(lesson, s);
  return s;
}

export async function advanceAutoPlaysDds(
  lesson: Lesson,
  state: EngineState,
): Promise<EngineState> {
  let s = { ...state };
  if (s.awaitingTrickAdvance) return s;

  let guard = 0;
  while (
    s.phase === "play" &&
    !s.awaitingTrickAdvance &&
    cardsLeft(s.hands) > 0 &&
    guard++ < 60
  ) {
    const seat = s.nextToPlay;
    if (!seat) break;
    if (seat === "S" || seat === "N") break;

    const trump = contractTrump(lesson.contract);
    const trickLeader = s.currentLead ?? seat;
    const card = await bestAutoCard({
      hands: s.hands,
      trump,
      trickLeader,
      currentTrick: s.currentTrick,
      seat,
    });
    if (!card) {
      s = {
        ...s,
        feedback: {
          kind: "mistake",
          title: "Engine error",
          body: `DDS could not find a card for ${seat}.`,
        },
      };
      break;
    }

    s = applyCard(
      s,
      lesson,
      seat,
      card,
      {
        kind: "info",
        title: playHeadline(seat, card),
        body: "Opponents play double-dummy best.",
      },
      `${playHeadline(seat, card)} — (DDS autoplay)`,
      "info",
    );
  }

  return completeIfDone(lesson, s);
}

/**
 * User plays a card from South or Dummy. Evaluated by DDS; significant
 * trick losses are logged as mistakes but the card is still accepted so
 * play continues naturally.
 */
export async function submitCardDds(
  lesson: Lesson,
  state: EngineState,
  card: Card,
): Promise<EngineState> {
  if (state.phase !== "play") return state;
  if (state.awaitingTrickAdvance) return state;

  const seat = state.nextToPlay;
  if (seat !== "S" && seat !== "N") return state;

  if (!state.hands[seat].includes(card)) {
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

  const trump = contractTrump(lesson.contract);
  const trickLeader = state.currentLead ?? seat;

  let evalResult;
  try {
    evalResult = await evaluatePlay({
      hands: state.hands,
      trump,
      trickLeader,
      currentTrick: state.currentTrick,
      played: card,
    });
  } catch (e) {
    // Fallback: accept legal card if DDS fails
    console.error("DDS evaluation failed", e);
    let s = applyCard(
      state,
      lesson,
      seat,
      card,
      {
        kind: "ok",
        title: playHeadline(seat, card),
        body: "Played (DDS unavailable — not scored).",
      },
      `${playHeadline(seat, card)} — (DDS unavailable)`,
      "ok",
    );
    if (!s.awaitingTrickAdvance) {
      s = await advanceAutoPlaysDds(lesson, s);
    }
    return s;
  }

  const msg = formatEvalMessage(evalResult);
  let mistakes = state.mistakesThisRun;
  let kind: CommentaryEntry["kind"] = "ok";
  let feedback: Feedback;

  if (evalResult.significantError) {
    mistakes += 1;
    kind = "mistake";
    feedback = {
      kind: "mistake",
      title: "Suboptimal play (DDS)",
      body: msg,
      expected: evalResult.bestCards[0],
      actual: card,
    };
  } else {
    feedback = {
      kind: "ok",
      title: playHeadline(seat, card),
      body: msg,
      actual: card,
    };
  }

  let s: EngineState = {
    ...state,
    mistakesThisRun: mistakes,
  };
  s = applyCard(
    s,
    lesson,
    seat,
    card,
    feedback,
    `${playHeadline(seat, card)} — ${msg}`,
    kind,
  );

  if (!s.awaitingTrickAdvance) {
    s = await advanceAutoPlaysDds(lesson, s);
  }
  return s;
}

export function beginPlayDdsNote(lesson: Lesson, state: EngineState): EngineState {
  const body =
    `You play South and Dummy. Opponents use double-dummy best play (DDS). ` +
    `You are only called out when a card costs ≥${SIGNIFICANT_TRICK_LOSS} trick vs optimal.`;
  return {
    ...state,
    phase: "play",
    currentLead: lesson.leadSeat,
    nextToPlay: lesson.leadSeat,
    currentTrick: [],
    commentary: pushCommentary(state.commentary, {
      kind: "info",
      phase: "system",
      text: `Contract: ${lesson.contract ?? "?"} by ${lesson.declarer ?? "?"}. ${body}`,
    }),
    feedback: {
      kind: "info",
      title: `Contract: ${lesson.contract ?? "?"} by ${lesson.declarer ?? "?"}`,
      body,
    },
  };
}
