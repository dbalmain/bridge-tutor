import { padAuction } from "../lib/auction";
import type { Seat } from "../lib/types";

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
