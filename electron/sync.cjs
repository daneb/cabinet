'use strict';

const path = require('path');
const fs = require('fs');

// Lazy factories — replaced by _setGitFactory / _setStore in tests so the
// real packages are never loaded outside of the Electron runtime.

let _gitFactory = (dir) => {
  const simpleGit = require('simple-git');
  return simpleGit({ baseDir: dir });
};

let _storeInstance = null;

function getStore() {
  if (_storeInstance) return _storeInstance;
  const Store = require('electron-store');
  _storeInstance = new Store({ name: 'sync-config' });
  return _storeInstance;
}

function authUrl(repoUrl, pat) {
  try {
    const u = new URL(repoUrl);
    u.username = encodeURIComponent(pat);
    u.password = '';
    return u.toString();
  } catch {
    return repoUrl.replace('https://', `https://${pat}@`);
  }
}

function commitMsg() {
  return `repertoire: update ${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}`;
}

async function initSync(dataDir, repoUrl, pat) {
  if (!fs.existsSync(path.join(dataDir, 'index.json'))) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'index.json'), '[]', 'utf-8');
  }

  const git = _gitFactory(dataDir);
  let isRepo = false;
  try { isRepo = await git.checkIsRepo(); } catch {}

  if (!isRepo) {
    await git.init();
    try { await git.raw(['checkout', '-b', 'main']); } catch {}
    await git.addConfig('user.name', 'Cabinet');
    await git.addConfig('user.email', 'cabinet@localhost');
    await git.addRemote('origin', authUrl(repoUrl, pat));

    // If the remote already has a main branch (another device already synced),
    // fetch and reset to FETCH_HEAD instead of pushing a conflicting initial commit.
    // FETCH_HEAD is always written by git fetch — avoids relying on tracking refs
    // which may not exist in a fresh or broken-partial repo.
    let fetched = false;
    try {
      await git.fetch('origin');
      fetched = true;
    } catch {}

    if (fetched) {
      await git.reset(['--hard', 'FETCH_HEAD']);
    } else {
      await git.add(['.']);
      await git.commit('repertoire: initial commit');
      await git.push(['-u', 'origin', 'main']);
    }
  } else {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin) {
      await git.addRemote('origin', authUrl(repoUrl, pat));
    } else {
      await git.remote(['set-url', 'origin', authUrl(repoUrl, pat)]);
    }
    await pullSync(dataDir, pat);
  }

  const store = getStore();
  const existing = store.get('github', {});
  store.set('github', {
    ...existing,
    enabled: true,
    repoUrl,
    pat,
    lastSync: new Date().toISOString(),
    lastError: null,
    bannerDismissed: true,
  });
}

async function pullSync(dataDir, pat) {
  const git = _gitFactory(dataDir);
  await git.fetch('origin');

  // Use FETCH_HEAD rather than origin/main — FETCH_HEAD is always written by
  // git fetch regardless of whether local tracking refs have been established,
  // which avoids "ambiguous argument 'origin/main'" on broken partial inits.
  await git.reset(['--hard', 'FETCH_HEAD']);

  const store = getStore();
  const existing = store.get('github', {});
  store.set('github', { ...existing, lastSync: new Date().toISOString(), lastError: null });
}

async function commitAndPush(dataDir, pat, msg) {
  const git = _gitFactory(dataDir);
  const message = msg || commitMsg();

  try {
    await git.add(['.']);

    try {
      await git.commit(message);
    } catch (e) {
      if (e.message && e.message.includes('nothing to commit')) return;
      throw e;
    }

    try {
      await git.push('origin', 'main');
    } catch {
      // Non-fast-forward: fetch, reset to remote, re-add local file, re-commit, force-push
      await git.fetch('origin');
      await git.reset(['--hard', 'FETCH_HEAD']);
      await git.add('saves.json');
      try { await git.commit(message); } catch (e2) {
        if (!e2.message || !e2.message.includes('nothing to commit')) throw e2;
      }
      await git.push('origin', 'main');
    }

    const store = getStore();
    const existing = store.get('github', {});
    store.set('github', { ...existing, lastSync: new Date().toISOString(), lastError: null });
  } catch (err) {
    const store = getStore();
    const existing = store.get('github', {});
    store.set('github', { ...existing, lastError: err.message });
    throw err;
  }
}

function getStatus() {
  try {
    const store = getStore();
    const config = store.get('github', {});
    return {
      enabled: !!config.enabled,
      lastSync: config.lastSync || null,
      lastError: config.lastError || null,
      bannerDismissed: !!config.bannerDismissed,
      repoUrl: config.repoUrl || null,
    };
  } catch {
    return { enabled: false, lastSync: null, lastError: null, bannerDismissed: false, repoUrl: null };
  }
}

function disconnect() {
  try {
    const store = getStore();
    store.set('github', { bannerDismissed: true });
  } catch {}
}

// Test injection points
function _setGitFactory(factory) { _gitFactory = factory; }
function _setStore(store) { _storeInstance = store; }

module.exports = {
  initSync,
  pullSync,
  commitAndPush,
  getStatus,
  disconnect,
  commitMsg,
  _setGitFactory,
  _setStore,
};
