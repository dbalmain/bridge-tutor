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
