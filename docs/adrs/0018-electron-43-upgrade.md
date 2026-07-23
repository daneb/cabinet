# ADR-0018: Electron 43 upgrade chain (Dependabot)

**Status**: Accepted
**Date**: 2026-07-23

## Context

Dependabot (configured in [ADR-0017](0017-ci-security-scanning.md)) opened a stack of PRs bumping `electron` 31.7.7 → 43.2.0, `electron-builder` 24.13.3 → 26.15.3, and `electron-store` 8.2.0 → 11.0.2 — all major-version jumps, merged via #4–#9. The `electron` bump alone spans 12 majors and is exactly the kind of change flagged in ADR-0017 as needing a deliberate test pass rather than an automatic merge.

`electron-store` v9+ ships ESM-only (`"type": "module"`, no CJS export). `electron/sync.cjs` — the GitHub-sync persistence layer — does `require('electron-store')` from CommonJS. Node's require(ESM) interop (stable since Node 20.19/22.12) doesn't fail this call; it silently returns the module namespace object instead of the class, so `require('electron-store')` no longer equals the constructor. `new Store(...)` then threw `TypeError: Store is not a constructor` at runtime. Unit tests never caught this because `tests/sync.test.js` mocks the store via `_setStore()`, by design (see comment in `sync.cjs`) — the real package is never exercised outside the Electron runtime. `getStatus()` also swallows the error in a try/catch and falls back to `enabled: false`, so the failure mode was silent: sync would just stop working, not crash.

## Decision

- Fixed the require: `const Store = require('electron-store').default;` in `electron/sync.cjs`.
- Verified against the real dependency versions, not just plain-Node interop:
  - Launched the actual packaged Electron app (`npm run electron`) and confirmed `[sync] Sync complete` in the log, plus a live `GET /api/sync/status` response with `lastError: null` and a fresh `lastSync` timestamp — the sync path genuinely works end-to-end under Electron 43's bundled runtime.
  - Ran `npx electron-builder --dir --linux dir` to confirm the `electron-builder` 26 config schema still packages cleanly with this project's existing `build` block (mac dmg / linux deb+AppImage / github publish) — no config migration needed.
  - `npm ci && node build.cjs && npm test` clean — same 2 pre-existing `tests/sync.test.js` failures (unrelated `simple-git` mock assertions, confirmed pre-existing on a clean `master` checkout before this upgrade), no new failures.
  - Real-world confirmation: the release pipeline (`release.yml`) already built and published v1.0.21 successfully on both `macos-latest` and `ubuntu-latest` with this dependency set.
- Bumped `node-version` from `'20'` to `'24'` in both `.github/workflows/security.yml` and `.github/workflows/release.yml` (kept in sync per the CLAUDE.md note that CI/server changes affecting both files must be mirrored). Reasoning: `@electron/get` (an `electron-builder` dependency) now declares `engines: {"node": ">=22.12.0"}`; Node 20 is also past its support window as of this date. npm doesn't hard-fail on unmet `engines` today, but there's no reason to keep running EOL Node in CI once the ecosystem has moved on.

## Consequences

- GitHub sync (the only `electron-store` consumer) works correctly again under Electron 43.
- Future `electron-store` API usage must account for its ESM-only packaging — any new direct `require('electron-store')` call needs the same `.default` unwrap.
- CI now runs on Node 24, matching what the toolchain (electron-builder's `@electron/get`) expects.
- The devDependency vulnerability backlog noted in ADR-0017 (electron-builder's `tar` chain, `electron` CVEs) is resolved as a side effect of this upgrade — `npm audit` (all deps) is now clean.
