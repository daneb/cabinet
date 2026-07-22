# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

- **Build**: `node build.cjs` — esbuild bundles `app.jsx` (and every slice it imports) into `dist/bundle.js`. Rebuild after any source change.
- **Start dev server**: `node serve.js` — serves at `http://localhost:8765`, entry point is `OpeningAnalysis.html` (loads React from CDN + `dist/bundle.js`).
- **Tests**: `npm test` runs `node --test 'tests/**/*.test.js'`. Pure modules (game-core, move-tree, pgn, game-review, insights) have suites; ship tests with new pure modules.
- **Electron**: the app also ships as "Cabinet" via `electron/main.cjs`, which embeds a near-duplicate of `serve.js`'s static+API server — **API/MIME changes must be made in both files**.

## Architecture

A single-page chess opening analysis app ("Cabinet"). Vanilla React; slices export on `window` and are registered by **ES imports at the top of `app.jsx`** (not HTML script tags). Web Workers are the exception: engine files under `slices/engine/vendor/` are loaded by URL at runtime, outside the bundle.

**Vertical slices** (imported in `app.jsx`):

| Slice | Path | Exports |
|-------|------|---------|
| Game core | `slices/game-core/chess.js` | `window.Chess` — board representation, move generation, legality, SAN |
| Move tree | `slices/move-tree/move-tree.js` | `window.MoveTree` — tree model, mainline walk, review annotations |
| Board | `slices/board/board.jsx` | `window.ChessBoard` — 8x8 grid rendering, click-to-move |
| Drag | `slices/drag/drag.jsx` | `window.useDragPiece` — drag-and-drop hook |
| Eval bar | `slices/eval-bar/eval-bar.jsx` | `window.EvalBar` — centipawn/mate advantage visualization |
| Engine | `slices/engine/engine.jsx`, `engine-config.js` | `window.useEngine`, `window.EngineConfig` — live analysis (MultiPV=3 arrows); shared UCI worker boot with legacy-build fallback |
| Move list | `slices/move-list/move-list.jsx` | `window.MoveList` — paired move table with auto-scroll |
| Panel | `slices/panel/panel.jsx` | `window.NavControls`, `window.SavePanel` — VCR nav, named line persistence |
| PGN | `slices/pgn/pgn.js` | `window.PGN` — `parse`, `parseAll`/`splitGames` (multi-game), `serialize` |
| Drill | `slices/drill/drill.jsx` | drill mode |
| Game review | `slices/game-review/` | `window.GameReviewClassify` (win-pct classification), `window.GameReviewFeatures` (phase/situation/motif tagging), `window.GameReviewElo` (ACPL→rating band), `window.ReviewBudgets` (node-budget tiers), `window.useReviewWorker`, `window.useBatchReview`, `window.GameReviewPanel` |
| Library | `slices/library/` | `window.GameLibrary` (store + settings), `window.LibraryPanel` — multi-game import, user side, batch review |
| Insights | `slices/insights/` | `window.Insights` (cross-game aggregation), `window.InsightsCoach` (optional Ollama narration), `window.InsightsPanel` |
| Patterns | `slices/patterns/` | `window.Patterns` (curated checkmate-pattern dataset + `buildTree`), `window.PatternsPanel` — view/drill classical mating patterns; `category` extends to openings/middlegame later |
| App | `app.jsx` | `<App>` — thin orchestrator wiring all slices, state in `useState` |

**Chess engine** (`slices/game-core/chess.js`): board is a 64-char string (index 0 = a8). State object holds `{ board, turn, castling, enPassant, halfmove, fullmove }`. Moves are validated through pseudo-legal generation → king-safety legality check. SAN notation with disambiguation and check/mate suffixes.

**Stockfish integration**: primary build is Stockfish 18 lite single-threaded WASM (`slices/engine/vendor/stockfish-18-lite-single.js` + `.wasm`); the legacy 1.5 MB build remains as a boot fallback (see `engine-config.js` and ADR-0012). Live analysis: MultiPV=3, `go depth 14`, 300 ms debounce, score normalized to White's perspective. Game review: a second worker, MultiPV=1, **node-limited** search via quality tiers (`slices/game-review/budgets.js`). Reviews record `engineId` + `nodesPerPos`; never aggregate across engine builds.

**State management**: all state lives in `App` via `useState`. Session persists to localStorage `chess_analysis_session_v2`; named saves `chess_analysis_saves_v2` (+ disk via `/api/saves`); game library `chess_review_library_v1` (+ disk via `/api/library`); review settings `chess_review_settings_v1`.

**Note**: Some root-level files (`chess.js`, `board.jsx`, `panel.jsx`) are older copies. The canonical sources are in `slices/`. Do not edit root copies.

## ADRs and releasing

ADRs live in `docs/adrs/`. They are the source of truth for release notes.

**When to write an ADR**: any feature, architectural change, or non-obvious fix that a user or future developer would benefit from understanding in context. Small cosmetic fixes do not need one. When in doubt, write one — they are cheap and the release script uses them.

**ADR naming**: `NNNN-short-kebab-title.md` where `NNNN` is the next sequential number. Copy the structure from an existing ADR (Status, Date, Context, Decision, Consequences).

**Before running `./scripts/release.sh`**:
1. All ADRs for changes in this release must be written and committed.
2. Each ADR should have `**Status**: Accepted` and a `**Date**` matching today.
3. The release script detects ADRs added or modified since the previous tag and uses their `## Context` and `## Decision` sections as the human-readable release notes body. Conventional commits fill in anything not covered by an ADR.
