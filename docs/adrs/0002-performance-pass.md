# ADR-0002: Performance pass

**Status**: Accepted
**Date**: 2026-05-17

## Context

The project constitution names performance as a hard rule: "The Chess Engine needs to be highly performant and not slow down the user interaction" and "User movement of pieces should be fluid." In daily use the app feels sluggish. Stripped down, the causes are:

1. **Babel-standalone transpiles all `.jsx` files in the browser on every page load.** This is the largest single contributor to time-to-interactive.
2. **The board re-renders all 64 squares on every engine `info` line.** Stockfish at `go depth 18` emits info continuously for several seconds. Every emission calls `setEvaluation` / `setArrows`, which re-renders `App`, which re-renders the unmemoized `<Board>` and 64 unmemoized `<Square>` children.
3. **`MoveList.useEffect` calls `scrollIntoView({ behavior: 'smooth' })` on every cursor change**, including the rapid cursor changes that happen as the user holds `→`.
4. **`go depth 18` runs unconditionally on every position change**, even when the user is fanning through moves with the arrow keys and doesn't care about analysis until they stop.
5. **String-based board mutations** in `chess.js`: `setSquare` does three string allocations per square write. `applyMove` performs several. `toSAN` triggers `allLegalMoves` which triggers `legalTargetsFrom` for every piece which triggers `isLegalMove` (and its own `applyMove`) for every target. The arithmetic is bad but the synchronous-on-the-render-path part is worse: `mateOrStale` (in `app.jsx`) calls `allLegalMoves` every time `currentState` changes.

This ADR addresses all five, in priority order.

## Decision

A five-step pass, each step independently shippable and independently measurable. Do not do them all at once — measure between steps so we know which actually moved the needle.

### Step 1 — Add a build step (highest leverage, lowest risk)

Replace Babel-standalone with `esbuild`. One-time install, two-line build script.

```bash
npm install --save-dev esbuild
```

```js
// build.js
require('esbuild').build({
  entryPoints: ['app.jsx'],
  bundle: true,
  outfile: 'dist/bundle.js',
  loader: { '.jsx': 'jsx' },
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  sourcemap: true,
  target: ['chrome120', 'safari17'],
});
```

```json
// package.json scripts
"scripts": {
  "build": "node build.js",
  "watch": "node build.js --watch",
  "dev": "node build.js --watch & node serve.js"
}
```

`OpeningAnalysis.html` then loads a single `<script src="dist/bundle.js">` after React UMD. Drop all the `<script type="text/babel">` tags. The vertical-slice files become ES module imports inside `app.jsx`:

```js
// app.jsx (top)
import './slices/game-core/chess.js';      // still attaches to window for now
import './slices/board/board.jsx';
// ... etc
```

A follow-up can move slices to real `export`s; that is not required for the perf win.

**Expected impact**: time-to-first-interaction drops from seconds (Babel + 7 file transpiles) to ~100ms. This is the biggest single perceived-perf gain.

**Risk**: low. esbuild is fast (<200ms full build), well-supported, and the output is straightforward IIFE.

### Step 2 — Memoize Board and Square

```js
const Square = React.memo(function Square(props) { ... });
const Board  = React.memo(function Board(props) { ... });
```

Square's props are mostly primitives; the four event handlers must be stable references. Wrap `onSquareClick`, `onDragStart`, `onDragEnd`, `onDrop` in `useCallback` (most already are). Pass `arrows` as a stable reference too — currently `useEngine` calls `setArrows(arrows)` with a fresh array every info line; rate-limit this (see step 4).

The `Board` component also currently allocates a fresh `order` array, `activeLegalTargets` array, and 64-element `squares` array on every render. With `React.memo` these allocations only happen when props actually change — but inside Board, the per-square `key` and `className` computations still run for all 64. Hoist `PIECE_GLYPH` lookups and color computation into Square so Board's body is a tight loop.

**Expected impact**: the engine-info-line storm becomes invisible. Board re-renders only when state changes, not when eval changes.

**Risk**: low, but verify with React DevTools profiler. Forgetting to memoize a callback breaks the memo silently.

### Step 3 — Quiet down the engine update path

Three changes inside `useEngine`:

