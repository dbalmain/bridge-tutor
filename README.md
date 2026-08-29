# Bridge Tutor

Progressive bridge tutor for Linux (and tablets via browser). Two tracks:

- **Play course** — [Will Jenner-O’Shea / Derrick Browne Beginners’ Bridge](https://www.willjenneroshea.com/wp/beginners-bridge/) hands.
- **Bidding course** — ABF / Joan Butts Standard Five-Card Majors. Sixteen
  lessons (teach, then a few live tests on that branch). Miss a call and the
  system explainer stays up until you bid the right one.
- **Bidding drills** — the same decision tree, sampled by weakness. Deals come
  from a local Rust sidecar (`crates/bridge-system`, port 8788).

## What the MVP does

1. **Concept first** — each chapter has a short explanation. The bidding
   course interleaves that with live tests on the same branch.
2. **Full hand** — on the play course you bid (South) and play (South + dummy).
3. **Bidding feedback** — play course follows the scripted line; bidding
   course and drills follow the ABF 5CM tree, with the explainer on a miss.
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

That starts **Vite**, the **Sol coach server** (`scripts/coach-server.mjs` on
port 8787), and the **bidding sidecar** (`cargo run -p bridge-system -- serve`
on port 8788). Open the URL Vite prints (usually `http://localhost:5173`).
Drills need that sidecar; `npm run dev:ui` is the play course only.

Install and log in to whichever harness CLI(s) you want on your `PATH`
(`codex`, `grok`, `opencode`, `claude`). Defaults and env overrides:

```bash
COACH_HARNESS=codex COACH_MODEL=gpt-5.6-sol COACH_REASONING=high COACH_PORT=8787 npm run coach
```

The UI selector overrides the default harness/model/thinking **per hand**
(stored in `localStorage`) and applies live — a change mid-hand starts a
fresh coach thread on the next mistake or chat. Env vars only set
server-side defaults when the UI does not send a choice.

UI only (no Sol):

```bash
npm run dev:ui
```

```bash
npm run build    # production UI build
npm run preview  # serve the build (coach and bidding sidecar not included)
cargo test -p bridge-system
cargo run -p bridge-system -- prove-leaves
cargo run -p bridge-system -- serve   # bidding drills, default :8788
```

Regenerate lesson data from the course LIN files:

```bash
node scripts/parse-lin.mjs
```

## Learning path

**Bidding course** (ABF Standard 5CM) — `/bid`

| Chapter | Topic |
|--------:|-------|
| 1 | Opening the bidding (pass, majors, minors) |
| 2 | 1NT and strong openings |
| 3 | Weak twos and preempts |
| 4 | Responding to 1NT (2NT/3NT, Stayman, transfers) |
| 5 | Responding to 1♥ / 1♠ |
| 6 | Responding to 1♣ / 1♦ |
| 7 | Opener’s rebid |

**Play course** (Jenner-O’Shea) — `/`

| Chapter | Topic |
|--------:|-------|
| 1 | Basics |
| 2 | Early bidding |
| 3 | Game plan |
| 4 | Responder shifts |
| 5 | Opening 1NT |
| 6 | Overcalls and doubles |

Play-course hands are the official deals. Bidding follows those scripts; card
play is free and scored by DDS. The bidding course uses generated deals
against the tree.

## Roadmap (agile)

- [x] Curriculum + interactive bid/play + mistake log
- [x] DDS-backed card-play evaluation (significant-error threshold)
- [x] Lazy Sol coach (mistake/chat only) + harness/model/thinking selector
- [ ] Hint / “show best card” without spoiling ★
- [x] Weighted bidding drills against the 5-card-majors tree
- [x] Bidding course: teach, then test, with the explainer on a miss
- [ ] Weekly AI coaching from exported mistake tags
- [ ] More hands beyond the 24 beginners set
- [ ] Optional softer threshold / matchpoint-style scoring

## Stack

Vite · React · TypeScript · localStorage · Sol coach (Codex / Grok / OpenCode /
Claude Code CLIs) · Rust bidding sidecar ·
[bridge-dds](https://github.com/bookchris/bridge-dds-js) (Bo Haglund DDS via WASM).
