import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AuctionStrip } from "../components/AuctionStrip";
import { auctionLog } from "../lib/auction";
import { BidExplainer } from "../components/BidExplainer";
import { BiddingBox } from "../components/BiddingBox";
import { HandRow } from "../components/HandRow";
import {
  applyResult,
  fetchCatalog,
  nextDrill,
  randomSeed,
  type Catalog,
  type Drill,
} from "../lib/bridgeSystem";
import {
  loadSystemProgressJson,
  saveSystemProgressJson,
} from "../lib/systemProgress";

const FAMILIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Openings" },
  { id: "1nt", label: "1NT" },
  { id: "major", label: "1♥ / 1♠" },
  { id: "minor", label: "1♣ / 1♦" },
  { id: "rebid", label: "Rebids" },
];

export function DrillPage() {
  const [family, setFamily] = useState("all");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [chosen, setChosen] = useState<string | null>(null);
  const [awaitingCorrection, setAwaitingCorrection] = useState(false);
  const [missed, setMissed] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const loadGen = useRef(0);

  const load = useCallback(async (fam: string) => {
    const gen = (loadGen.current += 1);
    setBusy(true);
    setLoadError(null);
    setChosen(null);
    setAwaitingCorrection(false);
    setMissed(false);
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

  const log = useMemo(() => {
    if (!drill) return [];
    return auctionLog(drill.dealer, drill.auction);
  }, [drill]);

  async function onBid(bid: string) {
    if (!drill || busy) return;
    if (chosen && !awaitingCorrection) return;

    if (awaitingCorrection) {
      if (bid !== drill.expected) return;
      setAwaitingCorrection(false);
      return;
    }

    const correct = bid === drill.expected;
    setChosen(bid);
    if (!correct) {
      setAwaitingCorrection(true);
      setMissed(true);
    }
    try {
      const next = await applyResult(
        loadSystemProgressJson(),
        drill.leaf_id,
        correct,
      );
      saveSystemProgressJson(next);
    } catch (e) {
      console.error(e);
    }
  }

  const resolved = chosen != null && !awaitingCorrection;

  return (
    <div className="page drill-page">
      <p className="eyebrow">ABF Standard 5-card majors</p>
      <h1>Bidding drills</h1>
      <p className="lede">
        One decision at a time. Weak leaves come up more often; mastered ones
        still appear so they don&apos;t rot. A miss shows the explainer — bid
        the system call before the next hand. New to the system? Start with the{" "}
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
              <span className="muted small">{drill.title}</span>
            </div>
            <AuctionStrip
              dealer={drill.dealer}
              log={log}
              waiting={!resolved}
            />
            <HandRow
              cards={drill.hands.S}
              label="Your hand (South)"
              hcp={resolved ? drill.south_hcp : undefined}
              size="lg"
            />
            {resolved && (
              <p className="muted small">
                Shape {drill.south_shape} · {drill.south_hcp} HCP
                {drill.south_opening_points != null
                  ? ` · ${drill.south_opening_points} opening points`
                  : ""}
              </p>
            )}
          </section>

          <section className="panel">
            <BiddingBox
              enabled={!busy && (!chosen || awaitingCorrection)}
              onBid={(b) => void onBid(b)}
              auctionLog={log}
              seat="S"
              highlight={
                awaitingCorrection || resolved ? drill.expected : null
              }
            />
            {chosen && (
              <BidExplainer
                chosen={chosen}
                expected={drill.expected}
                explanation={drill.explanation}
                awaitingCorrection={awaitingCorrection}
                missed={missed}
              />
            )}
            {resolved && (
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

      {drill && resolved && (
        <section className="panel">
          <h2>The other hands</h2>
          <HandRow cards={drill.hands.N} label="North (partner)" size="sm" />
          <HandRow cards={drill.hands.E} label="East" size="sm" />
          <HandRow cards={drill.hands.W} label="West" size="sm" />
          <p className="muted small">
            Opponents are silent on these drills (uncontested tree). Leaf{" "}
            <code>{drill.leaf_id}</code>
            {drill.attempts > 1 ? ` · found in ${drill.attempts} deals` : ""}.
          </p>
        </section>
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
