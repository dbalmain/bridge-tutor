import type { ReactNode } from "react";
import { hcp } from "../lib/cards";
import type { Card, Seat } from "../lib/types";
import { HandRow } from "./HandRow";
import { PointsLine } from "./PointsBreakdown";

const SEAT_ROWS: { seat: Seat; label: string }[] = [
  { seat: "N", label: "North (partner)" },
  { seat: "E", label: "East" },
  { seat: "S", label: "South (you)" },
  { seat: "W", label: "West" },
];

export function HandsReview({
  hands,
  children,
}: {
  hands: { N: Card[]; E: Card[]; S: Card[]; W: Card[] };
  children?: ReactNode;
}) {
  return (
    <section className="panel hands-review">
      <h2>The hands</h2>
      <p className="muted small">
        Every hand counted the same way. Yours is highlighted.
      </p>
      {SEAT_ROWS.map(({ seat, label }) => (
        <div
          key={seat}
          className={
            "hands-review__seat" +
            (seat === "S" ? " hands-review__seat--you" : "")
          }
        >
          <HandRow
            cards={hands[seat]}
            label={label}
            hcp={hcp(hands[seat])}
            size="sm"
            align="start"
          />
          <PointsLine cards={hands[seat]} />
        </div>
      ))}
      {children}
    </section>
  );
}
