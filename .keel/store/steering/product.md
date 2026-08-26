---
id: PROD-0001
scope: repo
owner: human
verified_at: 2026-08-26
---

# Product

## Purpose

Cabinet is a single-page desktop app (Electron + browser) for building and
drilling a chess opening repertoire from memory, with Stockfish-backed
analysis and post-game review.

## Users and stakes

A single user (the repo owner) studying their own opening repertoire. If the
drill or analysis logic is wrong, the user memorizes an unsound line or
misjudges a game — the cost is a worse study session, not data loss, since
saves persist to both localStorage and disk (`/api/saves`, `/api/library`).

## Out of scope

- Multiplayer/online play — this is a solo study tool, not a chess server.
- Server-side persistence beyond the local Electron/`serve.js` API — no
  accounts, no sync between machines.
- Opening theory correctness — the engine and the user supply that; Cabinet
  only stores and drills whatever lines are entered.
