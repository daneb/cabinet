---
id: SPEC-0001
slug: remove-pattern-drill
schema: keel.spec/1
status: draft
scope:
  - "slices/patterns/**"
  - "tests/patterns/**"
budget:
  criteria: 8
  lines: 120
verified_at: 2026-08-26
---

# Remove drill from endgame and mate pattern categories

## Context

`PatternsPanel` (`slices/patterns/patterns-panel.jsx`) offers a "Drill" button
next to every curated pattern, alongside "View". Drilling reuses the
repertoire drill engine (`onDrillPattern` → `window.useDrill`) to make the
user replay the pattern's forced line from memory. The two categories that
exist today — `mate` (checkmate patterns) and `endgame` (lone-king mating
technique) — are both short, fully forced single-line sequences with one
canonical answer, which makes rote drilling a poor fit: there is nothing to
recall beyond the one memorized move order, so it doesn't exercise judgement
the way repertoire drilling does. `View` (loading the pattern onto the board
to step through) stays; only the drill entry point goes.

`patterns-data.js` already documents `category` as "the extension point for
openings and middlegame strategies later" — a category that fits drilling
better may be added after this change, so drillability is removed
per-category, not by deleting the drill wiring wholesale.

## Acceptance criteria

### AC-1 Endgame patterns are not drillable

WHEN a pattern's category is `endgame` THE SYSTEM SHALL report that
category as not drillable.

oracle: cmd `node --test --test-name-pattern "endgame category is not drillable" tests/patterns/patterns-data.test.js` exit 0

### AC-2 Mate patterns are not drillable

WHEN a pattern's category is `mate` THE SYSTEM SHALL report that
category as not drillable.

oracle: cmd `node --test --test-name-pattern "mate category is not drillable" tests/patterns/patterns-data.test.js` exit 0

### AC-3 The Drill button is gone from both categories in the panel

WHEN the Patterns panel renders a pattern whose category is not drillable
THE SYSTEM SHALL show a "View" action and SHALL NOT show a "Drill" action
for that pattern.

oracle: human a reviewer opens the Patterns panel in the running app, expands
the "Checkmate patterns" and "Endgame technique" groups, and confirms every
row shows only "View" with no "Drill" button.

## Out of scope

- Deleting `onDrillPattern`, `useDrill`, `PatternsProgress`, or any other
  drill machinery — it stays for the repertoire drill feature and for any
  future drillable pattern category.
- Changing the `mate`/`endgame` dataset content, FEN/line data, or the
  `View` flow.
- Adding a category that keeps drilling — not requested here.
