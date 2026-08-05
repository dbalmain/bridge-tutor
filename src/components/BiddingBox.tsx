import { bidDisplay } from "../lib/cards";
import { beginnerBidOptions } from "../lib/engine";

interface Props {
  enabled: boolean;
  onBid: (bid: string) => void;
  highlight?: string | null;
}

export function BiddingBox({ enabled, onBid, highlight }: Props) {
  const options = beginnerBidOptions();

  return (
    <div className={`bidding-box ${enabled ? "" : "bidding-box--disabled"}`}>
      <div className="bidding-box__label">Your bid</div>
      <div className="bidding-box__grid">
        {options.map((bid) => (
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
    </div>
  );
}
