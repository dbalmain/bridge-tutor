import { SUITS, cardRank, cardSuit } from "./cards";
import type { Card, Suit } from "./types";

const HCP_VALUE: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

export interface SuitPoints {
  suit: Suit;
  /** Ranks held, high to low, "T" already rendered as "10". */
  ranks: string[];
  length: number;
  /** The honours that scored, high to low. */
  honours: { rank: string; value: number }[];
  hcp: number;
  /** Butts length points: one per card over four. */
  lengthPoints: number;
}

/** Which count the system actually uses for the decision on the table. */
export type PointContext = "opening" | "hcp" | "support";

export interface HandPoints {
  /** Spades, hearts, diamonds, clubs — the order hands are displayed in. */
  suits: SuitPoints[];
  hcp: number;
  lengthPoints: number;
  openingPoints: number;
  /** "S-H-D-C", matching the server's `south_shape`. */
  shape: string;
  /** The two longest suits, longest first — the Rule of 20 pair. */
  twoLongest: SuitPoints[];
  ruleOf20: number;
}

/**
 * Which count the decision actually uses.
 *
 * The tree tells us — `point_basis` and `point_trump` come straight from the
 * Rust handler that made the decision. This used to infer it from the leaf
 * id's spelling and got `rebid.2nt.accept` wrong: that handler reads HCP, but
 * the id sits in the `rebid` family, so the app showed opening points and the
 * Rule of 20 under a decision high cards alone settle.
 *
 * The fallback is for a sidecar older than the field. It is the old guess and
 * is wrong in the same places, so it is deliberately coarse: opening
 * decisions only, high cards for everything else.
 */
export function pointContextFor(
  basis: string | undefined,
  trump: string | null | undefined,
  family: string,
): { context: PointContext; trump?: Suit } {
  if (basis === "support") {
    return { context: "support", trump: (trump ?? undefined) as Suit | undefined };
  }
  if (basis === "opening" || basis === "hcp") return { context: basis };
  return { context: family === "open" ? "opening" : "hcp" };
}

/** Shortage points for a known trump fit: void 5, singleton 3, doubleton 1. */
export function shortagePoints(
  p: HandPoints,
  trump: Suit,
): { suits: { suit: Suit; length: number; points: number }[]; total: number } {
  const suits = p.suits
    .filter((s) => s.suit !== trump)
    .map((s) => ({
      suit: s.suit,
      length: s.length,
      points: s.length === 0 ? 5 : s.length === 1 ? 3 : s.length === 2 ? 1 : 0,
    }))
    .filter((s) => s.points > 0);
  return { suits, total: suits.reduce((n, s) => n + s.points, 0) };
}

function displayRank(rank: string): string {
  return rank === "T" ? "10" : rank;
}

const RANK_ORDER = "AKQJT98765432";

/**
 * Everything the opening decision is made from, laid out step by step so a
 * learner can check their own count against it.
 */
export function handPoints(cards: Card[]): HandPoints {
  const suits: SuitPoints[] = SUITS.map((suit) => {
    const held = cards
      .filter((c) => cardSuit(c) === suit)
      .map((c) => cardRank(c))
      .sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
    const honours = held
      .filter((r) => HCP_VALUE[r] != null)
      .map((r) => ({ rank: displayRank(r), value: HCP_VALUE[r]! }));
    return {
      suit,
      ranks: held.map(displayRank),
      length: held.length,
      honours,
      hcp: honours.reduce((n, h) => n + h.value, 0),
      lengthPoints: held.length >= 5 ? held.length - 4 : 0,
    };
  });

  const hcp = suits.reduce((n, s) => n + s.hcp, 0);
  const lengthPoints = suits.reduce((n, s) => n + s.lengthPoints, 0);
  const twoLongest = [...suits]
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);

  return {
    suits,
    hcp,
    lengthPoints,
    openingPoints: hcp + lengthPoints,
    shape: suits.map((s) => s.length).join("-"),
    twoLongest,
    ruleOf20: hcp + twoLongest.reduce((n, s) => n + s.length, 0),
  };
}

/** Which family of opening the decision landed in, taken from the leaf id. */
export type OpeningKind =
  | "suit"
  | "notrump"
  | "strong"
  | "weak-two"
  | "preempt"
  | "pass";

/**
 * The bid the decision actually made, classified.
 *
 * Read from the leaf id rather than re-derived from the hand: the display
 * must never argue with the call above it. A 5332 sixteen-count has a
 * five-card major AND opens 1NT, so a shape-first explanation invented here
 * would contradict the tree on a hand the tree is right about.
 *
 * `null` means "not an opening decision" — say nothing rather than guess.
 */
export function openingKind(leafId: string | undefined): OpeningKind | null {
  if (!leafId) return null;
  if (leafId === "open.pass" || leafId === "pass.fourth-seat") return "pass";
  if (leafId.startsWith("open.1nt") || leafId === "open.2nt") return "notrump";
  if (leafId === "open.2c") return "strong";
  if (leafId.startsWith("open.2")) return "weak-two";
  if (leafId.startsWith("open.3")) return "preempt";
  if (leafId.startsWith("open.1")) return "suit";
  return null;
}

export interface SuitChoice {
  /** Longest first; ties in bidding rank order, so the winner is first. */
  ranked: SuitPoints[];
  winner: SuitPoints;
  runnerUp: SuitPoints | undefined;
  /** The runner-up is the same length as the winner — rank broke the tie. */
  tied: boolean;
  /** No suit reaches five: the longest-suit rule leaves only a minor. */
  noFiveCardSuit: boolean;
  /** A minor won over a major of five or more — strictly longer, so it wins. */
  minorBeatsFiveCardMajor: boolean;
}

const IS_MAJOR_SUIT: Record<Suit, boolean> = { S: true, H: true, D: false, C: false };

/**
 * How the opening bid's suit is picked: longest wins, ties go to the higher
 * ranking suit.
 *
 * `suits` arrives in S-H-D-C order, which is bidding rank high to low, so a
 * stable sort on length alone already resolves ties the way the system does —
 * and that is why a major takes every tie against a minor, and why a minor
 * only ever wins by being strictly longer.
 */
export function suitChoice(p: HandPoints): SuitChoice {
  const ranked = [...p.suits].sort((a, b) => b.length - a.length);
  const winner = ranked[0]!;
  const runnerUp = ranked[1];
  return {
    ranked,
    winner,
    runnerUp,
    tied: runnerUp?.length === winner.length,
    noFiveCardSuit: winner.length < 5,
    minorBeatsFiveCardMajor:
      !IS_MAJOR_SUIT[winner.suit] &&
      p.suits.some((s) => IS_MAJOR_SUIT[s.suit] && s.length >= 5),
  };
}
