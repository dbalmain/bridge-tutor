import { useMemo } from "react";
import { Link } from "react-router-dom";
import curriculum from "../data/curriculum.json";
import { loadProgress } from "../lib/progress";
import type { Curriculum } from "../lib/types";
import { bidDisplay, cardLabel } from "../lib/cards";

const data = curriculum as Curriculum;

function pretty(phase: string, value: string): string {
  if (phase === "play" && value.length === 2) return cardLabel(value);
  if (phase === "bidding") return bidDisplay(value);
  return value;
}

export function MistakesPage() {
  const progress = useMemo(() => loadProgress(), []);
  const lessonsById = useMemo(
    () => Object.fromEntries(data.lessons.map((l) => [l.id, l])),
    [],
  );

  return (
    <div className="page">
      <h1>Mistake journal</h1>
      <p className="lede muted">
        Every wrong bid or card is stored locally. Export from Progress and paste
        into your AI tutor for a weekly coaching plan.
      </p>

      {progress.mistakes.length === 0 ? (
        <p className="panel">No mistakes recorded yet. Nice — or start playing!</p>
      ) : (
        <ul className="mistake-list">
          {progress.mistakes.map((m) => {
            const lesson = lessonsById[m.lessonId];
            return (
              <li key={m.id} className="mistake-item">
                <div className="mistake-item__top">
                  <Link to={`/play/${m.lessonId}`}>
                    Hand {lesson?.title ?? m.lessonId}
                  </Link>
                  <time dateTime={m.at}>
                    {new Date(m.at).toLocaleString()}
                  </time>
                </div>
                <div className="mistake-item__body">
                  <strong>{m.phase}</strong>: played{" "}
                  <code>{pretty(m.phase, m.actual)}</code>, expected{" "}
                  <code>{pretty(m.phase, m.expected)}</code>
                </div>
                {m.teaching && <p className="teaching">{m.teaching}</p>}
                <div className="tags">
                  {m.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
