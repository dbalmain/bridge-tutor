import { bidDisplay } from "../lib/cards";
import { bidLevelRows, specialBids } from "../lib/engine";

interface Props {
  enabled: boolean;
  onBid: (bid: string) => void;
  highlight?: string | null;
}

export function BiddingBox({ enabled, onBid, highlight }: Props) {
  const levels = bidLevelRows();
  const specials = specialBids();

  return (
    <div className={`bidding-box ${enabled ? "" : "bidding-box--disabled"}`}>
      <div className="bidding-box__label">Your bid</div>
      <div className="bidding-box__levels" role="group" aria-label="Level bids">
        {levels.map((row, i) => (
          <div key={row[0]} className="bidding-box__row">
            <span className="bidding-box__level-tag">{i + 1}</span>
            {row.map((bid) => (
              <button
                key={bid}
                type="button"
                className={
                  "bid-btn" +
                  (highlight && highlight === bid ? " bid-btn--hint" : "")
                }
                disabled={!enabled}
                onClick={() => onBid(bid)}
              >
                {bidDisplay(bid)}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div
        className="bidding-box__specials"
        role="group"
        aria-label="Pass and doubles"
      >
        {specials.map((bid) => (
          <button
            key={bid}
            type="button"
            className={
              "bid-btn bid-btn--special" +
              (highlight && highlight === bid ? " bid-btn--hint" : "")
            }
            disabled={!enabled}
            onClick={() => onBid(bid)}
          >
            {bidDisplay(bid)}
          </button>
        ))}
      </div>
    </div>
  );
}
