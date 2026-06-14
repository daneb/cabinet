# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

- **Start dev server**: `node serve.js` — serves at `http://localhost:8765`, entry point is `OpeningAnalysis.html`
- **No build step**: React 18 and Babel standalone are loaded from CDN; JSX is transpiled in-browser. There is no `package.json`, bundler, or test runner.

## Architecture

A single-page chess opening analysis app ("Cabinet"). Vanilla React with no bundler — all components register on `window` and the HTML loads scripts in dependency order.

**Vertical slices** (loaded in `OpeningAnalysis.html`):

| Slice | Path | Exports |
|-------|------|---------|
| Game core | `slices/game-core/chess.js` | `window.Chess` — board representation, move generation, legality, SAN |
| Board | `slices/board/board.jsx` | `window.ChessBoard` — 8x8 grid rendering, click-to-move |
| Drag | `slices/drag/drag.jsx` | `window.useDragPiece` — drag-and-drop hook |
| Eval bar | `slices/eval-bar/eval-bar.jsx` | `window.EvalBar` — centipawn/mate advantage visualization |
| Engine | `slices/engine/engine.jsx` | `window.useEngine` — Stockfish Web Worker via UCI, MultiPV=3 arrows |
| Move list | `slices/move-list/move-list.jsx` | `window.MoveList` — paired move table with auto-scroll |
| Panel | `slices/panel/panel.jsx` | `window.NavControls`, `window.SavePanel` — VCR nav, named line persistence |
| App | `app.jsx` | `<App>` — thin orchestrator wiring all slices, state in `useState` |

**Chess engine** (`slices/game-core/chess.js`): board is a 64-char string (index 0 = a8). State object holds `{ board, turn, castling, enPassant, halfmove, fullmove }`. Moves are validated through pseudo-legal generation → king-safety legality check. SAN notation with disambiguation and check/mate suffixes. Exposed on `window.Chess`.

**Engine integration** (`slices/engine/engine.jsx`): spawns Stockfish as a Web Worker. Sends `position fen` / `go depth 18` (debounced 150ms). Parses `info` lines for MultiPV (ranks 1–3). Score is negated when black to move so evaluation is always from white's perspective. SVGs arrows are drawn on the board for the top 3 engine lines.

**State management**: all state lives in `App` via `useState`. History is an array of `{ state, san, from, to, captured }`. Cursor tracks position in the line. Auto-persists to `localStorage` under `chess_analysis_session_v1`. Named saves use `chess_analysis_saves_v1`.

**Note**: Some root-level files (`chess.js`, `board.jsx`, `panel.jsx`) appear to be older copies. The canonical sources are in `slices/`. The HTML entry point loads from `slices/`. Root `chess.js` is missing `stateToFEN` and `sq` that exist in the slices copy and are used by `app.jsx` and `engine.jsx` — do not edit it as the canonical source.

## ADRs and releasing

ADRs live in `docs/adrs/`. They are the source of truth for release notes.

**When to write an ADR**: any feature, architectural change, or non-obvious fix that a user or future developer would benefit from understanding in context. Small cosmetic fixes do not need one. When in doubt, write one — they are cheap and the release script uses them.

**ADR naming**: `NNNN-short-kebab-title.md` where `NNNN` is the next sequential number. Copy the structure from an existing ADR (Status, Date, Context, Decision, Consequences).

**Before running `./scripts/release.sh`**:
1. All ADRs for changes in this release must be written and committed.
2. Each ADR should have `**Status**: Accepted` and a `**Date**` matching today.
3. The release script detects ADRs added or modified since the previous tag and uses their `## Context` and `## Decision` sections as the human-readable release notes body. Conventional commits fill in anything not covered by an ADR.
