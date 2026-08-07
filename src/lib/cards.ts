import type { Card, Rank, Seat, Suit } from "./types";

export const SEATS: Seat[] = ["S", "W", "N", "E"];
export const SEAT_LABEL: Record<Seat, string> = {
  S: "South (You)",
  W: "West",
  N: "North (Dummy)",
  E: "East",
};
export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const SUIT_SYMBOL: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};
export const SUIT_COLOR: Record<Suit, "red" | "black"> = {
  S: "black",
  H: "red",
  D: "red",
  C: "black",
};
export const RANKS: Rank[] = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];

const RANK_VALUE: Record<string, number> = {
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

const HCP: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

export function cardSuit(card: Card): Suit {
  return card[0] as Suit;
}

export function cardRank(card: Card): Rank {
  return card.slice(1) as Rank;
}

export function rankValue(rank: string): number {
  return RANK_VALUE[rank] ?? 0;
}

export function cardLabel(card: Card): string {
  const suit = cardSuit(card);
  const rank = cardRank(card);
  const r = rank === "T" ? "10" : rank;
  return `${r}${SUIT_SYMBOL[suit]}`;
}

export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const sa = SUITS.indexOf(cardSuit(a));
    const sb = SUITS.indexOf(cardSuit(b));
    if (sa !== sb) return sa - sb;
    return rankValue(cardRank(b)) - rankValue(cardRank(a));
  });
}

export function hcp(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + (HCP[cardRank(c)] ?? 0), 0);
}

export function nextSeat(seat: Seat): Seat {
  const i = SEATS.indexOf(seat);
  return SEATS[(i + 1) % 4];
}

export function partner(seat: Seat): Seat {
  return nextSeat(nextSeat(seat));
}

/** Winner of a trick given lead seat, four cards in play order, and trump suit (null = NT). */
export function trickWinner(
  lead: Seat,
  cards: Card[],
  trump: Suit | null,
): Seat {
  if (cards.length !== 4) throw new Error("trick needs 4 cards");
  const ledSuit = cardSuit(cards[0]);
  let bestIdx = 0;
  let bestCard = cards[0];

  for (let i = 1; i < 4; i++) {
    const c = cards[i];
    const cSuit = cardSuit(c);
    const bSuit = cardSuit(bestCard);

    if (trump) {
      const cTrump = cSuit === trump;
      const bTrump = bSuit === trump;
      if (cTrump && !bTrump) {
        bestIdx = i;
        bestCard = c;
        continue;
      }
      if (!cTrump && bTrump) continue;
      if (cTrump && bTrump) {
        if (rankValue(cardRank(c)) > rankValue(cardRank(bestCard))) {
          bestIdx = i;
          bestCard = c;
        }
        continue;
      }
    }

    // Neither is trump (or NT): must follow led suit to win
    if (cSuit === ledSuit && bSuit === ledSuit) {
      if (rankValue(cardRank(c)) > rankValue(cardRank(bestCard))) {
        bestIdx = i;
        bestCard = c;
      }
    } else if (cSuit === ledSuit && bSuit !== ledSuit) {
      bestIdx = i;
      bestCard = c;
    }
  }

  let seat = lead;
  for (let i = 0; i < bestIdx; i++) seat = nextSeat(seat);
  return seat;
}

export function legalCards(hand: Card[], ledSuit: Suit | null): Card[] {
  if (!ledSuit) return hand;
  const following = hand.filter((c) => cardSuit(c) === ledSuit);
  return following.length > 0 ? following : hand;
}

/**
 * Two cards in the same hand are "equals" when no remaining card in any
 * *other* hand ranks strictly between them in that suit. Playing either
 * then has the same effect for pure cashing / low-spot choice (e.g. 8♠ vs 5♠
 * with nothing between them still out).
 *
 * Only cards still held (not yet played) are considered.
 */
export function areEqualCards(
  hands: Record<Seat, Card[]>,
  seat: Seat,
  a: Card,
  b: Card,
): boolean {
  if (a === b) return true;
  if (cardSuit(a) !== cardSuit(b)) return false;
  if (!hands[seat].includes(a) || !hands[seat].includes(b)) return false;

  const suit = cardSuit(a);
  const lo = Math.min(rankValue(cardRank(a)), rankValue(cardRank(b)));
  const hi = Math.max(rankValue(cardRank(a)), rankValue(cardRank(b)));

  for (const s of SEATS) {
    if (s === seat) continue;
    for (const c of hands[s]) {
      if (cardSuit(c) !== suit) continue;
      const r = rankValue(cardRank(c));
      if (r > lo && r < hi) return false;
    }
  }
  return true;
}

/**
 * When the opponents hold no cards in a suit, every card of that suit in
 * `seat`'s hand is equivalent for cashing (order of low winners / spots
 * does not matter). Partner may still hold the suit.
 */
export function areCashEqualsWhenOpponentsVoid(
  hands: Record<Seat, Card[]>,
  seat: Seat,
  a: Card,
  b: Card,
): boolean {
  if (a === b) return true;
  if (cardSuit(a) !== cardSuit(b)) return false;
  if (!hands[seat].includes(a) || !hands[seat].includes(b)) return false;

  const suit = cardSuit(a);
  const opponents: Seat[] =
    seat === "N" || seat === "S" ? ["E", "W"] : ["N", "S"];
  for (const o of opponents) {
    if (hands[o].some((c) => cardSuit(c) === suit)) return false;
  }
  return true;
}

/** Accept either strict equals or cashing equals when opponents are void. */
export function areEquivalentPlays(
  hands: Record<Seat, Card[]>,
  seat: Seat,
  expected: Card,
  played: Card,
): boolean {
  return (
    areEqualCards(hands, seat, expected, played) ||
    areCashEqualsWhenOpponentsVoid(hands, seat, expected, played)
  );
}

export function contractTrump(contract: string | null): Suit | null {
  if (!contract) return null;
  if (contract.endsWith("NT")) return null;
  return contract.slice(-1) as Suit;
}

export function bidDisplay(bid: string): string {
  if (bid === "Pass") return "Pass";
  if (bid === "X") return "X";
  if (bid === "XX") return "XX";
  const m = bid.match(/^([1-7])(C|D|H|S|NT)$/);
  if (!m) return bid;
  if (m[2] === "NT") return `${m[1]}NT`;
  return `${m[1]}${SUIT_SYMBOL[m[2] as Suit]}`;
}

/** Heuristic tags for mistake journal / AI coaching later. */
export function guessTags(
  phase: "bidding" | "play",
  expected: string,
  teaching?: string,
): string[] {
  const tags: string[] = [phase];
  const t = `${expected} ${teaching ?? ""}`.toLowerCase();
  if (t.includes("trump") || t.includes("draw")) tags.push("trumps");
  if (t.includes("finesse")) tags.push("finesse");
  if (t.includes("1nt") || t.includes("no-trump") || t.includes("notrump"))
    tags.push("notrump");
  if (t.includes("overcall")) tags.push("overcall");
  if (t.includes("double")) tags.push("takeout-double");
  if (t.includes("raise") || t.includes("fit")) tags.push("fit");
  if (t.includes("game") || t.includes("3nt") || t.includes("4s") || t.includes("4h"))
    tags.push("game-bidding");
  if (t.includes("open")) tags.push("opening");
  if (t.includes("respond")) tags.push("response");
  if (t.includes("establish") || t.includes("longest")) tags.push("suit-establishment");
  if (t.includes("ruff") || t.includes("trump it")) tags.push("ruffing");
  return [...new Set(tags)];
}
