import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drillScript, type Drill, type ScriptCall } from "./bridgeSystem";

export interface BidDecision {
  leafId: string;
  title: string;
  explanation: string;
  expected: string;
  chosen: string;
  correct: boolean;
}

const NS_AUTO_MS = 280;

function isInteractive(
  script: ScriptCall[],
  index: number,
  maxStudentBids: number,
): boolean {
  const step = script[index];
  if (!step?.student) return false;
  const prior = script.slice(0, index).filter((s) => s.student).length;
  return prior < maxStudentBids;
}

export function useBidPlaythrough(
  drill: Drill | null,
  options: {
    maxStudentBids?: number;
    onDecision?: (d: BidDecision) => void;
  } = {},
) {
  const maxStudentBids = options.maxStudentBids ?? Number.POSITIVE_INFINITY;
  const onDecisionRef = useRef(options.onDecision);
  onDecisionRef.current = options.onDecision;

  const script = useMemo(() => (drill ? drillScript(drill) : []), [drill]);
  const [shown, setShown] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [awaitingCorrection, setAwaitingCorrection] = useState(false);
  const [missed, setMissed] = useState(false);
  const [missedAny, setMissedAny] = useState(false);
  const gradedIndex = useRef(-1);

  useEffect(() => {
    setShown(0);
    setChosen(null);
    setAwaitingCorrection(false);
    setMissed(false);
    setMissedAny(false);
    gradedIndex.current = -1;
  }, [drill]);

  const pending = shown < script.length ? script[shown] : undefined;
  const waitingForStudent =
    pending != null && isInteractive(script, shown, maxStudentBids);

  useEffect(() => {
    if (
      waitingForStudent &&
      !awaitingCorrection &&
      gradedIndex.current !== shown
    ) {
      setChosen(null);
      setMissed(false);
    }
  }, [waitingForStudent, awaitingCorrection, shown]);

  useEffect(() => {
    if (!drill || awaitingCorrection || waitingForStudent) return;
    if (shown >= script.length) return;
    const step = script[shown];
    const delay = step.seat === "N" || step.seat === "S" ? NS_AUTO_MS : 0;
    const t = window.setTimeout(() => setShown((n) => n + 1), delay);
    return () => window.clearTimeout(t);
  }, [drill, shown, script, awaitingCorrection, waitingForStudent]);

  const onBid = useCallback(
    (bid: string) => {
      if (!pending) return;
      if (awaitingCorrection) {
        if (bid !== pending.bid) return;
        setAwaitingCorrection(false);
        setShown((n) => n + 1);
        return;
      }
      if (!waitingForStudent) return;
      const correct = bid === pending.bid;
      setChosen(bid);
      gradedIndex.current = shown;
      if (!correct) {
        setAwaitingCorrection(true);
        setMissed(true);
        setMissedAny(true);
      } else {
        setMissed(false);
        setShown((n) => n + 1);
      }
      if (pending.leaf_id) {
        onDecisionRef.current?.({
          leafId: pending.leaf_id,
          title: pending.title,
          explanation: pending.explanation,
          expected: pending.bid,
          chosen: bid,
          correct,
        });
      }
    },
    [pending, awaitingCorrection, waitingForStudent, shown],
  );

  const revealed = script.slice(0, shown);
  const done =
    script.length > 0 && shown >= script.length && !awaitingCorrection;
  const graded =
    gradedIndex.current >= 0 ? script[gradedIndex.current] : undefined;
  const highlight = awaitingCorrection
    ? (pending?.bid ?? null)
    : chosen && graded
      ? graded.bid
      : null;
  const lastAuto = [...revealed].reverse().find((s, revI) => {
    const i = revealed.length - 1 - revI;
    if (s.seat === "E" || s.seat === "W") return false;
    return !isInteractive(script, i, maxStudentBids);
  });

  return {
    script,
    revealed,
    pending,
    waitingForStudent: waitingForStudent && !awaitingCorrection,
    awaitingCorrection,
    done,
    chosen,
    missed,
    /** Sticky for the whole hand: any call missed, even after correcting. */
    missedAny,
    expected: (awaitingCorrection ? pending?.bid : graded?.bid) ?? "",
    explanation:
      (awaitingCorrection ? pending?.explanation : graded?.explanation) ?? "",
    highlight,
    lastAuto,
    onBid,
    boxEnabled:
      (waitingForStudent && !awaitingCorrection) || awaitingCorrection,
  };
}
