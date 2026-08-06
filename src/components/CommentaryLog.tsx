import { useEffect, useRef } from "react";
import type { CommentaryEntry } from "../lib/engine";

interface Props {
  entries: CommentaryEntry[];
}

export function CommentaryLog({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keep the newest line in view as commentary accumulates
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="commentary commentary--empty">
        <p className="muted small">Commentary will appear here as the auction and play unfold.</p>
      </div>
    );
  }

  return (
    <div className="commentary" ref={scrollerRef}>
      <ol className="commentary__list">
        {entries.map((e) => (
          <li
            key={e.id}
            className={`commentary__item commentary__item--${e.kind}`}
          >
            {e.phase === "bidding" && e.action && (
              <span className="commentary__badge">
                {e.seat ?? "?"}
              </span>
            )}
            {e.phase === "play" && e.action && (
              <span className="commentary__badge commentary__badge--play">
                {e.seat ?? "?"}
              </span>
            )}
            <span className="commentary__text">{e.text}</span>
          </li>
        ))}
      </ol>
      <div ref={bottomRef} />
    </div>
  );
}
