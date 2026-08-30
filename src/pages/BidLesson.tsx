import { useCallback, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  nextDrill,
  randomSeed,
  type Drill,
} from "../lib/bridgeSystem";
import {
  chapterOfBid,
  findBidLesson,
  lessonStudentBids,
  nextBidLesson,
  type BidLesson as BidLessonSpec,
} from "../lib/biddingCurriculum";
import { bidDisplay, guessTags } from "../lib/cards";
import {
  getLessonProgress,
  loadProgress,
  recordAttemptStart,
  recordLessonComplete,
  recordMistake,
  saveProgress,
} from "../lib/progress";
import {
  loadSystemProgressJson,
  saveSystemProgressJson,
} from "../lib/systemProgress";
import { useBidPlaythrough } from "../lib/useBidPlaythrough";
import type { Mistake } from "../lib/types";

const SEAT_NAME = { N: "North", E: "East", S: "South", W: "West" } as const;

export function BidLesson() {
  const { lessonId } = useParams();
  const lesson = findBidLesson(lessonId);
  if (!lesson) {
    return (
      <div className="page">
        <h1>Lesson not found</h1>
        <Link to="/bid">Back to bidding course</Link>
      </div>
    );
  }
  return <BidLessonInner key={lesson.id} lesson={lesson} />;
}

