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
 * Which count the decision actually uses, from the leaf being drilled.
 * Opening and rebid decisions use opening points; responses to a notrump
 * opening are high cards only; a raise means a fit is known, so shortage.
 */
export function pointContextFor(
  family: string,
  leafId: string,
): { context: PointContext; trump?: Suit } {
  if (family === "1nt" || family === "strong") return { context: "hcp" };
  const raise = /\braise\d?\b/.test(leafId) || /\.raise/.test(leafId);
  if (raise) {
    const m = leafId.match(/^resp\.1([cdhs])\./);
    const trump = m?.[1]?.toUpperCase() as Suit | undefined;
    return { context: "support", trump };
  }
  if (family === "major" || family === "minor") return { context: "hcp" };
  return { context: "opening" };
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
