# ADR-0013: Game Library — multi-game PGN, player identity, batch review

**Status**: Accepted
**Date**: 2026-07-04

## Context

ADR-0003 deliberately parsed only the first game of a multi-game PGN, and ADR-0011 listed player identity as a non-goal. Both decisions are revisited here because the user's goal changed: finding **consistent errors across many of their own games** requires (a) getting many games into the app at once, (b) knowing which side the user played in each, and (c) reviewing them all without babysitting.

Games come from local PGN files and games played in-app. Storage had to respect localStorage limits — a reviewed move-tree in JSON is 10–20x larger than its PGN text.

## Decision

- **`PGN.parseAll(text)`** splits multi-game files into per-game chunks *before* parsing (a tag-pair line following movetext starts a new game). Splitting first matters: `extractHeaders` scans whole text, so parsing an unsplit file would merge every game's headers.
- New **`slices/library/`** slice. `library.js` is a pure store (`window.GameLibrary`): records hold `{ id, name, headers, pgn (text, not tree JSON), userSide, review }`. Persistence mirrors the saves store — localStorage key `chess_review_library_v1` plus a best-effort disk mirror via new `GET/POST /api/library` endpoints in both `serve.js` and `electron/main.cjs` (`data/library.json`).
- **Player identity** is a settings list of names (`chess_review_settings_v1`). Side inference is case-insensitive substring match against the White/Black headers; ambiguous games get a manual W/B toggle per record. Committing names re-infers sides for unresolved records.
- **Batch review** (`slices/game-review/batch.js`, `useBatchReview`): iterates selected records sequentially through the *same* review worker the Game Review panel uses (the hook was lifted to `App` and passed down, so both UIs share one engine and disable together). Two-level progress (game i/N, move j/M), cancel between positions, and skip-if-already-reviewed at the same `engineId` + node budget.
- The analyzer now also captures each position's **`bestmove`** (it already arrived and was discarded) — free input for motif detection (ADR-0014).

## Consequences

- A 20-game PGN dump imports in one paste and reviews unattended in ~10 minutes at Standard tier, on one thread.
- Reviewed records are ~10–15 KB each; 200 games ≈ 2–3 MB, comfortably inside localStorage, and the disk mirror removes the ceiling entirely.
- One review engine means a batch and a single-game review cannot run simultaneously — an intentional simplification that also caps CPU use at one core.
- Library records are independent of the saved-lines store; a game can exist in both without interaction.
