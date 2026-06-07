import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { migrate } = require('../electron/migrate.cjs');
const storage = require('../electron/storage.cjs');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cabinet-storage-test-'));
}

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const SAVE_A = {
  id: 'aaa111',
  name: 'English Opening',
  updatedAt: 1700000000000,
  tree: { schemaVersion: 2, rootId: 'r1', nodes: { r1: { id: 'r1', childIds: [] } } },
};
const SAVE_B = {
  id: 'bbb222',
  name: 'Sicilian Defense',
  updatedAt: 1700000001000,
  tree: { schemaVersion: 2, rootId: 'r2', nodes: { r2: { id: 'r2', childIds: [] } } },
};

let tmp;

beforeEach(() => { tmp = makeTmp(); });
afterEach(() => { rm(tmp); });

// ── Migration ──────────────────────────────────────────────────────────────

describe('migrate', () => {
  it('produces index.json and per-file saves from saves.json', () => {
    fs.writeFileSync(path.join(tmp, 'saves.json'), JSON.stringify([SAVE_A, SAVE_B]));

    const result = migrate(tmp);

    assert.equal(result.ok, true);

    // index.json contains only metadata
    const index = JSON.parse(fs.readFileSync(path.join(tmp, 'index.json'), 'utf-8'));
    assert.equal(index.length, 2);
    assert.deepEqual(index[0], { id: 'aaa111', name: 'English Opening', updatedAt: 1700000000000 });
    assert.deepEqual(index[1], { id: 'bbb222', name: 'Sicilian Defense', updatedAt: 1700000001000 });
    assert.equal('tree' in index[0], false, 'index must not contain tree data');

    // Individual save files
    const savedA = JSON.parse(fs.readFileSync(path.join(tmp, 'saves', 'aaa111.json'), 'utf-8'));
    assert.deepEqual(savedA, SAVE_A);
    const savedB = JSON.parse(fs.readFileSync(path.join(tmp, 'saves', 'bbb222.json'), 'utf-8'));
    assert.deepEqual(savedB, SAVE_B);

    // saves.json renamed to .bak — not deleted
    assert.equal(fs.existsSync(path.join(tmp, 'saves.json')), false);
    assert.equal(fs.existsSync(path.join(tmp, 'saves.json.bak')), true);
  });

  it('is idempotent — safe to run twice', () => {
    fs.writeFileSync(path.join(tmp, 'saves.json'), JSON.stringify([SAVE_A]));

    const r1 = migrate(tmp);
    assert.equal(r1.ok, true);

    // Second run: saves.json is gone, index.json exists → no-op
    const r2 = migrate(tmp);
    assert.equal(r2.ok, true);

    // Data unchanged
    const index = JSON.parse(fs.readFileSync(path.join(tmp, 'index.json'), 'utf-8'));
    assert.equal(index.length, 1);
    assert.equal(index[0].id, 'aaa111');
  });

  it('skips when no saves.json (fresh install)', () => {
    const result = migrate(tmp);
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(path.join(tmp, 'index.json')), false);
  });

  it('returns { ok: false } and leaves saves.json intact on parse error', () => {
    fs.writeFileSync(path.join(tmp, 'saves.json'), 'not json {{{');

    const result = migrate(tmp);

    assert.equal(result.ok, false);
    assert.ok(result.error);
    // saves.json must still be there — not renamed or deleted
    assert.equal(fs.existsSync(path.join(tmp, 'saves.json')), true);
    assert.equal(fs.existsSync(path.join(tmp, 'index.json')), false);
  });
});

// ── loadIndex ──────────────────────────────────────────────────────────────

describe('loadIndex', () => {
  it('returns empty array when index.json missing', () => {
    assert.deepEqual(storage.loadIndex(tmp), []);
  });

  it('returns only metadata — not tree data', () => {
    const index = [{ id: 'aaa111', name: 'English Opening', updatedAt: 1700000000000 }];
    fs.mkdirSync(path.join(tmp), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'index.json'), JSON.stringify(index));

    const result = storage.loadIndex(tmp);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'aaa111');
    assert.equal('tree' in result[0], false);
  });
});

