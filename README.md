# Bridge Tutor

Progressive bridge tutor for Linux (and tablets via browser). Built around the
[Will Jenner-O’Shea / Derrick Browne Beginners’ Bridge](https://www.willjenneroshea.com/wp/beginners-bridge/)
course: **5-card majors, strong 1NT (15–17)**.

## What the MVP does

1. **Concept first** — each chapter has a short explanation.
2. **Full hand** — you bid (South) and play (South + dummy).
3. **Feedback** — wrong bids/cards show the lesson’s teaching note.
4. **Until optimal** — replay until you finish with **zero mistakes** (★).
5. **Mistake journal** — local history with tags for later AI coaching.
6. **Export** — download progress JSON to paste into an AI tutor.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build    # production build
npm run preview  # serve the build
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

Hands are the official course deals (tutorials by Will Jenner-O’Shea). Optimal
lines follow those scripts — not a free double-dummy engine yet.

## Roadmap (agile)

- [x] Curriculum + interactive bid/play + mistake log
- [ ] Hint / “show next card” without counting as optimal
- [ ] Spaced-repetition micro-drills (bidding flashcards)
- [ ] DDS-backed alternative lines (not only the scripted line)
- [ ] Weekly AI coaching from exported mistake tags
- [ ] More hands beyond the 24 beginners set

## Stack

Vite · React · TypeScript · localStorage (no backend).
