import { bidDisplay } from "../lib/cards";

export function BidExplainer({
  chosen,
  expected,
  explanation,
  awaitingCorrection,
  missed,
}: {
  chosen: string;
  expected: string;
  explanation: string;
  awaitingCorrection: boolean;
  missed: boolean;
}) {
  const ok = !awaitingCorrection && !missed;
  return (
    <div className={"feedback " + (ok ? "feedback--ok" : "feedback--mistake")}>
      <h2>
        {awaitingCorrection
          ? "Not that call"
          : missed
            ? "That's the system bid"
            : "Right"}
      </h2>
      <p>
        You bid {bidDisplay(chosen)}. The system bid is{" "}
        <strong>{bidDisplay(expected)}</strong>.
      </p>
      <p>{explanation}</p>
      {awaitingCorrection && (
        <p className="hint">
          Try: <strong>{bidDisplay(expected)}</strong>
        </p>
      )}
    </div>
  );
}
