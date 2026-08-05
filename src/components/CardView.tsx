import { cardLabel, cardSuit, SUIT_COLOR } from "../lib/cards";
import type { Card } from "../lib/types";

interface Props {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}

export function CardView({
  card,
  selected,
  disabled,
  faceDown,
  size = "md",
  onClick,
}: Props) {
  if (faceDown) {
    return <div className={`card card--back card--${size}`} aria-hidden />;
  }

  const color = SUIT_COLOR[cardSuit(card)];
  const cls = [
    "card",
    `card--${size}`,
    `card--${color}`,
    selected ? "card--selected" : "",
    disabled ? "card--disabled" : "",
    onClick && !disabled ? "card--clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={cls}
      disabled={disabled || !onClick}
      onClick={onClick}
      aria-label={cardLabel(card)}
    >
      <span className="card__label">{cardLabel(card)}</span>
    </button>
  );
}
