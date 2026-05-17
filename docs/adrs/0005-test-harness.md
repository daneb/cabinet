# ADR-0005: Test harness for game-core

**Status**: Proposed
**Date**: 2026-05-17
**Depends on**: ADR-0002 (build step makes node-based tests possible)

## Context

`slices/game-core/chess.js` is the most-trusted file in the codebase. Every position the user sees, every move they make, every FEN sent to Stockfish, every PGN parsed (ADR-0003), and every drill grading (ADR-0004) goes through it. It currently has **zero tests**.

This is acceptable while the file is small, working, and stable. It will not remain so:

- ADR-0001 adds a transposition index that depends on `stateToFEN` being deterministic and equivalent for equal positions reached by different paths.
- ADR-0002 step 5 proposes replacing the string board with `Uint8Array`. That is a diff across every function in the file. **Doing it without tests is reckless.**
- ADR-0003 adds `parseSAN`, which is the inverse of `toSAN`. The two must agree round-trip on every legal move.

The constitution's hard rule "we should not lose any games stored" extends past localStorage. A subtly broken `applyMove` corrupts the position object inside every saved tree, and the user discovers it three weeks later when the engine starts giving advice for the wrong board.

A test harness is cheap insurance — under one session of work, paid back the first time a refactor stays correct because the tests caught a regression.

## Decision

Add a test runner using **Node's built-in `node:test`** module. No additional dependency. Tests live under `tests/`, run via `npm test`, and execute against the source files directly using ES modules.

### Why `node:test` and not Jest / Vitest

- Already shipped with Node 18+. Zero new dependencies — preserves the security-conscious posture the codebase aims for.
- Native ESM support; works with esbuild output or source directly.
- Familiar `describe` / `it` / `assert` API.
- Fast startup; suite of a few hundred assertions runs in <1s.

### Structure

```
tests/
  game-core/
    move-generation.test.js     # legal target enumeration, edge cases
    apply-move.test.js          # state after move, including castling/EP/promotion
    san.test.js                 # toSAN output for tricky positions
    parse-san.test.js           # parseSAN round-trip (added in ADR-0003)
    perft.test.js               # node-count tests vs. known perft values
    fen.test.js                 # stateToFEN, future fromFEN
  tree/
    play-move.test.js           # ADR-0001 sibling-append behaviour
    transposition.test.js       # byFen index correctness
    migration.test.js           # v1 → v2 migration validity
  pgn/
    parse.test.js               # corpus round-trips (added in ADR-0003)
    serialize.test.js
  fixtures/
    positions.js                # named FEN strings used across tests
    pgn-corpus/                 # .pgn files + .expected.json snapshots
```

### Critical test categories

**1. Perft (performance test / move generation correctness)**

The single most valuable chess test. From a known position, count the number of legal move sequences of depth N and compare against published values. A miscounted perft means the engine is generating illegal moves, missing legal ones, or mishandling castling/EP/promotion. Five canonical positions cover almost every edge case:

| Position | Depth 1 | Depth 2 | Depth 3 | Depth 4 |
|---|---|---|---|---|
| Start position | 20 | 400 | 8902 | 197 281 |
| Kiwipete | 48 | 2039 | 97 862 | 4 085 603 |
| Position 3 (endgame) | 14 | 191 | 2812 | 43 238 |
| Position 4 | 6 | 264 | 9467 | 422 333 |
| Position 5 | 44 | 1486 | 62 379 | 2 103 487 |

