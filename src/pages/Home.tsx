import { Link, useLocation } from "react-router-dom";
import curriculum from "../data/curriculum.json";
import { biddingCurriculum } from "../lib/biddingCurriculum";
import { getLessonProgress, loadProgress } from "../lib/progress";
import type { Curriculum, ProgressState } from "../lib/types";
import { useEffect, useState } from "react";

const data = curriculum as Curriculum;

export function Home() {
  const location = useLocation();
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  useEffect(() => {
    setProgress(loadProgress());
  }, [location.key]);

  const nextPlay =
    data.lessons.find((l) => !getLessonProgress(progress, l.id).completed) ??
    data.lessons[0];
  const bidDone = biddingCurriculum.lessons.filter(
    (l) => getLessonProgress(progress, l.id).completed,
  ).length;
  const nextBid =
    biddingCurriculum.lessons.find(
      (l) => !getLessonProgress(progress, l.id).completed,
    ) ?? biddingCurriculum.lessons[0];

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">MVP · agile tutor</p>
        <h1>Learn bridge one concept at a time</h1>
        <p className="lede">
          Two tracks: a{" "}
          <Link to="/bid">bidding course</Link> in ABF Standard five-card
          majors, and a full-hand play course from{" "}
          <a href={data.meta.source} target="_blank" rel="noreferrer">
            Will Jenner-O&apos;Shea / Derrick Browne Beginners&apos; Bridge
          </a>
          .
        </p>
        <p className="lede muted">
          Bidding lessons: short explanation, then live tests. Miss a call and
          the explainer stays up until you bid the system call. Play lessons:
          bid and play the hand, scored by DDS.
        </p>
        <div className="btn-row">
          {nextBid && (
            <Link className="btn btn--primary" to={`/bid/${nextBid.id}`}>
              Continue bidding · {nextBid.title}
            </Link>
          )}
          {nextPlay && (
            <Link className="btn" to={`/play/${nextPlay.id}`}>
              Continue play · Hand {nextPlay.title}
            </Link>
          )}
          <Link className="btn" to="/drill">
            Bidding drills
          </Link>
        </div>
      </section>

      <section className="course-split">
        <article className="chapter-card">
          <div className="chapter-card__head">
            <h2>Bidding course</h2>
            <span className="badge">
              {bidDone}/{biddingCurriculum.lessons.length}
            </span>
          </div>
          <p>{biddingCurriculum.meta.system}.</p>
          <p className="muted small">
            Seven chapters, {biddingCurriculum.lessons.length} lessons. Teach
            the tree, then bid a few hands on that branch.
          </p>
          <div className="btn-row">
            <Link className="btn btn--primary" to="/bid">
              Open bidding course
            </Link>
          </div>
        </article>
        <article className="chapter-card">
          <div className="chapter-card__head">
            <h2>Play course</h2>
            <span className="badge">
              {
                data.lessons.filter(
                  (l) => getLessonProgress(progress, l.id).completed,
                ).length
              }
              /{data.lessons.length}
            </span>
          </div>
          <p>{data.meta.system}.</p>
          <p className="muted small">
            Jenner-O&apos;Shea beginners&apos; hands below. Bid the course
            line, then play; DDS flags cards that cost a trick.
          </p>
        </article>
      </section>

      <h2 className="course-heading">Play course</h2>
      <section className="chapter-list">
        {data.chapters.map((ch) => {
          const lessons = data.lessons.filter((l) => l.chapterId === ch.id);
          const done = lessons.filter(
            (l) => getLessonProgress(progress, l.id).completed,
          ).length;
          return (
            <article key={ch.id} className="chapter-card">
              <div className="chapter-card__head">
                <h2>
                  Chapter {ch.number}: {ch.title}
                </h2>
                <span className="badge">
                  {done}/{lessons.length}
                </span>
              </div>
              <p>{ch.summary}</p>
              <ul className="concept-list">
                {ch.concepts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="hand-links">
                {lessons.map((l) => {
                  const lp = getLessonProgress(progress, l.id);
                  return (
                    <Link
                      key={l.id}
                      to={`/play/${l.id}`}
                      className={
                        "hand-chip" +
                        (lp.optimal
                          ? " hand-chip--optimal"
                          : lp.completed
                            ? " hand-chip--done"
                            : "")
                      }
                    >
                      {l.title}
                      {lp.optimal ? " ★" : lp.completed ? " ✓" : ""}
                    </Link>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
