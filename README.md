# Bridge Tutor

Progressive bridge tutor for Linux (and tablets via browser). Built around the
[Will Jenner-O’Shea / Derrick Browne Beginners’ Bridge](https://www.willjenneroshea.com/wp/beginners-bridge/)
course: **5-card majors, strong 1NT (15–17)**.

## What the MVP does

1. **Concept first** — each chapter has a short explanation.
2. **Full hand** — you bid (South) and play (South + dummy).
3. **Bidding feedback** — follows the course line (5-card majors / strong NT).
4. **Card play via DDS** — [Bo Haglund’s double-dummy solver](https://github.com/dds-bridge/dds)
   (WASM) scores every card. You are only called out when a play costs
   **≥1 trick** versus optimal. Spot cards that score the same are fine.
   Opponents autoplay double-dummy best.
5. **Until clean** — replay for ★ with zero significant DDS errors.
6. **Mistake journal** — local history with tags for later AI coaching.
7. **Sol coach** — each hand opens a **standby** coach session: auction/play notes
   are queued locally (no model calls). The coach harness (Codex, Grok Build,
   OpenCode, or Claude Code) only runs when you make a mistake or chat.
   Choose harness, model, and thinking level in the commentary panel.
   Explanations appear there; transcripts persist in `localStorage` and
   `.coach-sessions/`.
8. **Export** — download progress JSON to paste into an AI tutor.

## Run

```bash
npm install
npm run dev
```

That starts **Vite** and the **Sol coach server** (`scripts/coach-server.mjs` on
port 8787). Open the URL Vite prints (usually `http://localhost:5173`).

Install and log in to whichever harness CLI(s) you want on your `PATH`
(`codex`, `grok`, `opencode`, `claude`). Defaults and env overrides:

```bash
COACH_HARNESS=codex COACH_MODEL=gpt-5.6-sol COACH_REASONING=high COACH_PORT=8787 npm run coach
```

The UI selector overrides the default harness/model/thinking **per hand**
(stored in `localStorage`). Restart the hand after changing them. Env vars only
set server-side defaults when the UI does not send a choice.

UI only (no Sol):

```bash
npm run dev:ui
```

```bash
npm run build    # production build
npm run preview  # serve the build (coach not included)
```

Regenerate lesson data from the course LIN files:

```bash
node scripts/parse-lin.mjs
```

## Learning path

| Chapter | Topic |
|--------:|-------|
| 1 | Basics |
| 2 | Early bidding |
| 3 | Game plan |
| 4 | Responder shifts |
| 5 | Opening 1NT |
| 6 | Overcalls and doubles |

Hands are the official course deals (tutorials by Will Jenner-O’Shea). Bidding
follows those scripts; card play is free and scored by DDS.

## Roadmap (agile)

- [x] Curriculum + interactive bid/play + mistake log
- [x] DDS-backed card-play evaluation (significant-error threshold)
- [x] Lazy Sol coach (mistake/chat only) + harness/model/thinking selector
- [ ] Hint / “show best card” without spoiling ★
- [ ] Spaced-repetition micro-drills (bidding flashcards)
- [ ] Weekly AI coaching from exported mistake tags
- [ ] More hands beyond the 24 beginners set
- [ ] Optional softer threshold / matchpoint-style scoring

## Stack

Vite · React · TypeScript · localStorage · Sol coach (Codex / Grok / OpenCode /
Claude Code CLIs) ·
[bridge-dds](https://github.com/bookchris/bridge-dds-js) (Bo Haglund DDS via WASM).
