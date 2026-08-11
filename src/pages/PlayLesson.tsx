import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import curriculum from "../data/curriculum.json";
import { BiddingBox } from "../components/BiddingBox";
import { CardView } from "../components/CardView";
import { CommentaryLog } from "../components/CommentaryLog";
import { HandRow } from "../components/HandRow";
import {
  bidDisplay,
  cardLabel,
  cardSuit,
  hcp,
  legalCards,
  SEAT_LABEL,
  sortHand,
} from "../lib/cards";
import {
  advanceAutoBids,
  advanceAutoPlaysDds,
  advanceTrickDds,
  initialEngine,
  startBidding,
  submitBid,
  submitCardDds,
  type EngineState,
} from "../lib/engine";
import {
  getLessonProgress,
  loadProgress,
  recordAttemptStart,
  recordLessonComplete,
  recordMistake,
  saveProgress,
} from "../lib/progress";
import { guessTags } from "../lib/cards";
import { useSolCoach } from "../lib/useSolCoach";
import type {
  Card,
  CommentaryEntry,
  Curriculum,
  Lesson,
  Mistake,
} from "../lib/types";

const data = curriculum as Curriculum;

function findLesson(id: string | undefined): Lesson | undefined {
  return data.lessons.find((l) => l.id === id);
}

function chapterOf(lesson: Lesson) {
  return data.chapters.find((c) => c.id === lesson.chapterId);
}

export function PlayLesson() {
  const { lessonId } = useParams();
  const lesson = findLesson(lessonId);

  if (!lesson) {
    return (
      <div className="page">
        <h1>Lesson not found</h1>
        <Link to="/">Back</Link>
      </div>
    );
  }

  return <PlayLessonInner key={lesson.id} lesson={lesson} />;
}

