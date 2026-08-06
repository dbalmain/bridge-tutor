import { bidDisplay } from "../lib/cards";
import { bidLevelRows, isLegalCall, specialBids } from "../lib/engine";
import type { Seat } from "../lib/types";

interface Props {
  enabled: boolean;
  onBid: (bid: string) => void;
  highlight?: string | null;
  /** Auction so far — used to grey out insufficient / illegal calls. */
  auctionLog?: { seat: Seat; bid: string }[];
  seat?: Seat;
}

export function BiddingBox({
  enabled,
  onBid,
  highlight,
  auctionLog = [],
  seat = "S",
}: Props) {
  const levels = bidLevelRows();
  const specials = specialBids();

  return (
    <div className={`bidding-box ${enabled ? "" : "bidding-box--disabled"}`}>
      <div className="bidding-box__label">Your bid</div>
      <div className="bidding-box__levels" role="group" aria-label="Level bids">
        {levels.map((row, i) => (
          <div key={row[0]} className="bidding-box__row">
            <span className="bidding-box__level-tag">{i + 1}</span>
            {row.map((bid) => {
              const legal = isLegalCall(auctionLog, bid, seat);
              return (
                <button
                  key={bid}
                  type="button"
                  className={
                    "bid-btn" +
                    (highlight && highlight === bid ? " bid-btn--hint" : "") +
                    (!legal ? " bid-btn--illegal" : "")
                  }
                  disabled={!enabled || !legal}
                  title={legal ? undefined : "Illegal bid"}
                  onClick={() => onBid(bid)}
                >
                  {bidDisplay(bid)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div
        className="bidding-box__specials"
        role="group"
        aria-label="Pass and doubles"
      >
        {specials.map((bid) => {
          const legal = isLegalCall(auctionLog, bid, seat);
          return (
            <button
              key={bid}
              type="button"
              className={
                "bid-btn bid-btn--special" +
                (highlight && highlight === bid ? " bid-btn--hint" : "") +
                (!legal ? " bid-btn--illegal" : "")
              }
              disabled={!enabled || !legal}
              title={legal ? undefined : "Illegal bid"}
              onClick={() => onBid(bid)}
            >
              {bidDisplay(bid)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
