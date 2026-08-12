import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import type { CommentaryEntry } from "../lib/types";

interface Props {
  entries: CommentaryEntry[];
  /** Optional coach thinking indicator shown at the bottom of the log. */
  thinkingLabel?: string | null;
  /** When set, show a chat composer under the log. */
  onSendChat?: (message: string) => void;
  chatDisabled?: boolean;
  chatPlaceholder?: string;
  /** Badge label for coach replies / thinking (e.g. Sol, Grok, Claude). */
  coachBadge?: string;
}

function badgeFor(e: CommentaryEntry, coachBadge: string): string | null {
  if (e.kind === "coach") return coachBadge;
  if (e.kind === "user") return "You";
  if (e.phase === "bidding" && e.action) return e.seat ?? "?";
  if (e.phase === "play" && e.action) return e.seat ?? "?";
  return null;
}

export function CommentaryLog({
  entries,
  thinkingLabel,
  onSendChat,
  chatDisabled = false,
  chatPlaceholder = "Ask the coach about this hand…",
  coachBadge = "Coach",
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [entries.length, thinkingLabel]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const el = inputRef.current;
    if (!el || !onSendChat || chatDisabled) return;
    const text = el.value.trim();
    if (!text) return;
    onSendChat(text);
    el.value = "";
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="commentary-wrap">
      {entries.length === 0 && !thinkingLabel ? (
        <div className="commentary commentary--empty">
          <p className="muted small">
            Commentary will appear here as the auction and play unfold. The coach
            can join in when the coach server is running.
          </p>
        </div>
      ) : (
        <div className="commentary" ref={scrollerRef}>
          <ol className="commentary__list">
            {entries.map((entry) => {
              const badge = badgeFor(entry, coachBadge);
              return (
                <li
                  key={entry.id}
                  className={`commentary__item commentary__item--${entry.kind}`}
                >
                  {badge && (
                    <span
                      className={
                        "commentary__badge" +
                        (entry.phase === "play" && entry.kind !== "coach" && entry.kind !== "user"
                          ? " commentary__badge--play"
                          : "") +
                        (entry.kind === "coach" ? " commentary__badge--sol" : "") +
                        (entry.kind === "user" ? " commentary__badge--you" : "")
                      }
                    >
                      {badge}
                    </span>
                  )}
                  <span className="commentary__text">{entry.text}</span>
                </li>
              );
            })}
            {thinkingLabel && (
              <li className="commentary__item commentary__item--thinking">
                <span className="commentary__badge commentary__badge--sol">
                  {coachBadge}
                </span>
                <span className="commentary__text muted">{thinkingLabel}</span>
              </li>
            )}
          </ol>
          <div ref={bottomRef} />
        </div>
      )}

      {onSendChat && (
        <form className="coach-chat" onSubmit={submit}>
          <textarea
            ref={inputRef}
            className="coach-chat__input"
            rows={2}
            placeholder={chatPlaceholder}
            disabled={chatDisabled}
            onKeyDown={onKeyDown}
            aria-label={`Message ${coachBadge}`}
          />
          <button
            type="submit"
            className="btn btn--small btn--primary coach-chat__send"
            disabled={chatDisabled}
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
