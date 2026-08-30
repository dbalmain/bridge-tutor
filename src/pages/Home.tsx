import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { biddingCurriculum } from "../lib/biddingCurriculum";
import { getLessonProgress, loadProgress } from "../lib/progress";
import type { ProgressState } from "../lib/types";

export function Home() {
  const location = useLocation();
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  useEffect(() => {
    setProgress(loadProgress());
  }, [location.key]);

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
        <p className="eyebrow">ABF Standard 5-card majors</p>
        <h1>Learn the system, then the cards</h1>
        <p className="lede">
          A <Link to="/bid">bidding course</Link> in Joan Butts / ABF Standard
          five-card majors, then drills on the same tree. A full-hand play
          course will follow that tree — teach, then play — scored by DDS.
        </p>
        <p className="lede muted">
          Each bidding lesson: a short explanation, then live auctions you bid
          from the start. Miss a call and the explainer stays up until you bid
          the system call.
        </p>
        <div className="btn-row">
          {nextBid && (
            <Link className="btn btn--primary" to={`/bid/${nextBid.id}`}>
              Continue bidding · {nextBid.title}
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
            {biddingCurriculum.chapters.length} chapters,{" "}
            {biddingCurriculum.lessons.length} lessons. Teach
            the tree, then bid those auctions through.
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
            <span className="badge">soon</span>
          </div>
          <p>Same 5CM system, full deals.</p>
          <p className="muted small">
            After bidding is solid: scripted auctions on the tree, then you
            play the hand. DDS flags a card only when it costs a trick.
          </p>
        </article>
      </section>
    </div>
  );
}
