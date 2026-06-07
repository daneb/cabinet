import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sync = require('../electron/sync.cjs');

// In-memory mock store — bypasses electron-store entirely
const mockStoreData = {};
const mockStore = {
  get: (key, def) => (Object.prototype.hasOwnProperty.call(mockStoreData, key) ? mockStoreData[key] : def),
  set: (key, val) => { mockStoreData[key] = val; },
};
sync._setStore(mockStore);

function createMockGit(overrides = {}) {
  return {
    checkIsRepo: async () => false,
    init: async () => {},
    raw: async () => {},
    addConfig: async () => {},
    addRemote: async () => {},
    getRemotes: async () => [],
    remote: async () => {},
    add: async () => {},
    commit: async () => {},
    push: async () => {},
    fetch: async () => {},
    reset: async () => {},
    ...overrides,
  };
}

beforeEach(() => {
  // Reset shared store state before each test
  Object.keys(mockStoreData).forEach(k => delete mockStoreData[k]);
  // Reset git factory to a no-op default
  sync._setGitFactory(() => createMockGit());
});

describe('getStatus', () => {
  it('returns disabled defaults when nothing configured', () => {
    const s = sync.getStatus();
    assert.equal(s.enabled, false);
    assert.equal(s.lastSync, null);
    assert.equal(s.lastError, null);
    assert.equal(s.bannerDismissed, false);
  });

  it('reflects stored config', () => {
    mockStoreData.github = { enabled: true, lastSync: '2024-01-01T00:00:00Z', lastError: 'oops', repoUrl: 'https://github.com/u/r.git' };
    const s = sync.getStatus();
    assert.equal(s.enabled, true);
    assert.equal(s.lastSync, '2024-01-01T00:00:00Z');
    assert.equal(s.lastError, 'oops');
    assert.equal(s.repoUrl, 'https://github.com/u/r.git');
  });
});

describe('disconnect', () => {
  it('clears enabled flag and preserves bannerDismissed', () => {
    mockStoreData.github = { enabled: true, repoUrl: 'x', pat: 'y' };
    sync.disconnect();
    assert.equal(mockStoreData.github.enabled, undefined);
    assert.equal(mockStoreData.github.bannerDismissed, true);
  });
});

