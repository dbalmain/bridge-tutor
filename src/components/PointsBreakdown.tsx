import { SUIT_COLOR, SUIT_SYMBOL } from "../lib/cards";
import { handPoints, type HandPoints, type SuitPoints } from "../lib/handPoints";
import type { Card, Suit } from "../lib/types";

const IS_MAJOR: Record<Suit, boolean> = { S: true, H: true, D: false, C: false };

function SuitMark({ suit }: { suit: Suit }) {
  return (
    <span className={`suit-mark suit-mark--${SUIT_COLOR[suit]}`}>
      {SUIT_SYMBOL[suit]}
    </span>
  );
}

function suitLine(s: SuitPoints): string {
  return s.ranks.length > 0 ? s.ranks.join(" ") : "—";
}

function honourLine(s: SuitPoints): string {
  if (s.honours.length === 0) return "—";
  return s.honours.map((h) => `${h.rank}=${h.value}`).join(" + ");
}

/** "7 HCP (A♣ 4, K♦ 3) + 1 length (5♥) = 8" — one line, for the review list. */
export function PointsLine({ cards }: { cards: Card[] }) {
  const p = handPoints(cards);
  const honours = p.suits.flatMap((s) =>
    s.honours.map((h) => (
      <span key={`${s.suit}${h.rank}`} className="points-line__item">
        {h.rank}
        <SuitMark suit={s.suit} /> {h.value}
      </span>
    )),
  );
  const lengths = p.suits.filter((s) => s.lengthPoints > 0);
  return (
    <p className="muted small points-line">
      <strong>{p.hcp} HCP</strong>
      {honours.length > 0 ? <> = {honours}</> : " (no honours)"}
      {" · "}
      <strong>+{p.lengthPoints} length</strong>
      {lengths.length > 0 && (
        <>
          {" ("}
          {lengths.map((s, i) => (
            <span key={s.suit}>
              {i > 0 && ", "}
              {s.length}
              <SuitMark suit={s.suit} /> +{s.lengthPoints}
            </span>
          ))}
          {")"}
        </>
      )}
      {" · "}
      <strong>{p.openingPoints} opening points</strong>
      {" · shape "}
      {p.shape}
      {" · Rule of 20 = "}
      {p.ruleOf20}
    </p>
  );
}

/** The full step-by-step count, for the hand the student just bid. */
export function PointsBreakdown({
  cards,
  title = "How your points add up",
}: {
  cards: Card[];
  title?: string;
}) {
  const p: HandPoints = handPoints(cards);
  const [long1, long2] = p.twoLongest;
  return (
    <div className="points">
      <h3 className="points__title">{title}</h3>
      <table className="points-table">
        <thead>
          <tr>
            <th>Suit</th>
            <th>Cards</th>
            <th className="num">Len</th>
            <th>High cards</th>
            <th className="num">HCP</th>
            <th className="num">Length pts</th>
          </tr>
        </thead>
        <tbody>
          {p.suits.map((s) => (
            <tr key={s.suit}>
              <td>
                <SuitMark suit={s.suit} />{" "}
                <span className="points-table__kind">
                  {IS_MAJOR[s.suit] ? "major" : "minor"}
                </span>
              </td>
              <td className="points-table__cards">{suitLine(s)}</td>
              <td className="num">{s.length}</td>
              <td>{honourLine(s)}</td>
              <td className="num">{s.hcp}</td>
              <td className="num">{s.lengthPoints > 0 ? `+${s.lengthPoints}` : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td />
            <td className="num">13</td>
            <td />
            <td className="num">{p.hcp}</td>
            <td className="num">+{p.lengthPoints}</td>
          </tr>
        </tfoot>
      </table>
      <ol className="points-steps">
        <li>
          <strong>Step 1 — high-card points.</strong> A=4, K=3, Q=2, J=1 →{" "}
          <strong>{p.hcp} HCP</strong>.
        </li>
        <li>
          <strong>Step 2 — length points.</strong> One for every card over four
          in a suit →{" "}
          <strong>
            +{p.lengthPoints}
          </strong>
          . Opening points = {p.hcp} + {p.lengthPoints} ={" "}
          <strong>{p.openingPoints}</strong>.
        </li>
        <li>
          <strong>Step 3 — 13 or more?</strong> {p.openingPoints} is{" "}
          {p.openingPoints >= 13 ? "enough — open." : "not enough on its own."}
        </li>
        <li>
          <strong>Step 4 — Rule of 20.</strong> {p.hcp} HCP + {long1?.length}{" "}
          {long1 && <SuitMark suit={long1.suit} />} + {long2?.length}{" "}
          {long2 && <SuitMark suit={long2.suit} />} ={" "}
          <strong>{p.ruleOf20}</strong>.{" "}
          {p.ruleOf20 >= 20 && p.hcp >= 10
            ? "20 or more with at least 10 HCP — you may open."
            : p.ruleOf20 >= 20
              ? `20 or more, but only ${p.hcp} HCP — the rule needs 10. No.`
              : "Under 20 — no."}
        </li>
      </ol>
    </div>
  );
}