1. **Throttle `setArrows`** to once per ~200ms during a single search. The info lines fly faster than the eye can read; the user sees a smooth update at 5 Hz just as well as 50 Hz, and React reconciles 10× less.
2. **Lower default depth to 14, expose `depth` as a hook param.** `go depth 18` is overkill for opening-book positions. Add a panel control "Analysis depth: 12 / 16 / 20" so the user opts in to deeper analysis when they want it.
3. **Gate analysis on a 'stopped navigating' signal.** Currently the existing 150ms debounce already handles arrow-key spamming. Increase to 300ms — perception of fluidity beats perception of immediacy here.

```js
// rough sketch
useEffect(() => {
  if (!engineReady || !fen) return;
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => {
    worker.postMessage('stop');
    worker.postMessage('position fen ' + fen);
    worker.postMessage(`go depth ${depth}`);
  }, 300);
}, [fen, engineReady, depth]);
```

Also add a throttle around `setArrows`:

```js
const lastArrowUpdate = useRef(0);
// inside info handler:
const now = performance.now();
if (now - lastArrowUpdate.current > 200) {
  setArrows(newArrows);
  lastArrowUpdate.current = now;
}
// always update final eval on bestmove
```

**Expected impact**: arrow-key fluidity improves; engine no longer competes with React for the main thread during fast navigation.

### Step 4 — Replace `scrollIntoView` smooth with auto

```js
// move-list.jsx
current.scrollIntoView({ block: 'nearest', behavior: 'auto' });
```

Smooth scrolling queues animations that compound when the user holds the arrow key. `auto` is instant and reads as "responsive," not "janky."

**Expected impact**: small but immediately felt during navigation.

### Step 5 — Optionally: typed-array board

Replace the 64-char string with `Uint8Array(64)` and an enum:

```js
const EMPTY = 0;
const WP=1, WN=2, WB=3, WR=4, WQ=5, WK=6;
const BP=7, BN=8, BB=9, BR=10, BQ=11, BK=12;
```

Mutations become O(1) in place; for immutability use `new Uint8Array(board)` (a single copy, faster than three string slices). All `isWhite`/`isBlack`/`colorOf`/`sameColor` checks become integer comparisons.

This is the only step that touches `chess.js` substantively. It is the lowest-priority change because the user-visible win is small (the engine has already moved off the main thread, and steps 1–4 hide the cost of string ops). Do it if and only if profiling after steps 1–4 still shows `chess.js` in the top frames.

**Expected impact**: 2–5× faster move generation. Mostly matters once trees grow large (drill mode walking 1000-node chapters).

**Risk**: large diff in the most-tested file. Defer until after ADR-0005 (test harness) is in place.

## Measurement

Before each step, capture in Chrome DevTools Performance panel:

- Time-to-first-paint (load profile)
- Frame time during `←/→` held for 2 seconds (interaction profile)
- Main-thread work during a single `go depth 18` (~3s window)

Record numbers in this ADR under a "Results" appendix as each step lands.

## Consequences

### Positive
- App becomes fluid in the sense the constitution requires.
- Build step unlocks ES modules, TypeScript later if desired, and proper imports in slices.

### Negative
- `serve.js` is no longer sufficient on its own; need `npm run dev`. Add this to README.
- A `dist/` directory now needs `.gitignore` treatment.
- A `node_modules/` directory now exists; previously the repo had zero dependencies. This is a real trade-off given the security-conscious posture: pin esbuild's version, audit it, and never add a transitive dep without consideration.

### Neutral
- Engine depth becomes a user-visible setting, which is good for power users and slightly more UI surface area.

## Out of scope

- Server-side rendering. Not needed for a local dev tool.
- WASM build of the chess engine. Massive overkill given the workload.
- Switching off Stockfish for a faster engine. Stockfish is fine; the issue is how often we ask it to work, not how fast it works.

## Order of operations (recommended)

| Order | Step | Time | Expected gain |
|---|---|---|---|
| 1 | esbuild build step | 30 min | ★★★★★ |
| 2 | Memoize Board + Square | 20 min | ★★★★ |
| 3 | Engine throttle + depth control | 30 min | ★★★ |
| 4 | scrollIntoView behavior: 'auto' | 2 min | ★ |
| 5 | Uint8Array board (deferred) | 2–3 hours | ★ |

Steps 1–4 are a single afternoon. Step 5 is "if profile still says so."