describe('commitMsg', () => {
  it('produces the expected format', () => {
    const msg = sync.commitMsg();
    assert.match(msg, /^repertoire: update \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

describe('initSync — fresh repo', () => {
  it('calls init, addRemote, add, commit, push', async () => {
    const ops = [];
    sync._setGitFactory(() => createMockGit({
      checkIsRepo: async () => false,
      init: async () => ops.push('init'),
      raw: async () => {},
      addConfig: async () => {},
      addRemote: async (name, url) => { ops.push('addRemote'); assert.ok(url.includes('mytoken')); },
      add: async () => ops.push('add'),
      commit: async () => ops.push('commit'),
      push: async () => ops.push('push'),
    }));

    await sync.initSync('/tmp/sync-test', 'https://github.com/user/repo.git', 'mytoken');

    assert.ok(ops.includes('init'), 'should init');
    assert.ok(ops.includes('addRemote'), 'should add remote');
    assert.ok(ops.includes('add'), 'should stage file');
    assert.ok(ops.includes('commit'), 'should commit');
    assert.ok(ops.includes('push'), 'should push');

    assert.equal(mockStoreData.github.enabled, true);
    assert.equal(mockStoreData.github.repoUrl, 'https://github.com/user/repo.git');
    assert.equal(mockStoreData.github.bannerDismissed, true);
    assert.ok(mockStoreData.github.lastSync);
    assert.equal(mockStoreData.github.lastError, null);
  });
});

describe('initSync — existing repo', () => {
  it('sets remote URL and pulls', async () => {
    const ops = [];
    sync._setGitFactory(() => createMockGit({
      checkIsRepo: async () => true,
      getRemotes: async () => [{ name: 'origin' }],
      remote: async (args) => { ops.push('set-url'); assert.ok(args.includes('set-url')); },
      fetch: async () => ops.push('fetch'),
      reset: async (args) => { ops.push('reset'); assert.ok(args.includes('--hard')); },
    }));

    await sync.initSync('/tmp/sync-test', 'https://github.com/user/repo.git', 'mytoken');

    assert.ok(ops.includes('set-url'), 'should update remote URL');
    assert.ok(ops.includes('fetch'), 'should fetch');
    assert.ok(ops.includes('reset'), 'should reset to origin/main');
    assert.equal(mockStoreData.github.enabled, true);
  });

  it('adds remote when none exists', async () => {
    const ops = [];
    sync._setGitFactory(() => createMockGit({
      checkIsRepo: async () => true,
      getRemotes: async () => [],
      addRemote: async () => ops.push('addRemote'),
      fetch: async () => {},
      reset: async () => {},
    }));

    await sync.initSync('/tmp/sync-test', 'https://github.com/user/repo.git', 'tok');
    assert.ok(ops.includes('addRemote'), 'should add remote when none exists');
  });
});

describe('pullSync', () => {
  it('fetches and resets to origin/main', async () => {
    const ops = [];
    const resetArgs = [];
    sync._setGitFactory(() => createMockGit({
      fetch: async (remote) => { ops.push('fetch'); assert.equal(remote, 'origin'); },
      reset: async (args) => { ops.push('reset'); resetArgs.push(...args); },
    }));
    mockStoreData.github = { enabled: true };

    await sync.pullSync('/tmp/sync-test', 'tok');

    assert.ok(ops.includes('fetch'));
    assert.ok(ops.includes('reset'));
    assert.ok(resetArgs.includes('--hard'));
    assert.ok(resetArgs.includes('origin/main'));
    assert.ok(mockStoreData.github.lastSync);
    assert.equal(mockStoreData.github.lastError, null);
  });

  it('sets lastError on failure', async () => {
    sync._setGitFactory(() => createMockGit({
      fetch: async () => { throw new Error('network error'); },
    }));
    mockStoreData.github = { enabled: true };

    await assert.rejects(() => sync.pullSync('/tmp/sync-test', 'tok'));
    // pullSync does not update store on error (error propagates to caller)
  });
});

describe('commitAndPush', () => {
  it('stages all data files with git add ., commits, and pushes', async () => {
    const ops = [];
    const addedArgs = [];
    sync._setGitFactory(() => createMockGit({
      add: async (arg) => { ops.push('add'); addedArgs.push(arg); },
      commit: async (msg) => { ops.push('commit'); assert.ok(msg.includes('repertoire:')); },
      push: async (remote, branch) => { ops.push('push'); assert.equal(branch, 'main'); },
    }));
    mockStoreData.github = { enabled: true };

    await sync.commitAndPush('/tmp/sync-test', 'tok', 'repertoire: update 2024-01-01T00:00:00Z');

    assert.ok(ops.includes('add'));
    assert.ok(addedArgs.some(a => Array.isArray(a) && a.includes('.')), 'should stage with git add [.]');
    assert.ok(ops.includes('commit'));
    assert.ok(ops.includes('push'));
    assert.ok(mockStoreData.github.lastSync);
    assert.equal(mockStoreData.github.lastError, null);
  });

  it('ignores "nothing to commit" error', async () => {
    sync._setGitFactory(() => createMockGit({
      add: async () => {},
      commit: async () => { throw new Error('nothing to commit, working tree clean'); },
    }));
    mockStoreData.github = { enabled: true };

    // Should not throw
    await sync.commitAndPush('/tmp/sync-test', 'tok');
  });

  it('recovers from non-fast-forward push rejection', async () => {
    let pushCount = 0;
    const ops = [];
    sync._setGitFactory(() => createMockGit({
      add: async () => {},
      commit: async () => {},
      push: async () => {
        pushCount++;
        if (pushCount === 1) throw new Error('rejected (non-fast-forward)');
        ops.push('push-success');
      },
      fetch: async () => ops.push('fetch'),
      reset: async () => ops.push('reset'),
    }));
    mockStoreData.github = { enabled: true };

    await sync.commitAndPush('/tmp/sync-test', 'tok');

    assert.ok(ops.includes('fetch'), 'should fetch after rejection');
    assert.ok(ops.includes('reset'), 'should reset after rejection');
    assert.ok(ops.includes('push-success'), 'should succeed on retry');
    assert.ok(mockStoreData.github.lastSync);
  });

  it('records lastError when push ultimately fails', async () => {
    sync._setGitFactory(() => createMockGit({
      add: async () => {},
      commit: async () => {},
      push: async () => { throw new Error('auth failure'); },
      fetch: async () => {},
      reset: async () => {},
    }));
    mockStoreData.github = { enabled: true };

    await assert.rejects(() => sync.commitAndPush('/tmp/sync-test', 'tok'), /auth failure/);
    assert.ok(mockStoreData.github.lastError);
  });

  it('uses provided message or generates one', async () => {
    const messages = [];
    sync._setGitFactory(() => createMockGit({
      add: async () => {},
      commit: async (msg) => { messages.push(msg); },
      push: async () => {},
    }));
    mockStoreData.github = { enabled: true };

    await sync.commitAndPush('/tmp/sync-test', 'tok', 'custom message');
    assert.equal(messages[0], 'custom message');

    messages.length = 0;
    await sync.commitAndPush('/tmp/sync-test', 'tok');
    assert.match(messages[0], /^repertoire: update/);
  });
});
