# ADR-0011: Game Review — per-side accuracy and move classification

**Status**: Accepted
**Date**: 2026-06-29

## Context

Stockfish is already wired up for *live* analysis: the eval bar shows the current position's score and three suggestion arrows highlight engine candidates. There has been nothing post-hoc — once a line is played out, the only information about move quality lives in the eval bar's per-position swings, which the user has to scrub through manually to find mistakes.

Chess.com's "Game Review" surface (and Lichess's similar feature) solve this by replaying the engine over every move in the game and producing two artefacts:

1. A per-move classification badge (Best / Inaccuracy / Mistake / Blunder).
2. A per-side **accuracy %** so each player can be graded for the whole game.

The user asked how complex it would be to add this. The foundations were already in place — the engine is a Web Worker that takes an arbitrary FEN, and the move-tree node carries the full board state — so the missing pieces are just orchestration, classification math, and a UI panel.

## Decision

A new `slices/game-review/` slice with three files, plus small additions to `move-tree` and `move-list`:

- `classify.js` — pure functions for centipawn-loss → classification and Lichess-style win-percentage → accuracy %. Mate scores clamp to ±1000cp before any math so a forced mate near the leaves doesn't blow the accuracy curve.
- `analyzer.js` — `useReviewWorker` hook that spawns a **second** Stockfish worker. The live engine and the review engine never share a worker, so analyzing 40 moves does not freeze the eval bar or arrows. Positions are walked sequentially at depth 14 and each one's PV-1 score is captured before `bestmove` is received.
- `game-review.jsx` — `<GameReviewPanel>`: an "Analyze game" button, progress bar with cancel, and a summary table showing per-side accuracy plus counts for Best / Excellent / Good / Inaccuracy / Mistake / Blunder.

Analysis is **manual** — there is no auto-run on tree changes. Running ~40 positions at depth 14 takes 30–90 seconds; the user opts in.

Per-node annotations (`reviewLossCp`, `reviewClass`, `reviewAccuracy`) are written onto the move-tree node via two new `MoveTree` helpers (`setReviewAnnotations`, `clearReviewAnnotations`). Because the tree is already serialized to localStorage and disk-backed saves, the annotations survive reload and travel with saved lines automatically.

The move-list renders an inline `?!` / `?` / `??` glyph next to any move classified as inaccuracy, mistake, or blunder, mirroring how `StatusBadge` already decorates moves with drill state.

Scope is intentionally narrow:
- No Brilliant / Great / Miss — Chess.com's exact rules aren't published and approximations are noisy.
- No phase grades (Opening / Middlegame / Endgame).
- No "Game Rating" estimate — that's a Chess.com proprietary model.
- No player identity — the panel labels sides as "White" / "Black".

## Consequences

- Users can now post-mortem any line, including imported PGNs, with one click and get both the headline accuracy numbers and the move-by-move grading.
- The second Stockfish worker doubles memory cost while a review is running. This is fine on desktop and stops as soon as the run finishes (the worker stays alive for re-runs but is otherwise idle).
- Persistence is automatic — annotations ride along with the existing session and saves serialization. There is no schema migration: nodes simply gain optional fields, and old saves work unchanged.
- The classification heuristics are deliberately simple. If accuracy numbers diverge significantly from Lichess for the same PGN, that's the place to tune.
- A future ADR can add the Chess.com-style flair (Brilliant/Great, phase grades, custom rating estimate) on top of this foundation without rework.
