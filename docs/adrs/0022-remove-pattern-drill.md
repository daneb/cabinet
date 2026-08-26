# ADR-0022: Remove drilling for the mate and endgame pattern categories

**Status**: Accepted
**Date**: 2026-08-26

## Context

`PatternsPanel` offers a "Drill" action next to "View" for every curated
pattern. Drilling reuses the repertoire drill engine (`onDrillPattern` →
`window.useDrill`) to replay the pattern's forced line from memory. Both
categories that exist today — `mate` (ADR-0016) and `endgame` (ADR-0021) —
are, by design, short, fully forced single-line sequences with one
canonical answer (see both ADRs' correctness gate discussion). Rote drilling
adds little for that shape of content: there is nothing to recall beyond the
one memorized move order, unlike repertoire drilling, which exercises
judgement across branches.

`category` was built as an extension point for content that fits drilling
better (openings/middlegame strategies, per ADR-0016) — so the fix is to
turn drilling off per-category, not to delete the drill wiring.

## Decision

- Added `drillable: false` to the `mate` and `endgame` entries in
  `CATEGORIES` (`slices/patterns/patterns-data.js`).
- `PatternsPanel` now renders "Drill" only when `cat.drillable !== false`;
  `cat.drillable` is a new, currently unset-elsewhere field, so a category
  added later without it stays drillable by default. "View" is unconditional
  and unaffected.
- `onDrillPattern`, `handleDrillPattern`, `useDrill` and `PatternsProgress`
  in `app.jsx` are untouched — they remain live for the repertoire drill
  feature and for any future drillable category.
- Governed through `keel` (`.keel/specs/remove-pattern-drill/`): G0/G1
  passed, G2/G2.5 passed (lint stays `BLOCKED` — no lint tooling exists in
  this repo), the panel change was verified by hand in the running app
  (both categories show only "View"), and the merge was human-approved.

## Consequences

- No "Drill" button remains under "Checkmate patterns" or "Endgame
  technique"; `tests/patterns/patterns-data.test.js` asserts both
  categories' `drillable` is `false`.
- `PatternsProgress`'s per-pattern drill counters stop accumulating for
  these categories going forward, but existing counts are left in
  `localStorage` untouched — out of scope for this change.
- A future drillable category (the "openings/middlegame" extension ADR-0016
  anticipated) needs no panel change: omit `drillable` (or set it `true`)
  and the existing "Drill" wiring applies unchanged.
