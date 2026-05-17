# ADR-0001: Move tree data model

**Status**: Accepted
**Date**: 2026-05-17
**Supersedes**: implicit linear-history model in `app.jsx`

## Context

The current `App` stores game state as a flat array `history` with a single integer `cursor`. Playing a move from the middle of the line slices the tail and overwrites it (`history.slice(0, cursor + 1)`), destroying any alternative continuation.

This is fundamentally incompatible with how an opening repertoire — and specifically how Simon Williams' *The Iron English* — is structured. A chapter is not a line; it is a tree:

- A **mainline** with branching variations at most opponent decision points.
- **Sub-lines** explored several plies deep, with their own sub-sub-lines.
- **Transpositions** where multiple move orders reach the same position.
- **Author commentary** attached to specific moves, not to "ply 7".

Without a tree, the tool cannot represent the book, cannot let the user explore an alternative without losing the mainline, and cannot answer "have I seen this position before, from a different move order?"

The project constitution names "we should not lose any games stored" as a hard rule. The current model technically satisfies this only because there is one game; it does not generalise.

## Decision

Replace the linear `history` array + integer `cursor` with a **node-keyed move tree** plus a **transposition index**.

### Node schema

```js
{
  id: string,             // uuid; stable across saves
  parentId: string|null,  // null only for root
  ply: number,            // depth from root; root = 0
  state: ChessState,      // position AFTER this node's move (root holds START_STATE)
  san: string|null,       // null only for root
  from: number|null,      // 0..63
  to: number|null,        // 0..63
  captured: string|null,  // piece char or null
  promotion: string|null, // 'q'|'r'|'b'|'n' or null
  childIds: string[],     // ORDER MATTERS — childIds[0] is the mainline
  // study layer (filled lazily; nulls allowed):
  comment: string|null,   // free-text annotation
  nag: number|null,       // 1=!  2=?  3=!!  4=??  5=!?  6=?!  (PGN NAG codes)
  status: 'unseen'|'reviewing'|'known'|null,
  lastSeenAt: number|null,
  reviewCount: number,
}
```

### Tree container

```js
{
  schemaVersion: 2,
  rootId: string,
  nodes: { [id]: Node },        // flat map for O(1) lookup
  byFen: { [fenKey]: string[] } // transposition index → list of nodeIds reaching this position
}
```

`fenKey` is the FEN with halfmove and fullmove clocks stripped, so transpositions are detected regardless of move-order path length. Castling rights and en passant target are preserved in the key because they materially change the position.

### Cursor

```js
const [currentNodeId, setCurrentNodeId] = useState(rootId);
```

Single string replaces the integer cursor. Derived values:

- `currentNode = tree.nodes[currentNodeId]`
- `currentState = currentNode.state`
- `mainlineFromHere = walk childIds[0] until leaf`
- `pathToRoot = walk parentId until null` — used to render the move list

### Mainline convention

The mainline is identified by position, not by a separate field: `childIds[0]` is always the mainline child. This mirrors PGN's convention that the first variation listed is the main continuation, keeps the node schema one field smaller, and makes `promoteToMainline` the single operation that changes mainline status (by reordering `childIds`).

### Mutation operations

All operations return a new tree (immutable update) to keep React reconciliation honest:

| Operation | Signature | Behaviour |
|---|---|---|
| `playMove` | `(tree, fromNodeId, from, to, opts) → {tree, nodeId}` | If a child of `fromNodeId` already has this SAN, return that child's id (no duplicate). Else append a new node. New node becomes a sibling, NOT a replacement. |
| `promoteToMainline` | `(tree, nodeId) → tree` | Walk to root; at each parent, move this branch to `childIds[0]`. |
| `deleteSubtree` | `(tree, nodeId) → tree` | Remove node and all descendants from `nodes` and from `byFen` index. Root is undeleteable. |
| `setComment` | `(tree, nodeId, comment) → tree` | Pure metadata write. |
| `setNag` | `(tree, nodeId, nag) → tree` | Pure metadata write. |
| `markStatus` | `(tree, nodeId, status) → tree` | Updates status + lastSeenAt + reviewCount. |

### Navigation semantics

