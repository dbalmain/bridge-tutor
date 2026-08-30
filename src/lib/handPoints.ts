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
