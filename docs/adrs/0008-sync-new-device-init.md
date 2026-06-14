# ADR-0008: Robust sync initialisation on a new device

**Status**: Accepted
**Date**: 2026-06-14
**Depends on**: ADR-0007 (GitHub sync)

## Context

ADR-0007 described the sync strategy for cross-machine use. The happy path assumed the new machine has no existing data directory, so `initSync` would take the `!isRepo` branch: fresh `git init`, initial commit, push.

Two failure modes surfaced in practice:

1. **Remote already has commits.** If another machine has previously synced, the remote `main` branch exists. A fresh `git push` from the new machine fails with a non-fast-forward error. The error was not caught, leaving `origin/main` with no local tracking ref. Any subsequent operation calling `git reset --hard origin/main` then threw `fatal: ambiguous argument 'origin/main': unknown revision or path not in the working tree`.

2. **Partially initialised data directory.** If the user hit Connect on the broken v1.0.10/v1.0.11 build, `git init` ran and created a `.git` directory, but the push failed and was never cleaned up. On re-connect, `checkIsRepo()` returned `true`, so `initSync` skipped the new-device branch entirely and called `pullSync` directly. `pullSync` did `git fetch` then `git reset --hard origin/main` — which hit the same missing-ref error because the fetch succeeded but `origin/main` had never been established.

## Decision

Two targeted guards were added to `electron/sync.cjs`:

### 1. `initSync` — check remote before pushing (v1.0.11)

In the `!isRepo` branch, after setting up the remote, fetch from origin and use `ls-remote` to check whether `origin/main` already exists. If it does, reset to it instead of attempting an initial push:

```js
let remoteHasMain = false;
try {
  await git.fetch('origin');
  const refs = await git.raw(['ls-remote', '--heads', 'origin', 'main']);
  remoteHasMain = refs.trim().length > 0;
} catch {}

if (remoteHasMain) {
  await git.reset(['--hard', 'origin/main']);
} else {
  await git.add(['.']);
  await git.commit('repertoire: initial commit');
  await git.push(['-u', 'origin', 'main']);
}
```

### 2. `pullSync` — guard before reset (v1.0.12)

Before `git reset --hard origin/main`, verify the ref exists via `ls-remote`. If it doesn't (empty remote, broken partial init, or network hiccup during fetch), skip the reset rather than throwing:

```js
const refs = await git.raw(['ls-remote', '--heads', 'origin', 'main']).catch(() => '');
if (!refs.trim()) return;
await git.reset(['--hard', 'origin/main']);
```

`ls-remote` queries the remote directly rather than relying on local tracking refs, so it works even in a repo with no commits and no prior fetches.

## Why not wipe the data directory and re-init?

Deleting `.git` and starting over would also fix the broken-init case, but it risks discarding any unsaved data the user wrote before connecting sync. The guard approach is non-destructive: if the remote has content, we pull it; if it doesn't, we skip the reset and let the next save push the initial state.

## Consequences

- New-device connect is now idempotent: reconnecting after a failed first attempt produces the same result as a clean first connect.
- `pullSync` is slightly slower (one extra `ls-remote` round-trip per pull), but pull happens at startup and on explicit user action — not in the hot path.
- The underlying assumption from ADR-0007 (single user, one machine at a time) is unchanged.
