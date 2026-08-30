import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  biddingCurriculum,
  type BidChapter,
  type BidLesson,
} from "../lib/biddingCurriculum";
import { getLessonProgress, loadProgress } from "../lib/progress";
import type { ProgressState } from "../lib/types";

export function BidCourse() {
  const location = useLocation();
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  useEffect(() => {
    setProgress(loadProgress());
  }, [location.key]);

  const nextLesson =
    biddingCurriculum.lessons.find(
      (l) => !getLessonProgress(progress, l.id).completed,
    ) ?? biddingCurriculum.lessons[0];

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">ABF Standard 5-card majors</p>
        <h1>Bidding course</h1>
        <p className="lede">{biddingCurriculum.meta.system}.</p>
        <p className="lede muted">
          Each lesson: a short explanation, then live hands you bid from the
          start. Every seat bids the system, so an opponent with an opening
          hand opens — though only the side that opened keeps bidding, since
          competitive bidding is not taught here yet. Opening lessons stop
          after your first call and play out the rest; later lessons you bid
          through to the end. Miss a call and the explainer stays up until you
          bid the right one. After the course, drills keep sampling the leaves
          you miss.
        </p>
        <p className="lede muted">
          Every lesson says what it adds and links back to the lessons its
          rules came from, so nothing is assumed and nothing is used before it
          is taught. While you are bidding, your point count is hidden —
          counting the hand is half the exercise — and once the auction ends you
          get the full working plus every call explained, yours highlighted, so
          you can read your own calls first and the rest of the table when you
          want it.
        </p>
        <div className="btn-row">
          {nextLesson && (
            <Link className="btn btn--primary" to={`/bid/${nextLesson.id}`}>
              Continue · {nextLesson.title}
            </Link>
          )}
          <Link className="btn" to="/drill">
            Free practice
          </Link>
        </div>
      </section>

      <section className="chapter-list">
        {biddingCurriculum.chapters.map((ch) => (
          <ChapterCard key={ch.id} chapter={ch} progress={progress} />
        ))}
      </section>
    </div>
  );
}

function ChapterCard({
  chapter,
  progress,
}: {
  chapter: BidChapter;
  progress: ProgressState;
}) {
  const lessons = biddingCurriculum.lessons.filter(
    (l) => l.chapterId === chapter.id,
  );
  const done = lessons.filter(
    (l) => getLessonProgress(progress, l.id).completed,
  ).length;
  return (
    <article className="chapter-card">
      <div className="chapter-card__head">
        <h2>
          Chapter {chapter.number}: {chapter.title}
        </h2>
        <span className="badge">
          {done}/{lessons.length}
        </span>
      </div>
      <p>{chapter.summary}</p>
      <ul className="concept-list">
        {chapter.concepts.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="hand-links">
        {lessons.map((l) => (
          <LessonChip key={l.id} lesson={l} progress={progress} />
        ))}
      </div>
    </article>
  );
}

function LessonChip({
  lesson,
  progress,
}: {
  lesson: BidLesson;
  progress: ProgressState;
}) {
  const lp = getLessonProgress(progress, lesson.id);
  return (
    <Link
      to={`/bid/${lesson.id}`}
      className={
        "hand-chip" +
        (lp.optimal
          ? " hand-chip--optimal"
          : lp.completed
            ? " hand-chip--done"
            : "")
      }
    >
      {lesson.lessonNumber}. {lesson.title}
      {lp.optimal ? " ★" : lp.completed ? " ✓" : ""}
    </Link>
  );
}
