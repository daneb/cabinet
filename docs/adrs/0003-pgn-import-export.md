# ADR-0003: PGN import / export

**Status**: Proposed
**Date**: 2026-05-17
**Depends on**: ADR-0001 (move tree)

## Context

The primary use case for this tool is studying *The Iron English* by Simon Williams. Williams' book — like every modern opening monograph — is structured as a mainline with deep variation trees. The content already exists in PGN form: Chessable courses, Lichess studies, and various community transcriptions of the book are all in or near PGN. **Retyping moves into the board is a non-starter.** It is slow, error-prone, and the friction will make the tool worse than a paper book.

PGN (Portable Game Notation) is the lingua franca. It encodes:

- SAN move sequences
- **RAVs** (Recursive Annotation Variations) in parentheses — exactly maps to ADR-0001's child siblings
- **NAGs** (Numeric Annotation Glyphs) `$1`–`$255` — maps to the `nag` field on a node
- **Comments** `{ ... }` — maps to the `comment` field on a node
- **Headers** `[Event "..."] [White "..."] ...` — metadata for the line

A typical Iron English chapter excerpt in PGN looks roughly like:

```
1. c4 e5 (1... c5 2. Nc3 Nc6 3. g3 {transposes to the Symmetrical}) 2. Nc3 Nf6
3. g3 d5 4. cxd5 Nxd5 5. Bg2 Nb6 $14 {Williams: White has a small but clear edge}
```

The RAV on move 1 black is the sub-line; the NAG `$14` is "small advantage to White"; the brace comment is Williams' prose. This maps 1:1 onto our node schema:

- Each SAN token → a new child node, appended (not replacing) any existing sibling.
- Open paren → push a "variation context" pointing at the parent of the current node.
- Close paren → pop, resume from where the variation started's parent.
- NAG → set `currentNode.nag`.
- Brace comment → set `currentNode.comment`.

Without PGN import, ADR-0001 is a beautiful data model with no content in it.

## Decision

Implement a PGN parser that emits a move tree (per ADR-0001) and an exporter that serialises one back. Ship them as a new slice: `slices/pgn/pgn.js` exposing `window.PGN = { parse, serialize }`.

### Parse — function signature

```js
PGN.parse(text, opts?) → { tree, headers, warnings }
```

- `text`: raw PGN string. May contain multiple games separated by blank lines; for v1 we parse **only the first game** and emit a warning if more are present. Multi-game support is a follow-up.
- `opts.allowIllegal`: default `false`. If true, illegal moves abort the line but do not throw; they emit a warning and stop parsing further moves.
- `tree`: a fully built `MoveTree` per ADR-0001, including `byFen` index.
- `headers`: `{ Event, Site, Date, White, Black, Result, ... }` — preserved as-is, attached to root node's metadata.
- `warnings`: `string[]` — non-fatal issues (unknown NAG, missing header, comment with unbalanced braces, etc).

### Parse — algorithm

A small hand-written tokenizer is sufficient. PGN is regular enough that a parser combinator or full grammar is overkill.

1. **Strip headers**: lines starting with `[` until the first blank line. Parse as `[Name "Value"]` pairs.
2. **Tokenize the movetext** into a stream of:
   - `MOVE_NUMBER` (`1.`, `1...`)
   - `SAN` (`e4`, `Nbd2`, `O-O-O`, `e8=Q+`)
   - `NAG` (`$14`, or shorthand `!`, `?`, `!!`, `??`, `!?`, `?!` immediately after a SAN)
   - `LPAREN` `(`
   - `RPAREN` `)`
   - `COMMENT` `{...}` — braces don't nest in standard PGN
   - `RESULT` (`1-0`, `0-1`, `1/2-1/2`, `*`)
3. **Walk the token stream** with a stack:

```
let current = tree.rootId
let stack = []  // stack of "where to return to on RPAREN"

for each token:
  case SAN:
    parse SAN against state of `current`
    if a child of `current` already has this SAN → current = that child (transposition within the PGN)
    else → append new child, current = new child
  case NAG:
    tree.nodes[current].nag = nagCode
  case COMMENT:
    tree.nodes[current].comment = text
  case LPAREN:
    // a variation begins. PGN variations are alternatives to the move JUST played.
    // So we rewind one ply: the alternative is a sibling of `current`, child of `current`'s parent.
    stack.push(current)
    current = tree.nodes[current].parentId  // rewind
  case RPAREN:
    current = stack.pop()  // resume at the node we were at when the variation began
  case RESULT:
    headers.Result = token; stop parsing.
```

This handles arbitrarily nested variations because the stack is implicit-depth.

### SAN parsing — reuse `Chess.toSAN`?

We have `Chess.toSAN(state, from, to)` but not the inverse. Need a new `Chess.parseSAN(state, san) → {from, to, promotion}` that:

