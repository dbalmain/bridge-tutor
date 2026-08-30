# Bridge Tutor

Progressive bridge tutor for Linux (and tablets via browser).

- **Bidding course** — ABF / Joan Butts Standard Five-Card Majors. Nine
  chapters, twenty-four lessons (teach, then live auctions you bid from the
  start). Every seat bids the system, so an opponent holding an opening hand
  opens; only the side that opened keeps bidding. Miss a call and the
  explainer stays up until you bid the right one.
- **Bidding drills** — the same tree, sampled by weakness, still bid from
  dealer rather than skipping to the hard call. Deals come from a local Rust
  sidecar (`crates/bridge-system`, port 8788).
- **Play course** — forthcoming. Same 5CM tree, full deals: bid the system
  line, then play. Card play scored by DDS.

## What the MVP does

1. **Concept first** — each bidding lesson has a short explanation, then live
   auctions on that branch of the tree, bid from the start.
2. **Bidding feedback** — course and drills follow the ABF 5CM tree, with the
   explainer on a miss. You still see partner’s system continuation.
3. **Card play via DDS** — [Bo Haglund’s double-dummy solver](https://github.com/dds-bridge/dds)
   (WASM) scores every card. You are only called out when a play costs
   **≥1 trick** versus optimal. Spot cards that score the same are fine.
   Opponents autoplay double-dummy best. (Wired and waiting for the play
   course.)
4. **Until clean** — replay for ★ with zero significant errors.
5. **Mistake journal** — local history with tags for later AI coaching.
6. **Sol coach** — each hand opens a **standby** coach session: auction/play notes
   are queued locally (no model calls). The coach harness (Codex, Grok Build,
   OpenCode, or Claude Code) only runs when you make a mistake or chat.
   Choose harness, model, and thinking level in the commentary panel.
   Explanations appear there; transcripts persist in `localStorage` and
   `.coach-sessions/`.
7. **Export** — download progress JSON to paste into an AI tutor.

## Run

```bash
npm install
npm run dev
```

That starts **Vite**, the **Sol coach server** (`scripts/coach-server.mjs` on
port 8787), and the **bidding sidecar** (`cargo run -p bridge-system -- serve`
on port 8788). Open the URL Vite prints (usually `http://localhost:5173`).
Bidding course and drills need that sidecar; `npm run dev:ui` is the UI only.

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

The play course will reuse this tree: each leaf becomes a full deal you bid,
then play.

## Roadmap (agile)

- [x] Curriculum + interactive bid/play + mistake log
- [x] DDS-backed card-play evaluation (significant-error threshold)
- [x] Lazy Sol coach (mistake/chat only) + harness/model/thinking selector
- [ ] Hint / “show best card” without spoiling ★
- [x] Weighted bidding drills against the 5-card-majors tree
- [x] Bidding course: teach, then bid the auction through, explainer on a miss
- [ ] Play course on the same 5CM tree (full deals, DDS scoring)
- [ ] Weekly AI coaching from exported mistake tags
- [ ] Optional softer threshold / matchpoint-style scoring

## Stack

Vite · React · TypeScript · localStorage · Sol coach (Codex / Grok / OpenCode /
Claude Code CLIs) · Rust bidding sidecar ·
[bridge-dds](https://github.com/bookchris/bridge-dds-js) (Bo Haglund DDS via WASM).
