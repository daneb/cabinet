# ADR-0020: Suppress stale engine arrows on checkmate/stalemate

**Status**: Accepted
**Date**: 2026-08-01

## Context

After finishing a drill that ends in checkmate (most pattern drills), closing the drill summary could leave misleading arrows drawn on the board — pointing at squares from a position several moves earlier. Reported via a Réti's-mate drill: the mating move was played, the summary showed 100%, and after closing it the board displayed arrows that made no sense for a finished game.

The cause: `useEngine` (`slices/engine/engine.jsx`) keeps feeding every board `fen` to Stockfish and only overwrites its `arrows` state when a fresh `info ... pv` line arrives. A checkmate or stalemate position has no legal moves, so the engine never returns a PV for it — `arrows` simply keeps whatever was last computed for the position *before* the final move. That's normally invisible because `app.jsx` already hides arrows while `drill.active` is true, but once the drill summary is closed (`drill.active` becomes `false`), the stale arrows from the pre-mate position reappear.

## Decision

`app.jsx` already computes `mateOrStale` (used for the "checkmate"/"stalemate" label) from `Chess.allLegalMoves` on the current position. Reuse it to gate the arrow overlay the same way drill-mode already does: `arrows={drill.active || mateOrStale ? [] : arrows}`. No change to the engine hook itself — it still holds the stale value internally, but the board never renders it once the game has ended, and a fresh position (new game, undo, etc.) clears `mateOrStale` and lets live arrows resume immediately.

## Consequences

- Arrows never point at a finished game, whether the end position was reached by drilling, normal play, or importing a PGN.
- The engine hook's own stale-arrow state is untouched — this is a display-layer fix, not a correctness fix in `useEngine`. A future cleanup could reset `arrows`/`evaluation` inside the hook when Stockfish reports no legal moves, but gating at render time was sufficient here and kept the fix to one line.
