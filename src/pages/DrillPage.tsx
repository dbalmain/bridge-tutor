import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AuctionExplained } from "../components/AuctionExplained";
import { AuctionOutcome, AuctionStrip } from "../components/AuctionStrip";
import { BidExplainer } from "../components/BidExplainer";
import { BiddingBox } from "../components/BiddingBox";
import { HandRow } from "../components/HandRow";
import { HandsReview } from "../components/HandsReview";
import { PointsBreakdown } from "../components/PointsBreakdown";
import { pointContextFor } from "../lib/handPoints";
import {
  applyResult,
  fetchCatalog,
  nextDrill,
  randomSeed,
  type Catalog,
  type Drill,
} from "../lib/bridgeSystem";
import { bidDisplay } from "../lib/cards";
import {
  loadSystemProgressJson,
  saveSystemProgressJson,
} from "../lib/systemProgress";
import { useBidPlaythrough } from "../lib/useBidPlaythrough";

const SEAT_NAME = { N: "North", E: "East", S: "South", W: "West" } as const;

const FAMILIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Openings" },
  { id: "1nt", label: "1NT" },
  { id: "major", label: "1♥ / 1♠" },
  { id: "minor", label: "1♣ / 1♦" },
  { id: "strong", label: "2♣ / 2NT / preempts" },
  { id: "rebid", label: "Rebids" },
];

export function DrillPage() {
  const [family, setFamily] = useState("all");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const loadGen = useRef(0);

  const load = useCallback(async (fam: string) => {
    const gen = (loadGen.current += 1);
    setBusy(true);
    setLoadError(null);
    try {
      const d = await nextDrill(loadSystemProgressJson(), fam, randomSeed());
      if (loadGen.current !== gen) return;
      setDrill(d);
    } catch (e) {
      if (loadGen.current !== gen) return;
      setLoadError(e instanceof Error ? e.message : String(e));
      setDrill(null);
    } finally {
      if (loadGen.current === gen) setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void load(family);
  }, [family, load]);

  const play = useBidPlaythrough(drill, {
    onDecision: (d) => {
      void applyResult(loadSystemProgressJson(), d.leafId, d.correct)
        .then(saveSystemProgressJson)
        .catch((e) => console.error(e));
    },
  });

  const log = play.revealed.map((s) => ({ seat: s.seat, bid: s.bid }));
  // Counting the hand is the lesson, so the count stays hidden until the
  // auction is over or a miss has already given the answer away.
  const showPoints = play.done || play.missedAny;

  return (
    <div className="page drill-page">
      <p className="eyebrow">ABF Standard 5-card majors</p>
      <h1>Bidding drills</h1>
      <p className="lede">
        Bid each auction from the start. Weak leaves still come up more often;
        you just don&apos;t skip to the hard call. Partner and the opponents
        bid the system (they pass). A miss shows the explainer — bid the system
        call before the auction continues. New to the system? Start with the{" "}
        <Link to="/bid">bidding course</Link>.
      </p>

      <div className="family-chips" role="tablist" aria-label="Drill topic">
        {FAMILIES.map((f) => (
          <button
            key={f.id}
            type="button"
            className={
              "family-chip" + (family === f.id ? " family-chip--on" : "")
            }
            onClick={() => setFamily(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadError && (
        <section className="panel feedback--mistake">
          <h2>Could not load a drill</h2>
          <p>{loadError}</p>
        </section>
      )}

      {busy && !drill && <p className="muted">Dealing a hand…</p>}

      {drill && (
        <div className="drill-grid">
          <section className="panel">
            <div className="drill-meta">
              <span className="badge">{drill.family_title}</span>
              {play.done && (
                <span className="muted small">{drill.title}</span>
              )}
            </div>
            <AuctionStrip
              dealer={drill.dealer}
              log={log}
              waiting={play.waitingForStudent}
            />
            {play.lastAuto && !play.waitingForStudent && !play.done && (
              <p className="auction-note">
                {play.lastAuto.seat === "S"
                  ? "System continues"
                  : `${SEAT_NAME[play.lastAuto.seat]} bids`}{" "}
                {bidDisplay(play.lastAuto.bid)}
                {play.lastAuto.title ? ` — ${play.lastAuto.title}` : ""}
              </p>
            )}
            {play.done && (
              <AuctionOutcome log={log} />
            )}
            <HandRow
              cards={drill.hands.S}
              label="South (you)"
              hcp={showPoints ? drill.south_hcp : undefined}
              size="lg"
              align="start"
            />
            {showPoints &&
              (() => {
                const ctx = pointContextFor(drill.point_basis, drill.point_trump, drill.family);
                return (
                  <PointsBreakdown
                    cards={drill.hands.S}
                    context={ctx.context}
                    trump={ctx.trump}
                    leafId={drill.leaf_id}
                  />
                );
              })()}
          </section>

          <section className="panel">
            <BiddingBox
              enabled={!busy && play.boxEnabled}
              onBid={(b) => play.onBid(b)}
              auctionLog={log}
              seat="S"
              highlight={play.highlight}
            />
            {play.chosen && play.expected && (
              <BidExplainer
                chosen={play.chosen}
                expected={play.expected}
                explanation={play.explanation}
                awaitingCorrection={play.awaitingCorrection}
                missed={play.missed}
              />
            )}
            {play.done && (
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void load(family)}
                >
                  Next hand
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {drill && play.done && (
        <>
        <AuctionExplained script={play.script} />
        <HandsReview hands={drill.hands}>
          <p className="muted small">
            Any seat opens if its hand is worth an opening, but only the side
            that opened keeps bidding — there is no competitive bidding in this
            tree yet. Leaf <code>{drill.leaf_id}</code>
            {drill.attempts > 1 ? ` · found in ${drill.attempts} deals` : ""}.
          </p>
        </HandsReview>
        </>
      )}

      {catalog && (
        <section className="panel">
          <button
            type="button"
            className="rules-toggle"
            onClick={() => setRulesOpen((o) => !o)}
          >
            {rulesOpen ? "Hide" : "Show"} house rules ({catalog.leaves.length}{" "}
            leaves)
          </button>
          {rulesOpen && (
            <pre className="house-rules">{catalog.house_rules}</pre>
          )}
        </section>
      )}
    </div>
  );
}
