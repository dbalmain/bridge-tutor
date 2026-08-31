# Drill pattern completion note

## Root cause

`HandPat` is used as a proposal distribution by the deal generator, but the
opening patterns were also curated as narrow examples. Because `verify`
accepts only the exact target `leaf_id` and expected call, widening a pattern
can add retries but cannot admit a deal for the wrong lesson. The opening
patterns therefore need to over-approximate every hand routed to their leaf;
curated examples belong in the new pinned-hand list.

## Verified diagnosis

- `verify` checks both the exact `leaf_id` and the drill's `expected` call.
- With the fixed seed used by `every_leaf_generates`, the baseline worst case
  was 925 attempts (`rebid.2c.suit`); the worst opening was 320 attempts
  (`open.2c`). Both are far below `MAX_ATTEMPTS = 80_000`.
- The table's 10-HCP preempt example is not routed to a preempt by the tree:
  seven cards add three length points, so every such hand opens at the one
  level before the preempt branch. The 5–10 range in `HOUSE_RULES` is therefore
  only an outer range qualified by “cannot open.” The pattern still permits 10
  HCP and lets `verify` reject it, matching that documented proposal contract.
- The brief understated two edges without making a false claim: the tree can
  pass a flat 12-count, and extreme one-suit hands can open at the one level
  with as few as 4 HCP because length points reach 13.

## Changes

- Opening patterns now over-approximate every routed class, including high-card
  and shape edges beyond the sampled examples (balanced one-suit openings,
  6-6 weak twos, 11-card preempts, 18–20 HCP one-level openings, and 18–19 HCP
  3-3-minor club openings).
- The permanent seeded 400,000-deal gate reports the leaf, literal hand, and
  exact rejecting constraint. It has no percentage threshold and documents
  that sampling finds counterexamples but cannot prove their absence.
- Post-change fixed-seed generation: 925 attempts remains the overall worst
  case (`rebid.2c.suit`); the worst opening improved to 97 (`open.2c`).

## Decisions left open

- The response/rebid extension remains open. Their `south` side can be checked
  from `calls_before`, but those drills are joint two-hand proposal
  distributions; a south-only gate would leave the equally important `north`
  constraint unchecked. Deriving both sides is a separate, much larger audit.

## Not done

- No curriculum, frontend, scheduler, or HTTP API changes.
