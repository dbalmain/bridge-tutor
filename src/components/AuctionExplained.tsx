import type { ScriptCall } from "../lib/bridgeSystem";
import { bidDisplay } from "../lib/cards";

const SEAT_NAME = { N: "North", E: "East", S: "South", W: "West" } as const;

function seatLabel(seat: ScriptCall["seat"]): string {
  if (seat === "S") return "South (you)";
  if (seat === "N") return "North (partner)";
  return SEAT_NAME[seat];
}

function fallbackExplanation(step: ScriptCall): string {
  if (step.seat === "E" || step.seat === "W") {
    return "This course does not bid the opponents' hands — East and West always pass.";
  }
  return "";
}

/**
 * Every call in the auction with the reason for it, so a learner can read
 * partner's and the opponents' calls too. Your own calls are highlighted:
 * they are the ones you are being tested on, and the rest is context.
 */
export function AuctionExplained({ script }: { script: ScriptCall[] }) {
  if (script.length === 0) return null;
  return (
    <section className="panel auction-explained">
      <h2>Every call, explained</h2>
      <p className="muted small">
        Your calls are highlighted. Partner's and the opponents' calls are
        there for context — read them when you are ready, and skip them until
        then.
      </p>
      <ol className="call-list">
        {script.map((step, i) => {
          const explanation = step.explanation || fallbackExplanation(step);
          const bid = bidDisplay(step.bid);
          // The tree titles a plain pass "Pass", which would print twice.
          const title = step.title === bid ? "" : step.title;
          return (
            <li
              key={`${i}-${step.seat}-${step.bid}`}
              className={
                "call-list__item" +
                (step.seat === "S" ? " call-list__item--you" : "")
              }
            >
              <div className="call-list__head">
                <span className="call-list__seat">{seatLabel(step.seat)}</span>
                <span className="call-list__bid">{bid}</span>
                {title && <span className="call-list__title">{title}</span>}
                {step.student && (
                  <span className="badge call-list__badge">your call</span>
                )}
              </div>
              {explanation && (
                <p className="call-list__why">{explanation}</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
