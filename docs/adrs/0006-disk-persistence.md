# ADR-0006: Disk-backed persistence store

**Status**: Accepted
**Date**: 2026-05-17
**Depends on**: ADR-0001 (move tree), ADR-0003 (PGN import)

## Context

Since ADR-0001 the app has persisted saved lines to `localStorage` under `chess_analysis_saves_v2`. This works but has well-known weaknesses:

- **Ephemeral**: clearing site data destroys all study history. The tool's core promise — "we should not lose any games stored" (project constitution) — is only as strong as the user's diligence in never clearing browser data.
- **Per-browser**: the user's laptop has one browser they use for study, but localStorage is inherently siloed. A different browser or profile sees nothing.
- **Not backup-able**: there is no file to commit, copy, or share. The export PGN feature can recreate the tree structure but loses study state (status, review counts, last-drilled timestamps).

The user wants saves on disk — persistent, portable, and trivially backup-able.

## Decision

Add two REST endpoints to the existing Node.js dev server (`serve.js`) for reading and writing a JSON file on disk. The client treats disk as the primary store with localStorage as a synchronous fallback.

### Server endpoints

| Method | Path | Request | Response |
|--------|------|---------|----------|
| `GET` | `/api/saves` | — | `200` JSON array (empty `[]` if no file) |
| `POST` | `/api/saves` | JSON body (the saves array) | `200 { ok: true }` or `400` on invalid JSON |

The file lives at `data/saves.json` in the project root. Writes use an atomic rename pattern: write to `.tmp` file, then `rename()` — this prevents corruption on crash mid-write. The `data/` directory is created on first write if absent.

The server is single-user and single-process. No locking, no authentication, no concurrency concerns.

### Client load sequence

On app startup:

1. `fetch(GET /api/saves)` — if the server is reachable and returns data, use it.
2. If the server is unreachable or returns empty, fall back to `localStorage`.
3. If localStorage has data but disk doesn't (first run after this ADR), migrate localStorage → disk on load.

### Client save

Every write (save, delete, migration) calls both:

- `persistSavesToDisk(saves)` — `POST /api/saves` (fire-and-forget, best-effort)
- `persistSavesLocal(saves)` — `localStorage.setItem(...)` (synchronous fallback)

If the server is down, localStorage still works. If the browser is closed, disk still has the data. The two stores are mirrors, not sources of truth with conflict resolution — the latest save wins, and the user isn't editing on two machines simultaneously.

### What stays in localStorage

Session state (`chess_analysis_session_v2` — the current tree and cursor position) remains in localStorage only. It is ephemeral by design and not worth persisting to disk.

### File format

The same JSON array used in localStorage, prettified:

```json
[
  {
    "id": "abc123",
    "name": "King's English mainline",
    "tree": { "schemaVersion": 2, "rootId": "...", "nodes": {...}, "byFen": {...} },
    "cursorOn": "node-id",
    "updatedAt": 1715971200000
  }
]
```

No schema change. The disk file is a direct serialization of the in-memory saves array.

### .gitignore

`data/saves.json` is gitignored by default. The user can remove the gitignore line to commit it as a backup — the JSON is diffable and human-readable enough for manual inspection.

## Consequences

### Positive
- Study history survives browser data clears and profile switches.
- The file can be backed up via git, rsync, Time Machine, or copied to another machine.
- No new dependencies. The existing `serve.js` gains ~30 lines; the client gains two async functions.
- The export PGN feature is no longer the only way to move data between environments — copying `data/saves.json` preserves study state too.

### Negative
- Requires the dev server to be running. Opening `OpeningAnalysis.html` directly from the filesystem (without the server) falls back to localStorage — saves persist locally but don't reach disk.
- No multi-machine sync. Copying the file manually between machines works; real sync would require conflict resolution. Out of scope for v1.
- The file grows with the tree. A repertoire of 500 nodes produces ~200 KB of JSON. For one book this is negligible; for many books it stays under 5 MB. Revisit if performance degrades.

### Neutral
- The server remains single-purpose (static files + one JSON endpoint). Adding a database or a proper API layer is a different decision.

## Out of scope

- IndexedDB migration. The localStorage practical limit (~5 MB) is far above what a repertoire study tool produces. Revisit if saves grow beyond a few hundred lines.
- Cloud sync, multi-device conflict resolution, authentication.
- A "Load from file" / "Save to file" UI in the browser. The disk store is transparent — the user doesn't manage files, they just use the app and the data is there.
- Session persistence to disk. Session state (current position, flip state) is ephemeral and stays in localStorage.

## Open questions

None. This ADR is a thin persistence layer — the decisions are straightforward and the implementation is complete.
