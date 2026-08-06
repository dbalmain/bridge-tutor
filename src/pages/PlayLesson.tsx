import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import curriculum from "../data/curriculum.json";
import { BiddingBox } from "../components/BiddingBox";
import { CardView } from "../components/CardView";
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
  advanceAutoPlays,
  advanceTrick,
  initialEngine,
  startBidding,
  submitBid,
  submitCard,
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
import type { Card, Curriculum, Lesson, Mistake } from "../lib/types";

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

  const begin = () => {
    let s = startBidding(initialEngine(lesson));
    s = advanceAutoBids(lesson, s);
    if (s.phase === "play") {
      s = advanceAutoPlays(lesson, s);
    }
    setEngine(s);
    setStarted(true);
    const p = recordAttemptStart(loadProgress(), lesson.id);
    saveProgress(p);
  };

  const onBid = (bid: string) => {
    const prevMistakes = engine.mistakesThisRun;
    let s = submitBid(lesson, engine, bid);
    if (s.mistakesThisRun > prevMistakes && s.feedback?.expected) {
      persistMistake(
        "bidding",
        s.feedback.expected,
        bid,
        s.feedback.body,
      );
    }
    if (s.phase === "play") {
      s = advanceAutoPlays(lesson, s);
    }
    setEngine(s);
  };

  const onPlay = (card: Card) => {
    const prevMistakes = engine.mistakesThisRun;
    let s = submitCard(lesson, engine, card);
    if (s.mistakesThisRun > prevMistakes && s.feedback?.expected) {
      persistMistake("play", s.feedback.expected, card, s.feedback.body);
    }
    setEngine(s);
  };

  const onNextTrick = () => {
    setEngine(advanceTrick(lesson, engine));
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
    (engine.nextToPlay === "S" || engine.nextToPlay === "N");

  const activeSeat =
    engine.phase === "play" && !engine.awaitingTrickAdvance
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
            strong 1NT (15–17). Match the lesson line — wrong moves are logged;
            keep replaying until zero mistakes for ★ optimal.
          </p>
          {progress.completed && (
            <p className="badge-inline">
              Previously {progress.optimal ? "optimal ★" : "completed"} · best{" "}
              {progress.bestMistakes} mistake(s) · {progress.attempts} attempt(s)
            </p>
          )}
        </section>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={begin}>
            Start hand
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
                  onClick={onNextTrick}
                >
                  Next trick
                </button>
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

          {engine.feedback && (
            <section
              className={`panel feedback feedback--${engine.feedback.kind}`}
            >
              <h2>{engine.feedback.title}</h2>
              <p>{engine.feedback.body}</p>
              {engine.feedback.kind === "mistake" &&
                engine.feedback.expected && (
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
