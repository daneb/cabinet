---
# Cabinet — Per-File Repertoire Storage

> Plan and progress tracker. Update checkboxes as each item lands.

## Why

Single `data/saves.json` becomes a problem as repertoires grow:
- Startup loads every tree even to show a names list
- Every save rewrites all repertoires (write amplification)
- GitHub sync: any two machines touching different repertoires conflict on the same file
- Corruption in one save risks all data

## New Layout

```
data/
  index.json          ← [{id, name, updatedAt}]  lightweight manifest
  saves/
    <id>.json         ← one file per repertoire
  saves.json.bak      ← original file kept as backup post-migration
```

## Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Index format | Lightweight JSON array (id, name, updatedAt only) | Fast load, no tree data |
| Individual save format | Full save object as JSON | Self-contained, git-diffable |
| Writes | Atomic (tmp → rename) | Same pattern as existing saves |
| Migration | saves.json → saves/*.json + index.json, rename original to .bak | Never delete data |
| Migration failure | Fall back to saves.json silently | No crash, no data loss |
| API contract | GET/POST /api/saves unchanged (full array) | Frontend needs no changes |

## Checklist

### Migration (`electron/migrate.cjs`)
- [x] M-1 Read existing `data/saves.json`
- [x] M-2 Write each save to `data/saves/<id>.json` atomically
- [x] M-3 Write `data/index.json` atomically (id, name, updatedAt only)
- [x] M-4 Rename `saves.json` → `saves.json.bak` only after all writes succeed
- [x] M-5 On any failure: leave saves.json untouched, return error
- [x] M-6 Idempotent — safe to run twice

### Storage module (`electron/storage.cjs`)
- [x] S-1 `loadIndex(dataDir)` — loads index.json
- [x] S-2 `loadSave(dataDir, id)` — loads single save file
- [x] S-3 `loadAll(dataDir)` — index + all individual saves
- [x] S-4 `saveSave(dataDir, save)` — atomic write + index update
- [x] S-5 `deleteSave(dataDir, id)` — remove file + index entry

### HTTP server (`electron/main.cjs`)
- [x] H-1 Run migration on startup
- [x] H-2 `GET /api/saves` uses `loadAll()`
- [x] H-3 `POST /api/saves` uses `saveSave()` per item

### Tests (`tests/storage.test.js`)
- [x] T-1 Migration: correct output files produced
- [x] T-2 Migration idempotency
- [x] T-3 loadIndex returns metadata only
- [x] T-4 saveSave atomic write + index update
- [x] T-5 deleteSave removes file and index entry
- [x] T-6 Round-trip: save then load returns identical data

### Release
- [x] R-1 `npm test` all green (126/126)
- [x] R-2 Bump version to 1.0.8
- [x] R-3 Commit, tag v1.0.8, push
- [x] R-4 GitHub release created, DMG built by workflow

## Progress

| Area | Items | Done | Status |
|---|---|---|---|
| Migration | 6 | 6 | Complete |
| Storage module | 5 | 5 | Complete |
| HTTP server | 3 | 3 | Complete |
| Tests | 6 | 6 | Complete |
| Release | 4 | 4 | Complete |
| **Total** | **24** | **24** | **Done** |
