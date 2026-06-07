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
- [ ] M-1 Read existing `data/saves.json`
- [ ] M-2 Write each save to `data/saves/<id>.json` atomically
- [ ] M-3 Write `data/index.json` atomically (id, name, updatedAt only)
- [ ] M-4 Rename `saves.json` → `saves.json.bak` only after all writes succeed
- [ ] M-5 On any failure: leave saves.json untouched, return error
- [ ] M-6 Idempotent — safe to run twice

### Storage module (`electron/storage.cjs`)
- [ ] S-1 `loadIndex(dataDir)` — loads index.json
- [ ] S-2 `loadSave(dataDir, id)` — loads single save file
- [ ] S-3 `loadAll(dataDir)` — index + all individual saves
- [ ] S-4 `saveSave(dataDir, save)` — atomic write + index update
- [ ] S-5 `deleteSave(dataDir, id)` — remove file + index entry

### HTTP server (`electron/main.cjs`)
- [ ] H-1 Run migration on startup
- [ ] H-2 `GET /api/saves` uses `loadAll()`
- [ ] H-3 `POST /api/saves` uses `saveSave()` per item

### Tests (`tests/storage.test.js`)
- [ ] T-1 Migration: correct output files produced
- [ ] T-2 Migration idempotency
- [ ] T-3 loadIndex returns metadata only
- [ ] T-4 saveSave atomic write + index update
- [ ] T-5 deleteSave removes file and index entry
- [ ] T-6 Round-trip: save then load returns identical data

### Release
- [ ] R-1 `npm test` all green
- [ ] R-2 Bump version to 1.0.8
- [ ] R-3 Commit, tag v1.0.8, push
- [ ] R-4 GitHub release created, DMG built by workflow

## Progress

| Area | Items | Done | Status |
|---|---|---|---|
| Migration | 6 | 0 | Not started |
| Storage module | 5 | 0 | Not started |
| HTTP server | 3 | 0 | Not started |
| Tests | 6 | 0 | Not started |
| Release | 4 | 0 | Not started |
| **Total** | **24** | **0** | — |
