export function loadDds(): Promise<unknown>;

export class Dds {
  constructor(module: unknown);
  SolveBoardPBN(
    dealPbn: {
      trump: number;
      first: number;
      currentTrickSuit: number[];
      currentTrickRank: number[];
      remainCards: string;
    },
    target: number,
    solutions: number,
    mode: number,
  ): {
    nodes: number;
    cards: number;
    suit: number[];
    rank: number[];
    equals: number[];
    score: number[];
  };
}

export class DdsError extends Error {
  constructor(code: number);
}

export const Trump: {
  Spades: number;
  Hearts: number;
  Diamonds: number;
  Clubs: number;
  NoTrump: number;
};

export const Direction: {
  North: number;
  East: number;
  South: number;
  West: number;
};