// ── saveSave ───────────────────────────────────────────────────────────────

describe('saveSave', () => {
  it('writes save file and creates index entry', () => {
    storage.saveSave(tmp, SAVE_A);

    const saveFile = path.join(tmp, 'saves', 'aaa111.json');
    assert.equal(fs.existsSync(saveFile), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(saveFile, 'utf-8')), SAVE_A);

    const index = storage.loadIndex(tmp);
    assert.equal(index.length, 1);
    assert.deepEqual(index[0], { id: 'aaa111', name: 'English Opening', updatedAt: 1700000000000 });
  });

  it('updates existing index entry on re-save', () => {
    storage.saveSave(tmp, SAVE_A);

    const updated = { ...SAVE_A, name: 'English (Updated)', updatedAt: 1700000099000 };
    storage.saveSave(tmp, updated);

    const index = storage.loadIndex(tmp);
    assert.equal(index.length, 1);
    assert.equal(index[0].name, 'English (Updated)');
    assert.equal(index[0].updatedAt, 1700000099000);
  });

  it('write is atomic — uses tmp then rename', () => {
    // After saveSave completes there must be no leftover .tmp file
    storage.saveSave(tmp, SAVE_A);
    const tmpFile = path.join(tmp, 'saves', 'aaa111.json.tmp');
    assert.equal(fs.existsSync(tmpFile), false);
  });

  it('multiple saves accumulate in index', () => {
    storage.saveSave(tmp, SAVE_A);
    storage.saveSave(tmp, SAVE_B);

    const index = storage.loadIndex(tmp);
    assert.equal(index.length, 2);
    assert.ok(index.some(e => e.id === 'aaa111'));
    assert.ok(index.some(e => e.id === 'bbb222'));
  });
});

// ── deleteSave ─────────────────────────────────────────────────────────────

describe('deleteSave', () => {
  it('removes save file and index entry', () => {
    storage.saveSave(tmp, SAVE_A);
    storage.saveSave(tmp, SAVE_B);

    storage.deleteSave(tmp, 'aaa111');

    assert.equal(fs.existsSync(path.join(tmp, 'saves', 'aaa111.json')), false);

    const index = storage.loadIndex(tmp);
    assert.equal(index.length, 1);
    assert.equal(index[0].id, 'bbb222');
  });

  it('is safe when id does not exist', () => {
    storage.saveSave(tmp, SAVE_A);
    // Should not throw
    storage.deleteSave(tmp, 'nonexistent');

    const index = storage.loadIndex(tmp);
    assert.equal(index.length, 1);
  });
});

// ── Round-trip ─────────────────────────────────────────────────────────────

describe('round-trip', () => {
  it('save then loadSave returns identical data', () => {
    storage.saveSave(tmp, SAVE_A);
    const loaded = storage.loadSave(tmp, 'aaa111');
    assert.deepEqual(loaded, SAVE_A);
  });

  it('loadAll returns all saves with full tree data', () => {
    storage.saveSave(tmp, SAVE_A);
    storage.saveSave(tmp, SAVE_B);

    const all = storage.loadAll(tmp);
    assert.equal(all.length, 2);
    assert.ok(all.every(s => s.tree !== undefined));
    assert.ok(all.some(s => s.id === 'aaa111'));
    assert.ok(all.some(s => s.id === 'bbb222'));
  });

  it('loadAll returns [] with no data', () => {
    assert.deepEqual(storage.loadAll(tmp), []);
  });

  it('round-trip through migrate then loadAll', () => {
    fs.writeFileSync(path.join(tmp, 'saves.json'), JSON.stringify([SAVE_A, SAVE_B]));
    migrate(tmp);

    const all = storage.loadAll(tmp);
    assert.equal(all.length, 2);
    assert.deepEqual(all.find(s => s.id === 'aaa111'), SAVE_A);
    assert.deepEqual(all.find(s => s.id === 'bbb222'), SAVE_B);
  });
});
