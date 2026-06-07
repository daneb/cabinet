'use strict';

const fs = require('fs');
const path = require('path');

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return null; }
}

function writeJSONAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

// Load just the index (name + id + updatedAt) — fast, for listing
function loadIndex(dataDir) {
  return readJSON(path.join(dataDir, 'index.json')) || [];
}

// Load a single save's full tree by id
function loadSave(dataDir, id) {
  return readJSON(path.join(dataDir, 'saves', `${id}.json`));
}

// Load all saves with full tree data (for GET /api/saves backward compat)
function loadAll(dataDir) {
  const index = loadIndex(dataDir);
  return index.map(entry => loadSave(dataDir, entry.id)).filter(Boolean);
}

// Write one save atomically; update index.json entry
function saveSave(dataDir, save) {
  writeJSONAtomic(path.join(dataDir, 'saves', `${save.id}.json`), save);

  const indexFile = path.join(dataDir, 'index.json');
  const index = loadIndex(dataDir);
  const pos = index.findIndex(e => e.id === save.id);
  const entry = { id: save.id, name: save.name, updatedAt: save.updatedAt };
  if (pos >= 0) {
    index[pos] = entry;
  } else {
    index.push(entry);
  }
  writeJSONAtomic(indexFile, index);
}

// Remove one save file and its index entry
function deleteSave(dataDir, id) {
  const saveFile = path.join(dataDir, 'saves', `${id}.json`);
  if (fs.existsSync(saveFile)) fs.unlinkSync(saveFile);

  const indexFile = path.join(dataDir, 'index.json');
  const index = loadIndex(dataDir).filter(e => e.id !== id);
  writeJSONAtomic(indexFile, index);
}

module.exports = { loadIndex, loadSave, loadAll, saveSave, deleteSave };
