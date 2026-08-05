import { Link, useLocation } from "react-router-dom";
import curriculum from "../data/curriculum.json";
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

  const nextLesson =
    data.lessons.find((l) => !getLessonProgress(progress, l.id).completed) ??
    data.lessons[0];

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">MVP · agile tutor</p>
        <h1>Learn bridge one concept at a time</h1>
        <p className="lede">
          Aligned with{" "}
          <a href={data.meta.source} target="_blank" rel="noreferrer">
            Will Jenner-O&apos;Shea / Derrick Browne Beginners&apos; Bridge
          </a>
          : {data.meta.system}.
        </p>
        <p className="lede muted">
          Each lesson: short explanation → bid and play the hand → feedback on
          mistakes → replay until you match the optimal lesson line.
        </p>
        {nextLesson && (
          <Link className="btn btn--primary" to={`/play/${nextLesson.id}`}>
            Continue · Hand {nextLesson.title}
          </Link>
        )}
      </section>

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