function PlayLessonInner({ lesson }: { lesson: Lesson }) {
  const chapter = chapterOf(lesson)!;
  const [engine, setEngine] = useState<EngineState>(() =>
    initialEngine(lesson),
  );
  const [showAllHands, setShowAllHands] = useState(false);
  const [started, setStarted] = useState(false);
  const coach = useSolCoach({ id: lesson.id, chapterId: lesson.chapterId });
  /** How many engine commentary lines we have already fed to Sol as context. */
  const fedCommentaryRef = useRef(0);
  /** Unified log: engine + Sol/user in arrival order (mistakes then Sol’s reply). */
  const [timeline, setTimeline] = useState<CommentaryEntry[]>([]);
  const engineTimelineRef = useRef(0);
  const coachTimelineRef = useRef(0);

  useEffect(() => {
    if (engine.commentary.length <= engineTimelineRef.current) return;
    const neu = engine.commentary.slice(engineTimelineRef.current);
    engineTimelineRef.current = engine.commentary.length;
    setTimeline((t) => [...t, ...neu]);
  }, [engine.commentary]);

  useEffect(() => {
    if (coach.entries.length <= coachTimelineRef.current) return;
    const neu = coach.entries.slice(coachTimelineRef.current);
    coachTimelineRef.current = coach.entries.length;
    setTimeline((t) => [...t, ...neu]);
  }, [coach.entries]);

  const resetTimeline = useCallback(() => {
    engineTimelineRef.current = 0;
    coachTimelineRef.current = 0;
    fedCommentaryRef.current = 0;
    setTimeline([]);
  }, []);

  const persistMistake = useCallback(
    (phase: "bidding" | "play", expected: string, actual: string, teaching?: string) => {
      const m: Mistake = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        lessonId: lesson.id,
        chapterId: lesson.chapterId,
        phase,
        expected,
        actual,
        context: `Hand ${lesson.title} · ${lesson.contract ?? "?"}`,
        teaching,
        tags: guessTags(phase, expected, teaching),
      };
      const next = recordMistake(loadProgress(), m);
      saveProgress(next);
    },
    [lesson],
  );

  const feedCoachMoves = useCallback(
    (s: EngineState, fromIndex: number) => {
      const slice = s.commentary.slice(fromIndex);
      for (const e of slice) {
        // Mistakes get a dedicated Sol turn; skip the short engine line here.
        if (e.kind === "mistake") continue;
        void coach.noteMove(e.text);
      }
      fedCommentaryRef.current = s.commentary.length;
    },
    [coach],
  );

  const [busy, setBusy] = useState(false);

  const begin = async () => {
    setBusy(true);
    try {
      coach.stop();
      resetTimeline();
      let s = startBidding(initialEngine(lesson));
      s = advanceAutoBids(lesson, s);
      if (s.phase === "play") {
        s = await advanceAutoPlaysDds(lesson, s);
      }
      setEngine(s);
      setStarted(true);
      const p = recordAttemptStart(loadProgress(), lesson.id);
      saveProgress(p);
      void coach.start({
        id: lesson.id,
        title: lesson.title,
        chapterId: lesson.chapterId,
        chapterNumber: lesson.chapterNumber,
        handNumber: lesson.handNumber,
        dealer: lesson.dealer,
        vulnerability: lesson.vulnerability,
        tip: lesson.tip,
        contract: lesson.contract,
        declarer: lesson.declarer,
        hands: lesson.hands,
      });
      feedCoachMoves(s, 0);
    } finally {
      setBusy(false);
    }
  };

  const onBid = async (bid: string) => {
    const prevMistakes = engine.mistakesThisRun;
    const fedFrom = fedCommentaryRef.current;
    setBusy(true);
    try {
      let s = submitBid(lesson, engine, bid);
      if (s.mistakesThisRun > prevMistakes && s.feedback?.expected) {
        persistMistake(
          "bidding",
          s.feedback.expected,
          bid,
          s.feedback.body,
        );
        void coach.explainMistake({
          phase: "bidding",
          actual: bid,
          expected: s.feedback.expected,
          teaching: s.feedback.body,
          context: `Hand ${lesson.title} · auction so far: ${s.auctionLog
            .map((a) => `${a.seat}:${a.bid}`)
            .join(" ")}`,
        });
        fedCommentaryRef.current = s.commentary.length;
      } else {
        if (s.phase === "play") {
          s = await advanceAutoPlaysDds(lesson, s);
        }
        feedCoachMoves(s, fedFrom);
      }
      setEngine(s);
    } finally {
      setBusy(false);
    }
  };

  const onPlay = async (card: Card) => {
    if (busy) return;
    const prevMistakes = engine.mistakesThisRun;
    const fedFrom = fedCommentaryRef.current;
    setBusy(true);
    try {
      const s = await submitCardDds(lesson, engine, card);
      if (s.mistakesThisRun > prevMistakes) {
        persistMistake(
          "play",
          s.feedback?.expected ?? "best",
          card,
          s.feedback?.body,
        );
        void coach.explainMistake({
          phase: "play",
          actual: card,
          expected: s.feedback?.expected ?? "best",
          teaching: s.feedback?.body,
          context: `Hand ${lesson.title} · ${lesson.contract ?? "?"} · tricks NS ${s.nsTricks} EW ${s.ewTricks}`,
        });
        fedCommentaryRef.current = s.commentary.length;
      } else {
        feedCoachMoves(s, fedFrom);
      }
      setEngine(s);
    } finally {
      setBusy(false);
    }
  };

  const onNextTrick = async () => {
    if (busy) return;
    const fedFrom = fedCommentaryRef.current;
    setBusy(true);
    try {
      const s = await advanceTrickDds(lesson, engine);
      feedCoachMoves(s, fedFrom);
      setEngine(s);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (engine.phase !== "complete") return;
    const p = recordLessonComplete(
      loadProgress(),
      lesson.id,
      engine.mistakesThisRun,
    );
    saveProgress(p);
  }, [engine.phase, engine.mistakesThisRun, lesson.id]);

  const yourTurnBid =
    engine.phase === "bidding" &&
    lesson.auction[engine.bidIndex]?.seat === "S";

  const yourTurnPlay =
    engine.phase === "play" &&
    !engine.awaitingTrickAdvance &&
    !busy &&
    (engine.nextToPlay === "S" || engine.nextToPlay === "N");

  const activeSeat =
    engine.phase === "play" && !engine.awaitingTrickAdvance && !busy
      ? engine.nextToPlay
      : null;
  const ledSuit =
    engine.currentTrick.length > 0
      ? cardSuit(engine.currentTrick[0])
      : null;

  const southLegal =
    activeSeat === "S"
      ? legalCards(engine.hands.S, ledSuit)
      : null;
  const northLegal =
    activeSeat === "N"
      ? legalCards(engine.hands.N, ledSuit)
      : null;

  const progress = getLessonProgress(loadProgress(), lesson.id);

  const nextLesson = data.lessons.find(
    (l) =>
      l.chapterNumber > lesson.chapterNumber ||
      (l.chapterNumber === lesson.chapterNumber &&
        l.handNumber > lesson.handNumber),
  );

  // Intro screen
  if (!started || engine.phase === "intro") {
    return (
      <div className="page play-page">
        <div className="breadcrumb">
          <Link to="/">Lessons</Link>
          <span>·</span>
          <span>
            Ch {chapter.number}: {chapter.title}
          </span>
        </div>
        <h1>
          Hand {lesson.title}: {chapter.title}
        </h1>
        <section className="panel concept-panel">
          <h2>Concept</h2>
          <p>{chapter.summary}</p>
          <ul className="concept-list">
            {chapter.concepts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>This hand</h2>
          <p>{lesson.tip}</p>
          <p className="muted small">
            Dealer {lesson.dealer} · You sit South · System: 5-card majors,
            strong 1NT (15–17). Bidding follows the lesson. Card play is scored
            by double dummy (DDS): only flagged if a card costs ≥1 trick versus
            optimal. Replay for ★ with zero significant errors.
          </p>
          {progress.completed && (
            <p className="badge-inline">
              Previously {progress.optimal ? "optimal ★" : "completed"} · best{" "}
              {progress.bestMistakes} mistake(s) · {progress.attempts} attempt(s)
            </p>
          )}
        </section>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void begin()}
            disabled={busy}
          >
            {busy ? "Loading engine…" : "Start hand"}
          </button>
          <a
            className="btn"
            href={lesson.external?.tutorialLin}
            target="_blank"
            rel="noreferrer"
          >
            Course tutorial (BBO)
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="page play-page">
      <div className="play-header">
        <div>
          <div className="breadcrumb">
            <Link to="/">Lessons</Link>
            <span>·</span>
            <span>
              Hand {lesson.title}
            </span>
          </div>
          <h1 className="play-title">
            {lesson.contract
              ? `${lesson.contract} by ${lesson.declarer}`
              : "Auction"}
            <span className="muted small">
              {" "}
              · mistakes this run: {engine.mistakesThisRun}
            </span>
          </h1>
        </div>
        <div className="play-header__actions">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showAllHands}
              onChange={(e) => setShowAllHands(e.target.checked)}
            />
            Show all hands
          </label>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              coach.stop();
              resetTimeline();
              setEngine(initialEngine(lesson));
              setStarted(false);
            }}
          >
            Restart
          </button>
        </div>
      </div>

      <div className="table-layout">
        <div className="felt">
          <div className="seat seat--n">
            <HandRow
              label={SEAT_LABEL.N}
              hcp={hcp(lesson.hands.N)}
              cards={engine.hands.N}
              faceDown={
                !showAllHands &&
                engine.phase === "bidding"
              }
              selectable={activeSeat === "N"}
              legal={northLegal}
              onPlay={onPlay}
              size="sm"
            />
          </div>
          <div className="seat-mid">
            <div className="seat seat--w">
              <HandRow
                label="West"
                cards={engine.hands.W}
                faceDown={!showAllHands}
                size="sm"
              />
            </div>
            <div className="trick-area">
              {engine.phase === "play" &&
                engine.currentTrick.length === 0 &&
                !engine.awaitingTrickAdvance && (
                  <p className="muted small">
                    {activeSeat
                      ? `${SEAT_LABEL[activeSeat] ?? activeSeat} to play`
                      : "—"}
                  </p>
                )}
              {engine.awaitingTrickAdvance && engine.lastTrickWinner && (
                <p className="trick-winner-label">
                  {engine.lastTrickWinner === "S"
                    ? "You"
                    : engine.lastTrickWinner === "N"
                      ? "Dummy"
                      : engine.lastTrickWinner === "W"
                        ? "West"
                        : "East"}{" "}
                  wins
                </p>
              )}
              <div
                className={
                  "trick-cards" +
                  (engine.awaitingTrickAdvance ? " trick-cards--complete" : "")
                }
              >
                {engine.currentTrick.map((c, i) => (
                  <CardView key={`${c}-${i}`} card={c} size="md" />
                ))}
              </div>
              <div className="trick-score">
                NS {engine.nsTricks} · EW {engine.ewTricks}
              </div>
              {engine.awaitingTrickAdvance && (
                <button
                  type="button"
                  className="btn btn--primary btn--small trick-next-btn"
                  onClick={() => void onNextTrick()}
                  disabled={busy}
                >
                  {busy ? "Thinking…" : "Next trick"}
                </button>
              )}
              {busy && engine.phase === "play" && !engine.awaitingTrickAdvance && (
                <p className="muted small">DDS thinking…</p>
              )}
            </div>
            <div className="seat seat--e">
              <HandRow
                label="East"
                cards={engine.hands.E}
                faceDown={!showAllHands}
                size="sm"
              />
            </div>
          </div>
          <div className="seat seat--s">
            <HandRow
              label={`${SEAT_LABEL.S}`}
              hcp={hcp(lesson.hands.S)}
              cards={engine.hands.S}
              selectable={activeSeat === "S"}
              legal={southLegal}
              onPlay={onPlay}
              size="md"
            />
          </div>
        </div>

        <aside className="side-panel">
          <section className="panel">
            <h2>Auction</h2>
            <AuctionGrid
              dealer={lesson.dealer}
              log={engine.auctionLog}
            />
            {yourTurnBid && (
              <BiddingBox
                enabled
                onBid={onBid}
                auctionLog={engine.auctionLog}
                highlight={
                  engine.awaitingCorrection ? engine.lastExpected : null
                }
              />
            )}
            {engine.phase === "bidding" && !yourTurnBid && (
              <p className="muted small">Waiting for other seats…</p>
            )}
          </section>

          <section className="panel commentary-panel">
            <h2>Commentary</h2>
            {coach.status === "unavailable" && (
              <p className="coach-status coach-status--error">
                {coach.error ?? "Sol coach unavailable."}
              </p>
            )}
            {coach.status === "error" && coach.error && (
              <p className="coach-status coach-status--error">{coach.error}</p>
            )}
            {(coach.status === "starting" || coach.status === "ready") && (
              <p className="coach-status">
                {coach.status === "starting"
                  ? "Sol is joining this hand…"
                  : "Sol is coaching · ask anything below"}
              </p>
            )}
            <CommentaryLog
              entries={timeline}
              thinkingLabel={coach.thinkingLabel}
              onSendChat={
                coach.sessionActive
                  ? (msg) => {
                      void coach.chat(msg);
                    }
                  : undefined
              }
              chatDisabled={
                coach.status === "starting" ||
                coach.status === "unavailable" ||
                coach.status === "idle"
              }
              chatPlaceholder={
                coach.status === "unavailable"
                  ? "Start npm run dev (with coach) to chat with Sol"
                  : "Ask Sol about this hand…"
              }
            />
          </section>

          {engine.feedback && engine.feedback.kind === "mistake" && (
            <section
              className={`panel feedback feedback--${engine.feedback.kind}`}
            >
              <h2>{engine.feedback.title}</h2>
              <p>{engine.feedback.body}</p>
              {engine.feedback.expected && (
                <p className="hint">
                  Try:{" "}
                  <strong>
                    {engine.phase === "play"
                      ? cardLabel(engine.feedback.expected)
                      : bidDisplay(engine.feedback.expected)}
                  </strong>
                </p>
              )}
            </section>
          )}

          {engine.phase === "complete" && (
            <section className="panel">
              <h2>Next</h2>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    coach.stop();
                    resetTimeline();
                    setEngine(initialEngine(lesson));
                    setStarted(false);
                  }}
                >
                  Replay hand
                </button>
                {nextLesson && (
                  <Link className="btn" to={`/play/${nextLesson.id}`}>
                    Next hand {nextLesson.title}
                  </Link>
                )}
                <Link className="btn" to="/progress">
                  View progress
                </Link>
              </div>
            </section>
          )}

          {yourTurnPlay && engine.awaitingCorrection && engine.lastExpected && (
            <p className="muted small">
              Click the recommended card:{" "}
              {cardLabel(engine.lastExpected)}
              {activeSeat === "N" ? " (from dummy)" : ""}.
            </p>
          )}
        </aside>
      </div>

      {showAllHands && (
        <details className="panel">
          <summary>Debug · remaining cards sorted</summary>
          {(["N", "E", "S", "W"] as const).map((seat) => (
            <div key={seat}>
              {seat}: {sortHand(engine.hands[seat]).join(" ")}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function AuctionGrid({
  dealer,
  log,
}: {
  dealer: string;
  log: { seat: string; bid: string }[];
}) {
  const order = ["W", "N", "E", "S"] as const; // display like many UIs
  // Build rows of 4 starting from dealer
  const seatsCycle = ["S", "W", "N", "E"] as const;
  const start = seatsCycle.indexOf(dealer as (typeof seatsCycle)[number]);
  const sequence = log.map((entry, i) => ({
    ...entry,
    // seat already on entry
    i,
  }));

  return (
    <div className="auction">
      <div className="auction__head">
        {order.map((s) => (
          <div key={s}>{s}</div>
        ))}
      </div>
      <div className="auction__body">
        {/* pad until dealer column in display order W N E S */}
        {(() => {
          const displayOrder = ["W", "N", "E", "S"];
          const cells: ReactNode[] = [];
          // empty cells before first bid's seat in display grid
          if (sequence.length === 0) {
            const dealerDisplayIdx = displayOrder.indexOf(dealer);
            for (let i = 0; i < dealerDisplayIdx; i++) {
              cells.push(<div key={`pad-${i}`} className="auction__cell" />);
            }
            cells.push(
              <div key="wait" className="auction__cell muted">
                …
              </div>,
            );
            return cells;
          }
          let col = displayOrder.indexOf(sequence[0].seat);
          for (let i = 0; i < col; i++) {
            cells.push(<div key={`pad-${i}`} className="auction__cell" />);
          }
          for (const entry of sequence) {
            cells.push(
              <div key={`${entry.i}-${entry.bid}`} className="auction__cell">
                {bidDisplay(entry.bid)}
              </div>,
            );
          }
          void start;
          return cells;
        })()}
      </div>
    </div>
  );
}
