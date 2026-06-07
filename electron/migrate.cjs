'use strict';

const fs = require('fs');
const path = require('path');

function writeJSONAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

/**
 * One-time migration: data/saves.json → data/index.json + data/saves/<id>.json
 * Idempotent — safe to run twice.
 * Returns { ok: true } on success or skip, { ok: false, error } on failure.
 * On failure, leaves saves.json untouched so the app can fall back to it.
 */
function migrate(dataDir) {
  const savesFile = path.join(dataDir, 'saves.json');
  const indexFile = path.join(dataDir, 'index.json');
  const savesDir = path.join(dataDir, 'saves');
  const backupFile = path.join(dataDir, 'saves.json.bak');

  // Skip: nothing to migrate, or already migrated
  if (!fs.existsSync(savesFile) || fs.existsSync(indexFile)) {
    return { ok: true };
  }

  try {
    const raw = fs.readFileSync(savesFile, 'utf-8');
    const saves = JSON.parse(raw);

    if (!Array.isArray(saves)) throw new Error('saves.json is not an array');

    if (!fs.existsSync(savesDir)) fs.mkdirSync(savesDir, { recursive: true });

    // Write each save atomically
    for (const save of saves) {
      writeJSONAtomic(path.join(savesDir, `${save.id}.json`), save);
    }

    // Write index (metadata only — no tree data)
    const index = saves.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
    writeJSONAtomic(indexFile, index);

    // Keep saves.json as a backup — never delete it
    fs.renameSync(savesFile, backupFile);

    console.log(`[migrate] Migrated ${saves.length} save(s) to per-file storage`);
    return { ok: true };
  } catch (err) {
    console.error('[migrate] Migration failed, falling back to saves.json:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { migrate };
