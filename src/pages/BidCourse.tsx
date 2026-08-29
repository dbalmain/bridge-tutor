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
          Each lesson: a short explanation, then a few live hands on that
          branch. Miss a call and the system explainer stays up until you bid
          the right one. After the course, drills keep sampling the leaves you
          miss.
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