| Key | Action |
|---|---|
| `←` | parent (if exists) |
| `→` | `childIds[0]` (mainline-first child, if exists) |
| `↑` | previous sibling (cycle within parent.childIds) |
| `↓` | next sibling (cycle within parent.childIds) |
| `Home` | root |
| `End` | walk `childIds[0]` to leaf from current node |

Variations being on `↑/↓` is deliberate. The arrow keys form a 2D map of the tree which matches how a study book reads: down-the-page is depth, across-the-page is "alternative reply."

### Critical: no destructive replacement on side-line play

The current code's `history.slice(0, cursor + 1)` behaviour is the single biggest violation of the "do not lose games stored" rule once a tree exists. The replacement rule is:

> Playing a move from any node **always** results in either (a) navigating to an existing child that already has that SAN, or (b) appending a new child as the last sibling. **Never** overwrite an existing child.

This is enforced inside `playMove` and is the test case in §Validation below.

## Migration from schema v1

Existing localStorage shape (`chess_analysis_session_v1`, `chess_analysis_saves_v1`):

```js
{ history: [{state, san, from, to, captured}, ...], cursor: number, flipped, activeId, activeName, dirty }
```

Migration runs on load if `schemaVersion` is absent or < 2:

1. For each saved line, create a root node from `history[0].state`.
2. Walk `history[1..]`, creating a chain of nodes each as `childIds[0]` of the previous.
3. Build `byFen` index by computing fenKey for every node's state.
4. Write back under new keys `chess_analysis_session_v2` and `chess_analysis_saves_v2`. **Leave v1 keys in place** for one release as a safety net. Add a `New line` UI affordance: "Restore from v1 backup."
5. Tag the migration in console: `console.info('[migration] v1 → v2:', savesCount, 'lines migrated')`.

Linear lines migrate losslessly because they are a degenerate tree (every node has 0 or 1 child).

## Validation

A migration is considered successful only if these assertions hold post-migration, for every saved line:

1. `walkMainline(tree.rootId).length === oldHistory.length` — same depth.
2. For every i, `mainlineWalk[i].san === oldHistory[i].san`.
3. For every i, `stateToFEN(mainlineWalk[i].state) === stateToFEN(oldHistory[i].state)`.
4. For every node, `byFen[fenKeyOf(node.state)].includes(node.id)`.

These run as console assertions in dev, gated behind a `?validate=1` query param.

Plus a unit test (see ADR-0005) covering the "do not replace siblings" rule: given a tree `root → e4 → e5`, calling `playMove(tree, root.id, e2, e4, ...)` returns the existing `e4` node id and leaves `nodes` unchanged in size. Calling `playMove(tree, root.id, d2, d4, ...)` adds `d4` as `root.childIds[1]` and leaves `e4` at `root.childIds[0]`.

## Consequences

### Positive
- Repertoire study becomes possible. The book's actual structure is now representable.
- Transposition detection is O(1) per position.
- Comments and study state attach to positions, not array indices, so they survive tree restructuring.
- The move list becomes a real tree-render (mainline + indented variations) which matches how chess books are typeset.

### Negative / costs
- Move list rendering is more complex. Indented PGN-style rendering is the convention; budget one session for it.
- The save panel's "ply count" becomes ambiguous — display "N nodes / M plies on mainline" instead.
- Backwards compat: one-way migration. Once v2 writes, downgrading the app fails to read. Mitigation: the v1 backup left in localStorage for one release.
- More memory per saved line (a tree of 200 nodes vs a list of 30 plies). Still well under any sane localStorage budget for opening study.

### Neutral
- React state shape changes: `useState({history, cursor})` becomes `useState({tree, currentNodeId})`. Most of `app.jsx`'s callbacks need to be re-pointed but the wiring to slices does not change.

## Out of scope for this ADR

- PGN import/export — see ADR-0003.
- Drill mode that consumes `status` — see ADR-0004.
- Performance pass — see ADR-0002. The tree introduces no new performance hazard if Board/Square are memoized first.
- Per-node engine analysis caching. Engine eval improves as Stockfish updates; persisting it in user data creates staleness. If this is ever revisited, the schema is `{ eval, depth, engineVersion, computedAt }` and the cache must invalidate when the engine version changes.

