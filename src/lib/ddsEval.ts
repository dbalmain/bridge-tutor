/**
 * Double-dummy evaluation via Bo Haglund's DDS (WASM, Apache-2.0)
 * through the bridge-dds JS bindings.
 *
 * Score is tricks remaining for the side about to play. A play is a
 * significant error when bestScore - playedScore >= SIGNIFICANT_TRICK_LOSS.
 */
import { cardLabel, cardRank, cardSuit, rankValue } from "./cards";
import type { Card, Seat, Suit } from "./types";

// Vendored ESM-fixed bindings (see src/lib/dds/)
import { loadDds, Dds, Trump } from "./dds/api.js";

/** Call out only when the card costs this many tricks vs best (DD). */
export const SIGNIFICANT_TRICK_LOSS = 1;

const SUIT_TO_DDS: Record<Suit, number> = {
  S: 0,
  H: 1,
  D: 2,
  C: 3,
};

const DDS_SUIT: Suit[] = ["S", "H", "D", "C"];

const RANK_TO_DDS: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

const DDS_RANK: Record<number, string> = {
  14: "A",
  13: "K",
  12: "Q",
  11: "J",
  10: "T",
  9: "9",
  8: "8",
  7: "7",
  6: "6",
  5: "5",
  4: "4",
  3: "3",
  2: "2",
};

const SEAT_TO_DDS: Record<Seat, number> = {
  N: 0,
  E: 1,
  S: 2,
  W: 3,
};

export interface CardScore {
  card: Card;
  /** Tricks for the side to play if this card is chosen (double dummy). */
  score: number;
}

export interface PlayEvaluation {
  played: Card;
  playedScore: number;
  bestScore: number;
  bestCards: Card[];
  all: CardScore[];
  /** True when bestScore - playedScore >= SIGNIFICANT_TRICK_LOSS */
  significantError: boolean;
  tricksLost: number;
}

let ddsInstance: InstanceType<typeof Dds> | null = null;
let ddsLoadPromise: Promise<InstanceType<typeof Dds>> | null = null;

export async function getDds(): Promise<InstanceType<typeof Dds>> {
  if (ddsInstance) return ddsInstance;
  if (!ddsLoadPromise) {
    ddsLoadPromise = (async () => {
      const mod = await loadDds();
      ddsInstance = new Dds(mod);
      return ddsInstance;
    })();
  }
  return ddsLoadPromise;
}

function handToPbn(cards: Card[]): string {
  const bySuit: Record<Suit, string[]> = { S: [], H: [], D: [], C: [] };
  for (const c of cards) {
    bySuit[cardSuit(c)].push(cardRank(c));
  }
  return (["S", "H", "D", "C"] as Suit[])
    .map((s) =>
      bySuit[s]
        .sort((a, b) => rankValue(b) - rankValue(a))
        .join(""),
    )
    .join(".");
}

export function remainCardsPbn(hands: Record<Seat, Card[]>): string {
  return `N:${handToPbn(hands.N)} E:${handToPbn(hands.E)} S:${handToPbn(hands.S)} W:${handToPbn(hands.W)}`;
}

function trumpToDds(trump: Suit | null): number {
  if (!trump) return Trump.NoTrump;
  return SUIT_TO_DDS[trump];
}

function ddsCard(suit: number, rank: number): Card {
  return `${DDS_SUIT[suit]}${DDS_RANK[rank]}` as Card;
}

/**
 * DDS solutions=3 returns one representative per score group and encodes
 * lower same-suit equals in a rank bitmask (bit r set ⇒ rank r is equivalent).
 * Expand those so playing the 8 when only the 9 is listed is scored correctly.
 */
function expandEquals(
  suit: number,
  rank: number,
  equalsMask: number,
  score: number,
): CardScore[] {
  const out: CardScore[] = [{ card: ddsCard(suit, rank), score }];
  // Bits 2..14 correspond to ranks 2..A (DDS convention).
  for (let r = 2; r <= 14; r++) {
    if (r === rank) continue;
    if (equalsMask & (1 << r)) {
      const sym = DDS_RANK[r];
      if (sym) out.push({ card: ddsCard(suit, r), score });
    }
  }
  return out;
}

/**
 * Score every legal card for the side about to play at this position.
 *
 * `hands` must already exclude cards from earlier tricks (and cards already
 * played to the current trick). Cards still to be played — including the
 * one under evaluation — stay in hand.
 */
