import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AuctionStrip } from "../components/AuctionStrip";
import { auctionLog } from "../lib/auction";
import { BidExplainer } from "../components/BidExplainer";
import { BiddingBox } from "../components/BiddingBox";
import { HandRow } from "../components/HandRow";
import {
  applyResult,
  nextDrill,
  randomSeed,
  type Drill,
} from "../lib/bridgeSystem";
import {
  chapterOfBid,
  findBidLesson,
  nextBidLesson,
  type BidLesson as BidLessonSpec,
} from "../lib/biddingCurriculum";
import { guessTags } from "../lib/cards";
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
import type { Mistake } from "../lib/types";

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
  const [chosen, setChosen] = useState<string | null>(null);
  const [awaitingCorrection, setAwaitingCorrection] = useState(false);
  const [missedThisHand, setMissedThisHand] = useState(false);
  const [completed, setCompleted] = useState(false);
  const loadGen = useRef(0);

  const loadHand = useCallback(async () => {
    const gen = (loadGen.current += 1);
    setBusy(true);
    setLoadError(null);
    setChosen(null);
    setAwaitingCorrection(false);
    setMissedThisHand(false);
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

  const persistMistake = (expected: string, actual: string, teaching: string) => {
    const m: Mistake = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      lessonId: lesson.id,
      chapterId: lesson.chapterId,
      phase: "bidding",
      expected,
      actual,
      context: `Bidding lesson ${lesson.title} · ${drill?.title ?? ""}`,
      teaching,
      tags: guessTags("bidding", expected, teaching),
    };
    saveProgress(recordMistake(loadProgress(), m));
  };

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
      setMissedThisHand(true);
      setMistakesThisRun((n) => n + 1);
      persistMistake(drill.expected, bid, drill.explanation);
    }
    try {
      const nextProgress = await applyResult(
        loadSystemProgressJson(),
        drill.leaf_id,
        correct,
      );
      saveSystemProgressJson(nextProgress);
    } catch (e) {
      console.error(e);
    }
  }

  function finishRun(totalMistakes: number) {
    setCompleted(true);
    saveProgress(
      recordLessonComplete(loadProgress(), lesson.id, totalMistakes),
    );
  }

  function nextHand() {
    if (awaitingCorrection) return;
    const upcoming = handIndex + 1;
    if (upcoming >= lesson.quizCount) {
      finishRun(mistakesThisRun);
      return;
    }
    setHandIndex(upcoming);
    void loadHand();
  }

  const log = useMemo(() => {
    if (!drill) return [];
    return auctionLog(drill.dealer, drill.auction);
  }, [drill]);

  const progress = getLessonProgress(loadProgress(), lesson.id);
  const resolved = chosen != null && !awaitingCorrection;

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
            {lesson.quizCount} live hands from this branch. A miss shows the
            explainer and you rebid the system call before moving on. Replay
            for ★ with zero misses.
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
              <span className="muted small">{drill.title}</span>
            </div>
            <p className="muted small bid-lesson-tip">{lesson.tip}</p>
            <AuctionStrip
              dealer={drill.dealer}
              log={log}
              waiting={!resolved}
            />
            <HandRow
              cards={drill.hands.S}
              label="Your hand (South)"
              hcp={drill.south_hcp}
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
            {chosen && drill && (
              <BidExplainer
                chosen={chosen}
                expected={drill.expected}
                explanation={drill.explanation}
                awaitingCorrection={awaitingCorrection}
                missed={missedThisHand}
              />
            )}
            {resolved && !completed && (
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

      {resolved && drill && (
        <section className="panel">
          <h2>The other hands</h2>
          <HandRow cards={drill.hands.N} label="North (partner)" size="sm" />
          <HandRow cards={drill.hands.E} label="East" size="sm" />
          <HandRow cards={drill.hands.W} label="West" size="sm" />
        </section>
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
