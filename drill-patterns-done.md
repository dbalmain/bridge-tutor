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
- Divergences from the brief: none found yet.

## Changes

- Pending.

## Decisions left open

- Whether to extend the possible-hand invariant beyond openings is still under
  evaluation.

## Not done

- No curriculum, frontend, scheduler, or HTTP API changes.
