import { sortHand } from "../lib/cards";
import type { Card } from "../lib/types";
import { CardView } from "./CardView";

interface Props {
  cards: Card[];
  faceDown?: boolean;
  selectable?: boolean;
  legal?: Card[] | null;
  onPlay?: (card: Card) => void;
  label?: string;
  hcp?: number;
  size?: "sm" | "md" | "lg";
  align?: "start" | "center";
}

export function HandRow({
  cards,
  faceDown,
  selectable,
  legal,
  onPlay,
  label,
  hcp,
  size = "md",
  align = "center",
}: Props) {
  const sorted = sortHand(cards);
  return (
    <div className={"hand-row" + (align === "start" ? " hand-row--start" : "")}>
      {(label || hcp != null) && (
        <div className="hand-row__meta">
          {label && <span className="hand-row__name">{label}</span>}
          {hcp != null && <span className="hand-row__hcp">{hcp} HCP</span>}
        </div>
      )}
      <div className="hand-row__cards">
        {sorted.map((card) => {
          const isLegal = !legal || legal.includes(card);
          return (
            <CardView
              key={card}
              card={card}
              size={size}
              faceDown={faceDown}
              disabled={selectable ? !isLegal : true}
              onClick={
                selectable && isLegal && onPlay
                  ? () => onPlay(card)
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
