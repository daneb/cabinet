---
id: TECH-0001
scope: repo
owner: human
verified_at: 2026-08-26
---

# Tech

## Stack

- Vanilla React (via esbuild bundle, no framework), plain JS/JSX — not
  TypeScript.
- Electron (packages the app as "Cabinet"); also runs as a plain static
  site via `serve.js`.
- Stockfish 18 lite WASM for engine analysis, loaded as a Web Worker by URL
  (outside the esbuild bundle).
- Node's built-in test runner (`node --test`), no Jest/Mocha.

## Build and test

```sh
# build: node build.cjs
# test:  node --test 'tests/**/*.test.js'
# lint:  (none configured)
```

## Constraints

- `electron/main.cjs` embeds a near-duplicate of `serve.js`'s static+API
  server — API/MIME changes must be made in both files.
- Root-level `chess.js`, `board.jsx`, `panel.jsx` are older copies; the
  canonical sources are under `slices/`. Do not edit the root copies.
- Slices export on `window` and are wired by ES imports at the top of
  `app.jsx`, not HTML script tags — a new slice must be imported there to be
  reachable.
- Never aggregate game-review results across different engine builds/node
  budgets; reviews record `engineId` + `nodesPerPos` for this reason.
