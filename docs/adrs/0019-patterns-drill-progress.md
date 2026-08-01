# ADR-0019: Per-pattern drill progress tracking

**Status**: Accepted
**Date**: 2026-08-01

## Context

ADR-0016 shipped 25 drillable checkmate patterns but explicitly deferred per-pattern progress persistence as future work — there was no way to see, at a glance, which patterns had already been drilled to completion or how many times. The user asked for completed patterns to be visually distinguished in the Patterns list and for a completion count, stored the same way the rest of the app persists state.

## Decision

- New pure module `slices/patterns/patterns-progress.js` (`window.PatternsProgress`) — localStorage-only store (`chess_patterns_progress_v1`), mirroring the shape of the review-settings store in `slices/library/library.js`: `{ [patternId]: { count, lastCompletedAt } }`. `recordCompletion(progress, patternId)` returns the updated map and persists it; no disk/API mirror, since this is local drill history rather than shareable content like saves or the game library.
- `app.jsx` attributes a drill's `COMPLETE` phase back to the pattern it was launched from: `handleDrillPattern` records the pattern id in a ref, and a small effect fires `recordCompletion` once per completion (guarded so re-renders while `COMPLETE` don't double-count). Every non-pattern entry point into `useDrill.startDrill` (main "Start Drill" button, chapter drill, right-click drill-from-here) is routed through a `startRepertoireDrill` wrapper that clears the ref first, so a repertoire drill's completion is never mis-attributed to whatever pattern was last drilled. "Drill misses again" restarts the same drill without going through `app.jsx`, so it keeps counting toward the same pattern — retrying to a clean finish is still a completion.
- `PatternsPanel` reads the progress map as a prop, adds a `.completed` modifier class (green border/background, `--accent-2`, matching the existing "synced" state color) to any pattern row with `count > 0`, and renders a `✓ {count}` badge next to the pattern name.

## Consequences

- Drilled patterns are now visually distinct from untouched ones, with a running completion count, entirely from existing localStorage — no server or Electron changes.
- Progress is per-browser/per-device, consistent with other localStorage-only settings in the app (e.g. review settings); it does not sync via the GitHub sync panel the way saves and the library do.
- Counting increments on any full completion, including misses-retries — this rewards eventually getting every move right rather than only tracking first-attempt success.
