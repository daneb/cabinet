# Spec: Patterns slice — replayable checkmate patterns (v1)

**Status**: Draft for review
**Date**: 2026-07-22
**Related**: ADR-0004 (drill mode), ADR-0001 (move tree)

## Goal

A built-in, curated library of classical checkmate patterns (Boden's Mate, Anastasia's
Mate, …) that the user can load onto the board, step through, and drill from memory —
to train pattern recognition. The schema and slice are deliberately shaped so that
opening patterns, middlegame strategies, and technical endgames can be added later as
new categories without structural change.

## Scope (v1)

- **In**: 25 canonical checkmate patterns, one clean example each; browse panel;
  load onto board; step through with existing navigation; drill via existing drill
  mode; engine-verifiable positions; full test coverage of the dataset.
- **Out (future)**: multiple exercises per pattern, opening/middlegame/endgame
  categories (schema-ready, no content), per-pattern progress persistence,
  "name that pattern" quiz mode, spaced repetition across patterns.

## The 25 patterns

| # | Pattern | Core idea |
|---|---------|-----------|
| 1 | Back-rank mate | Rook/queen mates on the 8th behind an unmoved pawn shield |
| 2 | Smothered mate (Philidor's Legacy) | Knight mates a king boxed in by its own pieces; Qg8+! deflection |
| 3 | Anastasia's mate | Knight on e7 + rook on the h-file trap the castled king |
| 4 | Boden's mate | Two bishops on criss-crossing diagonals vs a queenside-castled king |
| 5 | Arabian mate | Knight + rook cooperate in the corner |
| 6 | Anderssen's mate | Rook/queen mates on h8 supported by a pawn/bishop on g7 |
| 7 | Opera mate | Rook mates on the back rank supported by a bishop (Morphy, Opera Game) |
| 8 | Epaulette mate | King flanked by its own rooks; queen mates from the front |
| 9 | Dovetail mate | Queen adjacent to king; the two flight squares are occupied by friendly pieces |
| 10 | Swallow's-tail mate | Queen mates a king whose retreat squares are blocked by its own rooks |
| 11 | Hook mate | Rook + knight + pawn form the "hook" |
| 12 | Ladder mate | Two heavy pieces walk the king to the edge rank by rank |
| 13 | Légal's mate | Queen-sac miniature; minor pieces mate (Légal–Saint Brie) |
| 14 | Blackburne's mate | Two bishops + knight vs the castled king |
| 15 | Damiano's mate | Queen mates on h7/h8 supported by a pawn on g6 |
| 16 | Lolli's mate | Pawn on f6 + queen infiltration on g7 |
| 17 | Pillsbury's mate | Rook on the open g-file + bishop on the long diagonal |
| 18 | Morphy's mate | Bishop on the long diagonal + rook on the g-file, king in the corner |
| 19 | Réti's mate | Bishop mates a king trapped by its own pieces after a queen decoy |
| 20 | Greco's mate | Bishop cuts the diagonal; queen/rook mates on the h-file |
| 21 | Corner mate | Knight mates the cornered king, rook covers the file |
| 22 | Vuković mate | Rook mates the king frontally, protected by a knight/pawn |
| 23 | Suffocation mate | Knight mates; bishop pins/covers the escape diagonal |
| 24 | Blind swine mate | Two rooks on the 7th rank grind out mate in the corner |
| 25 | Scholar's mate | Qxf7# supported by the bishop — the classic beginner trap |

Each entry carries a **famous-game citation** where a well-known one exists (e.g.
Schulder–Boden 1853, Morphy's Opera Game 1858, Réti–Tartakower 1910); otherwise a
clean constructed position. Positions and lines are authored from chess knowledge
and **verified mechanically by the test suite** (see Testing) — every line must be
legal under `slices/game-core/chess.js` and every mate must be a real checkmate.

## Data model

New slice `slices/patterns/`, following the vertical-slice conventions
(registered by ES import in `app.jsx`, exports on `window`).

### `slices/patterns/patterns-data.js` — pure module, `window.Patterns`

```js
{
  id: 'bodens-mate',            // unique kebab-case, stable
  name: "Boden's Mate",
  category: 'mate',             // future: 'endgame' | 'opening' | 'middlegame'
  fen: '...',                   // start position; omitted later for opening patterns
  sideToWin: 'w',               // must equal FEN side-to-move
  line: ['Qxc6+', 'bxc6', 'Ba6#'],  // SAN mainline incl. defender replies; ends in '#'
  description: '1–2 sentences: the geometry to recognize and why it works.',
  source: { players: 'Schulder–Boden', year: 1853 } | null,
}
```

Exports:

- `PATTERNS` — the array (v1: 25 entries, all `category: 'mate'`).
- `CATEGORIES` — ordered list of `{ id, label }` for grouping in the panel.
- `buildTree(pattern)` — pure helper: `MoveTree.createTree(Chess.fromFEN(fen))`,
  then fold the SAN line through `Chess.parseSAN` + `MoveTree.playMove`.
  Returns `{ tree, error }`; the root node's `comment` is set to the description
  so it travels with the tree.

No persistence, no server/API change (data ships in the bundle), therefore **no
`serve.js`/`electron/main.cjs` edits** — avoids the dual-maintenance hazard.

### `slices/patterns/patterns-panel.jsx` — `window.PatternsPanel`

Props: `{ onOpenPattern(tree, pattern), onDrillPattern(tree, pattern), showToast }`.

- Collapsible list grouped by category (v1: single "Checkmate patterns" group),
  matching the visual language of `LibraryPanel` (`panel-section`, `section-label`,
  `save-item` rows).
- Each row: pattern name, one-line description (truncated), source citation,
  and two actions: **View** and **Drill**.
- Rendered as a third `board-card` in `.board-extras`, alongside Library and
  Insights (they are siblings in spirit: study tools under the board).

## App wiring (`app.jsx`)

- Import the two slice files.
- `handleOpenPattern(tree, pattern)` — mirrors `handleOpenLibraryGame`: dirty-check,
  set tree/cursor at root, clear selection, set `activeName` to the pattern name,
  and **auto-flip** the board when `sideToWin === 'b'` so the winning side is at
  the bottom.
- `handleDrillPattern(tree, pattern)` — open as above, then
  `startDrill(tree.rootId, pattern.sideToWin, 'mainline')`. The existing drill
  state machine already auto-plays the defender's replies (mainline child) and
  scores the user's moves; no drill changes are required.

## Testing (`tests/patterns/patterns-data.test.js`)

Dataset-validation suite run by `npm test` — this is the correctness gate for the
hand-authored content. For every pattern:

1. `id` unique; exactly 25 entries; required fields present.
2. FEN parses via `Chess.fromFEN`; both kings on the board; FEN side-to-move
   equals `sideToWin`; the side **not** to move is not in check.
3. Replay the line: each SAN resolves via `Chess.parseSAN` to exactly one legal
   move, and `Chess.toSAN` round-trips to the same string (guarantees correct
   disambiguation/check/mate suffixes).
4. Last SAN ends in `#`; in the final state the loser is in check with zero legal
   moves (true checkmate); no earlier move ends in `#`.
5. `buildTree` returns no error and its mainline depth equals `line.length`.

## ADR + docs

- ADR `0016-patterns-slice.md` (Status: Accepted, dated) — feeds release notes.
- Add the Patterns slice row to the CLAUDE.md architecture table.

## Build / release

`node build.cjs` after wiring; no MIME/API surface changes. Version bump and
`./scripts/release.sh` per the usual flow (not part of this change unless asked).

## Open questions for review

1. **Panel placement** — spec proposes a third card under the board
   (next to Library/Insights). Alternative: a section in the right-hand aside.
2. **Drill entry strictness** — `'mainline'` chosen since a pattern has one
   correct line; `'any'` would be meaningless with no variations.
3. Scholar's mate is included for completeness (it is the one "opening-trap"
   flavored entry); happy to swap it for Max Lange's mate or Mayet's mate if you
   want strictly middlegame/endgame mating nets.
