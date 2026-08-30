import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { biddingCurriculum } from "../lib/biddingCurriculum";
import { playCurriculum } from "../lib/playCurriculum";
import { fetchWeights, type LeafWeight } from "../lib/bridgeSystem";
import {
  clearProgress,
  exportProgressJson,
  getLessonProgress,
  loadProgress,
  mistakeSummary,
} from "../lib/progress";
import {
  clearSystemProgress,
  loadSystemProgressJson,
} from "../lib/systemProgress";
import type { ProgressState } from "../lib/types";

export function ProgressPage() {
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const playDone = playCurriculum.lessons.filter(
    (l) => getLessonProgress(progress, l.id).completed,
  ).length;
  const bidDone = biddingCurriculum.lessons.filter(
    (l) => getLessonProgress(progress, l.id).completed,
  ).length;
  const completed = playDone + bidDone;
  const optimal =
    playCurriculum.lessons.filter(
      (l) => getLessonProgress(progress, l.id).optimal,
    ).length +
    biddingCurriculum.lessons.filter(
      (l) => getLessonProgress(progress, l.id).optimal,
    ).length;
  const tags = mistakeSummary(progress);
  const [weights, setWeights] = useState<LeafWeight[] | null>(null);

  useEffect(() => {
    void fetchWeights(loadSystemProgressJson())
      .then(setWeights)
      .catch(() => setWeights([]));
  }, []);

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

      {weights && weights.length > 0 && (
        <section className="panel">
          <h2>5-card majors drills</h2>
          <p className="muted small">
            Sampling weight is the chance the next drill is this leaf. Misses
            and unseen nodes are heavier; strong ones still appear.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Leaf</th>
                <th>Seen</th>
                <th>Right</th>
                <th>Wrong</th>
                <th>Next</th>
              </tr>
            </thead>
            <tbody>
              {weights
                .slice()
                .sort((a, b) => b.weight - a.weight)
                .map((w) => (
                  <tr key={w.id}>
                    <td>
                      {w.title}
                      <div className="muted small">{w.id}</div>
                    </td>
                    <td>{w.seen}</td>
                    <td>{w.correct}</td>
                    <td>{w.wrong}</td>
                    <td className="weight-pct">
                      {(w.weight * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="muted small">
            <Link to="/drill">Open drills</Link>
          </p>
        </section>
      )}

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
        <h2>Bidding course</h2>
        <p className="muted small">
          {bidDone}/{biddingCurriculum.lessons.length} lessons complete.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Lesson</th>
              <th>Attempts</th>
              <th>Best misses</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {biddingCurriculum.lessons.map((l) => {
              const lp = getLessonProgress(progress, l.id);
              return (
                <tr key={l.id}>
                  <td>
                    <Link to={`/bid/${l.id}`}>
                      {l.lessonNumber}. {l.title}
                    </Link>
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

      {playCurriculum.lessons.length > 0 && (
        <section className="panel">
          <h2>Play course</h2>
          <p className="muted small">
            {playDone}/{playCurriculum.lessons.length} hands complete.
          </p>
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
              {playCurriculum.lessons.map((l) => {
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
      )}

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
              clearSystemProgress();
              setWeights([]);
            }
          }}
        >
          Reset progress
        </button>
      </div>
    </div>
  );
}
