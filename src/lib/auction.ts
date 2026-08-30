import { bidDisplay } from "./cards";
import type { Seat } from "./types";

const SEAT_ORDER: Seat[] = ["N", "E", "S", "W"];

export function auctionLog(
  dealer: Seat,
  calls: string[],
): { seat: Seat; bid: string }[] {
  const start = SEAT_ORDER.indexOf(dealer);
  return calls.map((bid, i) => ({
    seat: SEAT_ORDER[(start + i) % 4]!,
    bid,
  }));
}

export function padAuction(
  dealer: Seat,
  log: { seat: Seat; bid: string }[],
): string[] {
  const start = SEAT_ORDER.indexOf(dealer);
  const cells: string[] = [];
  for (let i = 0; i < start; i++) cells.push("");
  for (const ev of log) cells.push(bidDisplay(ev.bid));
  return cells;
}

/** Last real call, for the “ends at” line. Not full declarer logic. */
export function auctionEndedAt(
  log: { seat: Seat; bid: string }[],
): { seat: Seat; bid: string } | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const ev = log[i]!;
    if (ev.bid !== "Pass" && ev.bid !== "X" && ev.bid !== "XX") return ev;
  }
  return null;
}
