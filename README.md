# Cabinet — Opening Repertoire Study Tool

A single-page chess tool for studying opening repertoires from memory. Load a PGN (like Simon Williams' *The Iron English*), browse the move tree with variations, drill lines from memory, and track what you know.

## Features

- **Move tree** — branching variations with mainline navigation. Arrow keys walk the tree: ←/→ for depth, ↑/↓ for sibling variations.
- **PGN import/export** — parse and serialize PGN with full variation, NAG, and comment support. Round-trip preserves headers.
- **Drill mode** — play the repertoire from memory. Correct moves advance; misses show the expected move after a brief pause. Summary shows percentage and per-miss breakdown.
- **Study tracking** — per-node status (unseen / reviewing / known) with automatic decay. Status badges in the move list.
- **Chapter panel** — PGN comments like `{Chapter: The King's English}` tag nodes. Chapter listing shows aggregate stats with quick-drill buttons.
- **Engine analysis** — Stockfish 16 via Web Worker. MultiPV=3 with arrows on the board.

## Usage

### Start the dev server

```bash
npm run build    # bundle with esbuild
npm run dev      # build + watch + serve at http://localhost:8765
```

Then open `http://localhost:8765/OpeningAnalysis.html`.

### Load a repertoire

1. Click **Import PGN** in the top bar.
2. Paste a PGN string and click Import.
3. The move list populates with the full tree.

### Browse the tree

- **← / →** — step backward / forward on the mainline
- **↑ / ↓** — cycle through sibling variations
- **Home / End** — go to root / walk to end of mainline
- **F** — flip board
- **Click a move** in the move list — jump to that position

### Drill from memory

- Click **Start Drill** in the top bar, or right-click any move → **Drill from here**.
- Play moves on the board from memory.
- On a miss, the expected move is revealed after 5 seconds (or press **?** for hint).
- Press **Esc** to end the drill early.
- A summary shows your score and lists every miss.

### Save and organize

- **Save** names the current line. Saved lines persist in localStorage.
- PGN comments starting with `Chapter:` or `Section:` create chapter entries in the sidebar.
- Click a chapter to jump there; click **Drill** on a chapter to drill it.

## Running tests

```bash
npm test              # all suites
npm run test:perft    # perft at depth 3–4 (slower)
```

### Test suites

| Suite | File | Tests |
|-------|------|-------|
| Game core — perft | `tests/game-core/perft.test.js` | 10 |
| Game core — apply-move | `tests/game-core/apply-move.test.js` | 13 |
| Game core — FEN | `tests/game-core/fen.test.js` | 7 |
| Game core — SAN | `tests/game-core/san.test.js` | 12 |
| Move tree | `tests/move-tree/move-tree.test.js` | 30 |
| PGN | `tests/pgn/pgn.test.js` | 24 |

## Architecture

Cabinet is a **zero-dependency frontend**. React 18 and Babel standalone load from CDN; esbuild bundles application code. There is no build step beyond esbuild, no framework, and no backend.

```
slices/
├── game-core/chess.js     # Board, move generation, legality, SAN, FEN, parseSAN
├── move-tree/move-tree.js # Node-keyed tree, transposition index, study state
├── board/board.jsx        # 8×8 grid rendering, click-to-move
├── drag/drag.jsx          # Drag-and-drop hook
├── eval-bar/eval-bar.jsx  # Centipawn/mate evaluation bar
├── engine/engine.jsx      # Stockfish Web Worker, MultiPV arrows
├── move-list/move-list.jsx # Tree-formatted indent PGN-style move list
├── panel/panel.jsx        # Nav controls, save/load panel
├── pgn/pgn.js             # PGN parser, serializer, chapter tag import
├── drill/drill.jsx        # Drill mode hook + UI components
app.jsx                    # Thin orchestrator, all state in useState
OpeningAnalysis.html       # Entry point
```

State lives in `App` via `useState`: a move tree (`tree` + `currentNodeId`) replaces the old linear history array. The board, eval bar, engine, move list, and panel are all pure components that receive state as props.

### Data model

A **node** is an immutable object with:
- Position data: `id`, `parentId`, `ply`, `state`, `san`, `from`, `to`, `captured`, `promotion`
- Tree structure: `childIds[]` — order matters; `childIds[0]` is the mainline
- Study metadata: `status`, `lastSeenAt`, `lastDrilledAt`, `reviewCount`, `tags`
- Annotation: `comment`, `nag`

The **tree** container holds `{ schemaVersion, rootId, nodes: { [id]: node }, byFen: { [fenKey]: ids[] } }`. Transpositions are detected by FEN key (stripped of halfmove/fullmove clocks).

All mutations return a new tree (immutable updates) to keep React reconciliation honest.

### Persistence

- localStorage keys: `chess_analysis_saves_v2`, `chess_analysis_session_v2`
- v1 data (linear history) is migrated losslessly on first load
- Study state lives in the same tree blob — deleting a saved line deletes its study history

## Design decisions

See `docs/adrs/` for the full record:

| ADR | Status | Summary |
|-----|--------|---------|
| 0000 | Active | Plan: from analysis board to repertoire study tool |
| 0001 | Accepted | Move tree data model |
| 0002 | Accepted | Performance pass (esbuild, memo) |
| 0003 | Accepted | PGN import/export |
| 0004 | Accepted | Study state and drill mode |
| 0005 | Accepted | Test harness |
| 0006 | Accepted | Disk-backed persistence store |

## License

Private.