(FENs for these are on chessprogramming.org's "Perft Results" page; commit them under `tests/fixtures/positions.js`.)

Depth 4 takes several seconds per position with the current string-board implementation; gate it behind `PERFT_DEEP=1` env var so the default `npm test` runs fast (depth 2 across all five) and CI / pre-refactor runs deep.

A passing perft suite is **the bar** for declaring `chess.js` correct. Nothing else exercises the engine as completely.

**2. SAN round-trip**

For every legal move from every position in `tests/fixtures/positions.js`:

```
const san = Chess.toSAN(state, from, to)
const parsed = Chess.parseSAN(state, san)
assert.equal(parsed.from, from)
assert.equal(parsed.to, to)
```

Catches disambiguation bugs and the entire class of "the parser and writer disagree" defects.

**3. State after move**

A handful of hand-built scenarios where the resulting state is non-obvious:

- White castles kingside; assert king on g1, rook on f1, castling rights = `kq`.
- Black plays e7-e5; assert `enPassant === fromName('e6')`, turn = `w`, fullmove = 2.
- White plays exd6 en passant; assert d-pawn removed, no captured piece on the target square.
- Pawn promotes to knight; assert piece is `N`, not the default `Q`.
- Move that captures a rook on its home square; assert castling right on that side is gone.

**4. Tree invariants (ADR-0001)**

- After `playMove`, `tree.nodes[newId].parentId` is the from-node and `tree.nodes[fromNodeId].childIds` includes `newId`.
- Playing an existing SAN does not create a duplicate child.
- Playing a new SAN from a node with one existing child appends as `childIds[1]`, NOT replacing `childIds[0]`. **This is the regression test for the bug we are explicitly fixing in ADR-0001.**
- `byFen[fenKeyOf(node.state)]` includes `node.id` for every node in the tree.
- Migration: synthetic v1 save → migrate → assert the four validation conditions from ADR-0001 §Validation.

**5. PGN round-trip (ADR-0003)**

For each fixture under `pgn-corpus/`:

```
const { tree } = PGN.parse(text)
const text2 = PGN.serialize(tree)
const { tree: tree2 } = PGN.parse(text2)
assert.deepEqual(treeShape(tree), treeShape(tree2))
```

Where `treeShape` extracts a normalized comparable form (skip ids, compare structure + SANs + comments + NAGs).

### Module shape

For tests to import the source, the slices must be importable as modules. ADR-0002 step 1 adds the build step but `window.X = ...` registration remains. The cheapest accommodation:

```js
// slices/game-core/chess.js — at end of file
const Chess = { START_STATE, ..., stateToFEN };
if (typeof window !== 'undefined') window.Chess = Chess;
export default Chess;            // for tests
export { Chess };                 // named export option
```

Browser keeps working via `window.Chess`; tests import via `import Chess from '../../slices/game-core/chess.js'`. No runtime cost.

### npm scripts

```json
"scripts": {
  "test": "node --test tests/**/*.test.js",
  "test:watch": "node --test --watch tests/**/*.test.js",
  "test:perft": "PERFT_DEEP=1 node --test tests/game-core/perft.test.js"
}
```

### Coverage target

No coverage tooling in v1 — the metric becomes the goal and people write tests to bump it. Instead, the rule is:

> Every bug fixed in `chess.js` or `pgn.js` ships with a test that fails before the fix and passes after.

Plus: the perft suite must pass at depth 3 on every commit that touches `chess.js`. CI-on-pre-commit is overkill for a personal project; a single `npm test` before pushing is the discipline.

## Validation

The harness itself is validated by:

1. **Deliberate breakage**: temporarily change `applyMove` to leave castling rights untouched. Assert a specific test fails. Revert. Confidence that the tests catch real regressions.
2. **Perft accuracy**: numbers must match chessprogramming.org values exactly. A test that passes with wrong numbers is worse than no test.

## Consequences

### Positive
- ADR-0002 step 5 (Uint8Array board rewrite) becomes safe to do.
- ADR-0003 PGN parser has a corpus and a round-trip property, not just hand-checking.
- Future contributors (or future-you in six months) have a contract for what `chess.js` promises.
- Bugs found in the wild can be reduced to failing tests, fixed once, never regress.

### Negative
- ~600 LOC of test code to write. Estimate: one session for the harness + perft, half a session per other test file.
- The perft suite is slow at depth 4; gating with env var is the workaround.
- Tests against a string-board implementation will be slow; this becomes an argument for actually doing ADR-0002 step 5, which the tests then defend.

### Neutral
- Adds `tests/` and `node_modules/` (if it didn't already exist from ADR-0002) to the repo. `.gitignore` already covers the latter.

## Out of scope

- Browser-side tests (DOM, drag-and-drop). Playwright is overkill for this app's current complexity. Re-evaluate if drill mode's UI grows complex enough to warrant it.
- Mutation testing, property-based testing with `fast-check`. Worth considering for the SAN parser specifically; deferred.
- Snapshot tests of rendered React components. Brittle and low-value here.
- Performance regression tests. Possible later; first establish correctness.

## Order of operations

1. Set up `node --test` runner + first trivial test (sanity check infra).
2. Write `fixtures/positions.js` with the five perft positions and their FENs.
3. Implement perft at depth 2 across all five. Fix any failures in `chess.js`.
4. Add depth-3 to the perft tests. Fix any failures.
5. SAN round-trip suite.
6. State-after-move scenarios.
7. (After ADR-0001 lands) Tree invariant tests + migration tests.
8. (After ADR-0003 lands) PGN parse/serialize round-trip.

Steps 1–4 are the foundation. The rest layers on as the corresponding features land.
