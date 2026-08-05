import { useState } from "react";
import { Link } from "react-router-dom";
import curriculum from "../data/curriculum.json";
import {
  clearProgress,
  exportProgressJson,
  getLessonProgress,
  loadProgress,
  mistakeSummary,
} from "../lib/progress";
import type { Curriculum, ProgressState } from "../lib/types";

const data = curriculum as Curriculum;

export function ProgressPage() {
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const completed = data.lessons.filter(
    (l) => getLessonProgress(progress, l.id).completed,
  ).length;
  const optimal = data.lessons.filter(
    (l) => getLessonProgress(progress, l.id).optimal,
  ).length;
  const tags = mistakeSummary(progress);

  function download() {
    const blob = new Blob([exportProgressJson(progress)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bridge-tutor-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <h1>Progress</h1>
      <div className="stats-row">
        <div className="stat">
          <div className="stat__n">{completed}</div>
          <div className="stat__l">Completed</div>
        </div>
        <div className="stat">
          <div className="stat__n">{optimal}</div>
          <div className="stat__l">Optimal ★</div>
        </div>
        <div className="stat">
          <div className="stat__n">{progress.mistakes.length}</div>
          <div className="stat__l">Mistakes logged</div>
        </div>
      </div>

      <section className="panel">
        <h2>Weak spots (from tags)</h2>
        {tags.length === 0 ? (
          <p className="muted">
            No mistakes yet. Play hands and wrong bids/cards will cluster here.
          </p>
        ) : (
          <ul className="tag-bars">
            {tags.map((t) => (
              <li key={t.tag}>
                <span>{t.tag}</span>
                <div className="bar">
                  <div
                    className="bar__fill"
                    style={{
                      width: `${Math.min(100, t.count * 12)}%`,
                    }}
                  />
                </div>
                <span>{t.count}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          Later iterations: AI tutor reads this export and assigns the next
          lessons. For now, prioritise tags at the top.
        </p>
      </section>

      <section className="panel">
        <h2>Per-hand status</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Hand</th>
              <th>Attempts</th>
              <th>Best mistakes</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.lessons.map((l) => {
              const lp = getLessonProgress(progress, l.id);
              return (
                <tr key={l.id}>
                  <td>
                    <Link to={`/play/${l.id}`}>{l.title}</Link>
                  </td>
                  <td>{lp.attempts}</td>
                  <td>{lp.bestMistakes ?? "—"}</td>
                  <td>
                    {lp.optimal
                      ? "Optimal ★"
                      : lp.completed
                        ? "Done"
                        : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="btn-row">
        <button type="button" className="btn" onClick={download}>
          Export JSON (for AI review)
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            if (confirm("Clear all progress and mistakes?")) {
              setProgress(clearProgress());
            }
          }}
        >
          Reset progress
        </button>
      </div>
    </div>
  );
}