function BidLessonInner({ lesson }: { lesson: BidLessonSpec }) {
  const chapter = chapterOfBid(lesson)!;
  const next = nextBidLesson(lesson);
  const [started, setStarted] = useState(false);
  const [handIndex, setHandIndex] = useState(0);
  const [mistakesThisRun, setMistakesThisRun] = useState(0);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const loadGen = useRef(0);
  const maxStudentBids = lessonStudentBids(lesson);

  const loadHand = useCallback(async () => {
    const gen = (loadGen.current += 1);
    setBusy(true);
    setLoadError(null);
    setDrill(null);
    try {
      const d = await nextDrill(
        loadSystemProgressJson(),
        "all",
        randomSeed(),
        lesson.leaves,
      );
      if (loadGen.current !== gen) return;
      setDrill(d);
    } catch (e) {
      if (loadGen.current !== gen) return;
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (loadGen.current === gen) setBusy(false);
    }
  }, [lesson.leaves]);

  const begin = () => {
    const p = recordAttemptStart(loadProgress(), lesson.id);
    saveProgress(p);
    setStarted(true);
    setHandIndex(0);
    setMistakesThisRun(0);
    setCompleted(false);
    void loadHand();
  };

  const persistMistake = (
    expected: string,
    actual: string,
    teaching: string,
    title: string,
  ) => {
    const m: Mistake = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      lessonId: lesson.id,
      chapterId: lesson.chapterId,
      phase: "bidding",
      expected,
      actual,
      context: `Bidding lesson ${lesson.title} · ${title}`,
      teaching,
      tags: guessTags("bidding", expected, teaching),
    };
    saveProgress(recordMistake(loadProgress(), m));
  };

  const play = useBidPlaythrough(drill, {
    maxStudentBids,
    onDecision: (d) => {
      if (!d.correct) {
        setMistakesThisRun((n) => n + 1);
        persistMistake(d.expected, d.chosen, d.explanation, d.title);
      }
      void applyResult(loadSystemProgressJson(), d.leafId, d.correct)
        .then(saveSystemProgressJson)
        .catch((e) => console.error(e));
    },
  });

  function finishRun(totalMistakes: number) {
    setCompleted(true);
    saveProgress(
      recordLessonComplete(loadProgress(), lesson.id, totalMistakes),
    );
  }

  function nextHand() {
    if (!play.done) return;
    const upcoming = handIndex + 1;
    if (upcoming >= lesson.quizCount) {
      finishRun(mistakesThisRun);
      return;
    }
    setHandIndex(upcoming);
    void loadHand();
  }

  const log = play.revealed.map((s) => ({ seat: s.seat, bid: s.bid }));
  // Counting the hand is the lesson, so the count stays hidden until the
  // auction is over or a miss has already given the answer away.
  const showPoints = play.done || play.missedAny;
  const progress = getLessonProgress(loadProgress(), lesson.id);

  if (!started) {
    return (
      <div className="page play-page">
        <div className="breadcrumb">
          <Link to="/bid">Bidding course</Link>
          <span>·</span>
          <span>
            Ch {chapter.number}: {chapter.title}
          </span>
        </div>
        <h1>
          Lesson {lesson.lessonNumber}: {lesson.title}
        </h1>
        <section className="panel concept-panel">
          <h2>Concept</h2>
          <div className="lesson-meta">
            {lesson.newHere && (
              <div className="lesson-meta__block">
                <h3>New in this lesson</h3>
                <p className="lesson-meta__new">{lesson.newHere}</p>
              </div>
            )}
            {lesson.revisits && lesson.revisits.length > 0 && (
              <div className="lesson-meta__block">
                <h3>Builds on — go back if any of this is hazy</h3>
                <div className="lesson-meta__links">
                  {lesson.revisits.map((r) => (
                    <Link
                      key={r.lessonId}
                      className="hand-chip"
                      to={`/bid/${r.lessonId}`}
                    >
                      Lesson {r.lessonNumber} · {r.what}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
          {lesson.teaching.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <ul className="concept-list">
            {lesson.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>Then a few tests</h2>
          <p>{lesson.tip}</p>
          <p className="muted small">
            {lesson.quizCount} live hands. You bid from the start of each
            auction. Every seat bids the system, so if an opponent holds an
            opening hand they will open — but only the side that opened keeps
            bidding, because this course does not teach competitive bidding
            yet.
            {maxStudentBids === 1
              ? " This lesson stops after your first call — then you watch the rest."
              : " Bid every South call through to the end."}{" "}
            A miss shows the explainer; bid the system call before the auction
            continues. Replay for ★ with zero misses.
          </p>
          <p className="muted small">
            Your point count stays hidden until the auction is over — counting
            the hand is the exercise. A miss reveals it early, along with the
            full working. When the hand finishes you get every call in the
            auction explained, with your own calls highlighted so you can read
            just those and leave partner&apos;s and the opponents&apos; for
            when you are ready.
          </p>
          {progress.completed && (
            <p className="badge-inline">
              Previously {progress.optimal ? "optimal ★" : "completed"} · best{" "}
              {progress.bestMistakes} miss(es) · {progress.attempts} attempt(s)
            </p>
          )}
        </section>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={begin}>
            Start tests
          </button>
          <Link className="btn" to="/bid">
            All lessons
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page play-page">
      <div className="play-header">
        <div>
          <div className="breadcrumb">
            <Link to="/bid">Bidding course</Link>
            <span>·</span>
            <span>
              Lesson {lesson.lessonNumber}: {lesson.title}
            </span>
          </div>
          <h1 className="play-title">
            Hand {Math.min(handIndex + 1, lesson.quizCount)} of {lesson.quizCount}
            <span className="muted small">
              {" "}
              · misses this run: {mistakesThisRun}
            </span>
          </h1>
        </div>
        <div className="play-header__actions">
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              loadGen.current += 1;
              setStarted(false);
              setDrill(null);
              setCompleted(false);
            }}
          >
            Restart
          </button>
        </div>
      </div>

      {loadError && (
        <section className="panel feedback--mistake">
          <h2>Could not deal a hand</h2>
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
            <p className="muted small bid-lesson-tip">{lesson.tip}</p>
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
                const ctx = pointContextFor(drill.family, drill.leaf_id);
                return (
                  <PointsBreakdown
                    cards={drill.hands.S}
                    context={ctx.context}
                    trump={ctx.trump}
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
            {play.done && !completed && (
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={nextHand}
                >
                  {handIndex + 1 >= lesson.quizCount
                    ? "Finish lesson"
                    : "Next hand"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {play.done && drill && (
        <>
          <AuctionExplained script={play.script} />
          <HandsReview hands={drill.hands} />
        </>
      )}

      {completed && (
        <section className="panel">
          <h2>
            {mistakesThisRun === 0
              ? "Clean run ★"
              : `Lesson complete · ${mistakesThisRun} miss(es)`}
          </h2>
          <p>
            {mistakesThisRun === 0
              ? "Every test matched the system. Replay for another clean set, or go on."
              : "Replay for ★ with zero misses, or continue and let drills keep those leaves warm."}
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                loadGen.current += 1;
                setStarted(false);
                setDrill(null);
                setCompleted(false);
              }}
            >
              Replay lesson
            </button>
            {next && (
              <Link className="btn" to={`/bid/${next.id}`}>
                Next · {next.title}
              </Link>
            )}
            <Link className="btn" to="/bid">
              All lessons
            </Link>
            <Link className="btn" to="/drill">
              Free practice
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
