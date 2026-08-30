import { auctionEndedAt, padAuction } from "../lib/auction";
import { bidDisplay } from "../lib/cards";
import type { Seat } from "../lib/types";

const SEAT_NAME = { N: "North", E: "East", S: "South", W: "West" } as const;

export function AuctionStrip({
  dealer,
  log,
  waiting = false,
}: {
  dealer: Seat;
  log: { seat: Seat; bid: string }[];
  waiting?: boolean;
}) {
  return (
    <div className="auction drill-auction">
      <div className="auction__head">
        <span>N</span>
        <span>E</span>
        <span>S</span>
        <span>W</span>
      </div>
      <div className="auction__body">
        {padAuction(dealer, log).map((cell, i) => (
          <span key={i} className="auction__cell">
            {cell}
          </span>
        ))}
        {waiting && (
          <span className="auction__cell auction__cell--turn">?</span>
        )}
      </div>
    </div>
  );
}

/** How the auction finished. */
export function AuctionOutcome({
  log,
}: {
  log: { seat: Seat; bid: string }[];
}) {
  const ended = auctionEndedAt(log);
  return (
    <p className="auction-note">
      {ended
        ? `Ends at ${bidDisplay(ended.bid)} (${SEAT_NAME[ended.seat]})`
        : "Passed out"}
    </p>
  );
}
