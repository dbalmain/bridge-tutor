import { SUIT_COLOR, SUIT_SYMBOL } from "../lib/cards";
import {
  handPoints,
  shortagePoints,
  type HandPoints,
  type PointContext,
  type SuitPoints,
} from "../lib/handPoints";
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

const CONTEXT_TITLE: Record<PointContext, string> = {
  opening: "How your points add up — counting to open",
  hcp: "How your points add up — high cards only",
  support: "How your points add up — with a fit",
};

/**
 * The full step-by-step count. Which count depends on the decision: opening
 * points to decide whether to open, HCP alone opposite a notrump opening, and
 * HCP plus shortage once a trump fit is known. Showing the opening steps after
 * a response taught the wrong arithmetic for the bid being made.
 */
export function PointsBreakdown({
  cards,
  context = "opening",
  trump,
  title,
}: {
  cards: Card[];
  context?: PointContext;
  trump?: Suit;
  title?: string;
}) {
  const p: HandPoints = handPoints(cards);
  const [long1, long2] = p.twoLongest;
  const shortage = trump ? shortagePoints(p, trump) : null;
  const heading = title ?? CONTEXT_TITLE[context];
  return (
    <div className="points">
      <h3 className="points__title">{heading}</h3>
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
        {context === "hcp" && (
          <li>
            <strong>That is the whole count here.</strong> Length points decide
            whether to <em>open</em>. Partner has already opened and told you a
            narrow range, so this decision is high cards against that range —
            no length, no shortage.
          </li>
        )}
        {context === "support" && shortage && (
          <li>
            <strong>Step 2 — shortage, not length.</strong> Once a trump fit is
            known, short suits win tricks by ruffing: void 5, singleton 3,
            doubleton 1.{" "}
            {shortage.suits.length > 0 ? (
              <>
                {shortage.suits.map((sh, i) => (
                  <span key={sh.suit}>
                    {i > 0 && ", "}
                    {sh.length}
                    <SuitMark suit={sh.suit} /> +{sh.points}
                  </span>
                ))}{" "}
                → support points = {p.hcp} + {shortage.total} ={" "}
                <strong>{p.hcp + shortage.total}</strong>.
              </>
            ) : (
              <>No short suit, so support points = {p.hcp}.</>
            )}
          </li>
        )}
        {context === "opening" && (
        <li>
          <strong>Step 2 — length points.</strong> One for every card over four
          in a suit →{" "}
          <strong>
            +{p.lengthPoints}
          </strong>
          . Opening points = {p.hcp} + {p.lengthPoints} ={" "}
          <strong>{p.openingPoints}</strong>.
        </li>
        )}
        {context === "opening" && (
        <li>
          <strong>Step 3 — 13 or more?</strong> {p.openingPoints} is{" "}
          {p.openingPoints >= 13 ? "enough — open." : "not enough on its own."}
        </li>
        )}
        {context === "opening" && (
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
        )}
      </ol>
    </div>
  );
}