1. Determines piece type from leading letter (or pawn if leading is a-h).
2. Handles `O-O` / `O-O-O` directly.
3. Strips trailing `+`, `#`, `!`, `?`.
4. Extracts promotion (`=Q`).
5. Parses optional disambiguation file/rank between piece letter and destination.
6. Generates all legal moves matching piece type + destination + disambiguation; expects exactly one match.

This is ~80 lines and belongs in `slices/game-core/chess.js` (next to `toSAN`). Co-locating keeps the SAN dialect consistent between writer and reader.

### Serialize — function signature

```js
PGN.serialize(tree, opts?) → string
```

- `opts.headers`: object of header pairs to emit. Default `{ Event: "Cabinet analysis", Date: today, Result: "*" }`.
- `opts.includeComments`: default `true`.
- `opts.includeNags`: default `true`.
- `opts.lineWidth`: default 80; wrap at word boundaries.

### Serialize — algorithm

Recursive walk from root:

```
function emit(node):
  if node.san is null:  # root
    for each child in childIds: emit(child)
    return
  write move number if needed (white-to-move or first move after a variation)
  write node.san
  if node.nag: write ' $' + node.nag
  if node.comment: write ' {' + node.comment + '}'
  # mainline first child:
  if childIds.length > 0:
    # variations (siblings of childIds[0]) come BEFORE recursing into mainline
    for sibling in childIds[1..]:
      write ' ('
      emit(sibling)
      write ')'
    emit(childIds[0])
```

Standard PGN convention: variations are written inline after the move they're alternatives to, before continuing the mainline. The recursive walk produces this naturally because each node writes its own move, then its variation siblings, then recurses into mainline.

### UI surface

Two buttons in the save panel, beside the existing Save/Load:

- **Import PGN** — opens a textarea modal; on submit, parses and replaces the current tree (with a "discard current?" guard if `dirty`).
- **Export PGN** — copies serialized PGN to clipboard, shows toast.

A v1.1 addition: drag-and-drop a `.pgn` file onto the board to import.

## Validation

Round-trip property: for every saved line in the test corpus,

```
PGN.parse(PGN.serialize(tree)).tree
```

must produce a tree structurally equal to the original (same nodes, same parent-child relationships, same SAN at every node, same comments, same NAGs). FEN equality on every node is the stronger check and the one the test asserts.

Test corpus (committed under `tests/pgn-corpus/`):

1. **A bare game** — `1. e4 e5 2. Nf3 *` — smoke test.
2. **A game with one variation** — `1. c4 e5 (1... c5) 2. Nc3 *` — proves LPAREN/RPAREN rewinds correctly.
3. **Nested variations 3 deep** — proves the stack works.
4. **A real Iron English line** — taken from a public Lichess study of the English Opening (cite the source). Proves the parser handles real-world quirks.
5. **A game with NAGs in both shorthand (`!?`) and numeric (`$14`) forms** — proves NAG normalization.
6. **A game with multi-line comments and braces containing periods** — proves comment tokenization isn't fooled by move-number-looking content inside `{}`.

Each corpus file is a `.pgn` paired with a `.expected.json` snapshot of the resulting tree.

## Consequences

### Positive
- Williams' book becomes loadable in minutes, not hours.
- Lichess studies, Chessable export, ChessBase output all become consumable.
- Sharing analysis with another human becomes possible (export PGN, paste in Discord).
- The tree model gets exercise from real-world content immediately, surfacing edge cases.

### Negative
- SAN parser is the highest-risk piece of new code. A subtly wrong parser silently produces wrong positions; the user finds out three moves later when nothing makes sense. Mitigation: the round-trip test, and `parseSAN` always cross-checks against `legalTargetsFrom` of the current state — never trust the SAN, derive the move from legality.
- PGN has dialects. ChessBase emits non-standard glyphs; Chessable wraps lines in HTML before export. v1 targets clean PGN; document this and add normalisations as real-world inputs reveal them.
- Multi-game PGN files (entire tournament databases) are out of scope for v1 and we should fail loudly rather than silently parsing only the first.

### Neutral
- Adds ~400 LOC across `slices/pgn/pgn.js` and additions to `slices/game-core/chess.js`. No new runtime dependencies.

## Open questions

1. **Should comments on the root node be supported (PGN allows a "game comment" before move 1)?** Yes; store on `tree.nodes[rootId].comment` and serialize before the first move.
2. **Should we preserve unknown headers we don't use, so export is lossless?** Yes — store on a `tree.headers` field rather than discarding. Round-trip purity matters more than schema purity.
3. **Should the importer attempt to merge into an existing tree instead of replacing?** Tempting (you could import several Lichess study chapters into one repertoire). Deferred; v1 replaces, v1.1 adds merge-mode. Merge requires deduplication on `fenKey` which is non-trivial UX.

## Out of scope

- FEN-only import (paste a position, start analyzing). Useful but a different feature.
- ChessBase `.cbh` files, polyglot opening books, EPD test suites. PGN is the goal.
- Export to image / animated GIF / annotated diagram. Different problem.
