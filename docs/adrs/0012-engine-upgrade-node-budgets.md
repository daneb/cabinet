# ADR-0012: Stockfish 18 lite engine + node-budget quality tiers

**Status**: Accepted
**Date**: 2026-07-04

## Context

Both the live engine and game review ran on the original vendored `stockfish.js` (1.5 MB, ~Stockfish-10-era, pre-NNUE) at a fixed `go depth 14`. Two problems surfaced when planning batch review of many games:

1. **Accuracy per unit compute.** Pre-NNUE evaluation is markedly weaker per node than modern NNUE builds, especially in quiet positional middlegames — precisely where classification boundary errors are most likely.
2. **Unpredictable time.** `go depth N` takes wildly different wall time depending on position complexity, which makes it impossible to promise "20 games in ~10 minutes" for a background batch.

The user's constraint: analysis must be background-friendly on a 16 GB M4 — the machine stays usable while a batch runs. A multi-threaded engine was rejected outright: it would need SharedArrayBuffer and COOP/COEP headers in both servers, and saturating cores contradicts the requirement.

## Decision

- Vendor the official **Stockfish 18 "lite, single-threaded"** build (`stockfish-18-lite-single.js` + `.wasm`, small NNUE net embedded, from nmrugg/stockfish.js v18.0.0). Single-threaded means no SharedArrayBuffer, no header changes, and inherent background-friendliness. Measured at **~1.7 Mnps** on an M4 — 600k nodes reaches depth ~18 in ~0.35 s, versus the old build's depth 14 in 1–2 s.
- New `slices/engine/engine-config.js` owns the build registry and a shared `bootUciWorker()` handshake helper. If the primary build fails to boot within 8 s, it **falls back to the legacy build** and reports a different `engineId`.
- Review analysis switches from `go depth 14` to **`go nodes N`** with three quality tiers in `slices/game-review/budgets.js`: Fast 150k, Standard 600k (default), Deep 2.5M nodes/position. Node limits make per-position quality constant and batch time linear in move count.
- Every review stores `engineId` + `nodesPerPos` (tree-level `reviewMeta` for single-game reviews, per-record `review` for library reviews) so results from different engines are never silently aggregated.
- `.wasm → application/wasm` added to the dev server MIME map (Electron already had it).

## Consequences

- Reviews are both faster and more accurate: Standard tier is ~3x faster than the old depth-14 run while searching ~4 plies deeper with a stronger evaluation.
- The eval scale changed: SF16+ normalized centipawns ("+1.00 ≈ 50% win at equal material"), while the Lichess win% constant in `classify.js` (0.00368208) was fitted on older evals. Classification thresholds shift slightly; acceptable for v1 and re-fittable later without touching stored evals.
- Two additional vendor files (~7.3 MB wasm). The legacy 1.5 MB build stays as the runtime fallback.
- The legacy `slices/engine/stockfish-worker.js` shim is dead code (both consumers spawn the vendor file directly) and was left untouched.
