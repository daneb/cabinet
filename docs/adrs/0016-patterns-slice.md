# ADR-0016: Patterns slice — replayable checkmate patterns

**Status**: Accepted
**Date**: 2026-07-22

## Context

The user wants to train pattern recognition: load classical mating patterns (Boden's Mate, Anastasia's Mate, …) onto the board, step through them, and drill them from memory — with openings and middlegame strategies to follow later. The app already had every mechanism this needs: `Chess.fromFEN` for arbitrary positions, a MoveTree per line, VCR navigation, and a drill state machine that auto-plays opponent replies and scores the user's moves. What was missing was curated content and a way to reach it. Full spec: `docs/specs/patterns-slice.md`.

## Decision

- New vertical slice `slices/patterns/`:
  - `patterns-data.js` (`window.Patterns`, pure, tested) — 25 canonical checkmate patterns, one clean example each: `{ id, name, category, fen, sideToWin, line, description, source }`. Famous games are used where they exist (Opera Game 1858, Réti–Tartakower 1910, Légal 1750, Philidor's smothered-mate mechanism); the rest are minimal constructed positions. `buildTree(pattern)` folds the SAN line through `Chess.parseSAN` + `MoveTree.playMove`, carrying the description on the root comment.
  - `patterns-panel.jsx` (`window.PatternsPanel`) — a third card under the board next to Library and Insights: patterns grouped by category, each row with **View** (load and step through) and **Drill** actions.
- Drill reuses `useDrill` unchanged via `startDrill(rootId, pattern.sideToWin, 'mainline')`; the board auto-flips so the winning side is at the bottom. Starting the drill is deferred one render so the drill hook counts nodes on the freshly loaded tree.
- **Correctness gate**: `tests/patterns/patterns-data.test.js` mechanically verifies every entry — FEN round-trips, kings present, side-to-move matches `sideToWin`, every SAN resolves uniquely and round-trips through `Chess.toSAN` (exact disambiguation and `+`/`#` suffixes), and the final position is a true checkmate. Hand-authored positions are never trusted without this.
- `category` (currently only `'mate'`) is the extension point: opening patterns, middlegame strategies, and technical endgames become new categories with content only — no structural change. No server/API/Electron changes; the data ships in the bundle.

## Consequences

- 25 drillable mating patterns available offline, each engine-verifiable and replayable to a proven mate.
- Adding a pattern is a data edit guarded by tests; adding a category is a data edit plus a `CATEGORIES` entry.
- One pattern per concept for now; multiple graded exercises per pattern and per-pattern progress persistence are deliberate future work.