export async function scoreLegalCards(opts: {
  hands: Record<Seat, Card[]>;
  trump: Suit | null;
  /** Leader of the current trick (or next lead if trick empty). */
  trickLeader: Seat;
  currentTrick: Card[];
}): Promise<CardScore[]> {
  const dds = await getDds();
  const { hands, trump, trickLeader, currentTrick } = opts;

  const currentTrickSuit = [0, 0, 0];
  const currentTrickRank = [0, 0, 0];
  for (let i = 0; i < currentTrick.length && i < 3; i++) {
    currentTrickSuit[i] = SUIT_TO_DDS[cardSuit(currentTrick[i])];
    currentTrickRank[i] = RANK_TO_DDS[cardRank(currentTrick[i])];
  }

  const future = dds.SolveBoardPBN(
    {
      trump: trumpToDds(trump),
      first: SEAT_TO_DDS[trickLeader],
      currentTrickSuit,
      currentTrickRank,
      remainCards: remainCardsPbn(hands),
    },
    -1, // target unused when solutions=3
    3, // all cards with scores
    1, // always search
  );

  // Deduplicate if equals somehow overlaps a listed card.
  const byCard = new Map<Card, number>();
  for (let i = 0; i < future.cards; i++) {
    const expanded = expandEquals(
      future.suit[i],
      future.rank[i],
      future.equals[i] ?? 0,
      future.score[i],
    );
    for (const row of expanded) {
      const prev = byCard.get(row.card);
      if (prev === undefined || row.score > prev) {
        byCard.set(row.card, row.score);
      }
    }
  }
  return [...byCard.entries()].map(([card, score]) => ({ card, score }));
}

export async function evaluatePlay(opts: {
  hands: Record<Seat, Card[]>;
  trump: Suit | null;
  trickLeader: Seat;
  currentTrick: Card[];
  played: Card;
}): Promise<PlayEvaluation> {
  const all = await scoreLegalCards(opts);
  if (all.length === 0) {
    return {
      played: opts.played,
      playedScore: 0,
      bestScore: 0,
      bestCards: [],
      all,
      significantError: false,
      tricksLost: 0,
    };
  }

  const bestScore = Math.max(...all.map((c) => c.score));
  const bestCards = all.filter((c) => c.score === bestScore).map((c) => c.card);
  const hit = all.find((c) => c.card === opts.played);

  // If DDS still did not list the card (should be rare after equals expand),
  // do not invent a "lost every remaining trick" score — treat as no error.
  if (!hit) {
    return {
      played: opts.played,
      playedScore: bestScore,
      bestScore,
      bestCards,
      all,
      significantError: false,
      tricksLost: 0,
    };
  }

  const playedScore = hit.score;
  const tricksLost = bestScore - playedScore;

  return {
    played: opts.played,
    playedScore,
    bestScore,
    bestCards,
    all,
    significantError: tricksLost >= SIGNIFICANT_TRICK_LOSS,
    tricksLost,
  };
}

/** Best card(s) for autoplay (opponents). Picks highest score, then highest rank. */
export async function bestAutoCard(opts: {
  hands: Record<Seat, Card[]>;
  trump: Suit | null;
  trickLeader: Seat;
  currentTrick: Card[];
  seat: Seat;
}): Promise<Card | null> {
  const scores = await scoreLegalCards(opts);
  if (scores.length === 0) return null;
  const best = Math.max(...scores.map((s) => s.score));
  const candidates = scores.filter((s) => s.score === best);
  // Prefer a card actually still in this seat's hand (SolveBoard returns cards for side to play)
  const inHand = candidates.filter((c) => opts.hands[opts.seat].includes(c.card));
  const pool = inHand.length > 0 ? inHand : candidates;
  pool.sort(
    (a, b) => rankValue(cardRank(b.card)) - rankValue(cardRank(a.card)),
  );
  return pool[0]?.card ?? null;
}

export function formatEvalMessage(ev: PlayEvaluation): string {
  if (!ev.significantError) {
    if (ev.tricksLost === 0) {
      return `Double-dummy OK (${ev.playedScore} trick${ev.playedScore === 1 ? "" : "s"} for your side from here).`;
    }
    return `Acceptable — only ${ev.tricksLost} trick below best double-dummy (threshold is ${SIGNIFICANT_TRICK_LOSS}).`;
  }
  const alts = ev.bestCards
    .slice(0, 4)
    .map((c) => cardLabel(c))
    .join(", ");
  return (
    `Loses ${ev.tricksLost} trick${ev.tricksLost === 1 ? "" : "s"} double-dummy ` +
    `(${ev.playedScore} vs best ${ev.bestScore}). Better: ${alts || "—"}.`
  );
}
