import { useMemo } from "react";
import { Link } from "react-router-dom";
import { biddingCurriculum } from "../lib/biddingCurriculum";
import { playCurriculum } from "../lib/playCurriculum";
import { loadProgress } from "../lib/progress";
import { bidDisplay, cardLabel } from "../lib/cards";

function pretty(phase: string, value: string): string {
  if (phase === "play" && value.length === 2) return cardLabel(value);
  if (phase === "bidding") return bidDisplay(value);
  return value;
}

function lessonHref(id: string): string | null {
  if (biddingCurriculum.lessons.some((l) => l.id === id)) return `/bid/${id}`;
  if (playCurriculum.lessons.some((l) => l.id === id)) return `/play/${id}`;
  return null;
}

function lessonTitle(id: string): string {
  return (
    biddingCurriculum.lessons.find((l) => l.id === id)?.title ??
    playCurriculum.lessons.find((l) => l.id === id)?.title ??
    id
  );
}

export function MistakesPage() {
  const progress = useMemo(() => loadProgress(), []);

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
            const href = lessonHref(m.lessonId);
            const title = lessonTitle(m.lessonId);
            return (
              <li key={m.id} className="mistake-item">
                <div className="mistake-item__top">
                  {href ? (
                    <Link to={href}>{title}</Link>
                  ) : (
                    <span>{title}</span>
                  )}
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
