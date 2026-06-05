# ADR-0007: GitHub sync for cross-machine repertoire access

**Status**: Accepted
**Date**: 2026-06-05
**Depends on**: ADR-0006 (disk persistence)

## Context

ADR-0006 moved saves from `localStorage` to `data/saves.json` on disk. The file can now be copied between machines, but doing so manually is friction. The user wants the repertoire available on any machine they use without explicit file management.

Constraints:
- Single-user app with a single JSON file as the source of truth.
- No server to host. Any sync mechanism must work peer-to-peer via a hosted service.
- The file is already JSON and small enough (under 5 MB for any realistic repertoire) that conflict resolution is simple: the remote always wins on pull, and the local write always wins on push.
- The user already has a GitHub account and is comfortable creating private repos and PATs.

## Decision

Use a private GitHub repository as the sync backing store, with `simple-git` (via Node.js in the Electron main process) driving all git operations. Credentials are stored in `electron-store`.

### Key design choices

**Origin-wins strategy on startup pull, local-wins on push.**
On app launch, if sync is enabled, we do `git fetch && git reset --hard origin/main` before showing the window. This means the most recently pushed version from any machine is always loaded. On save, we `git add saves.json && git commit && git push`. If the push is rejected (non-fast-forward — another machine pushed since our last sync), we fetch, reset to remote, re-add the local file, re-commit, and push. The local write is preserved as a new commit on top of the remote state.

This is intentionally simplified: there is no three-way merge of the JSON tree. The working assumption is that the user is always on one machine at a time. If they simultaneously edit on two machines, the last save wins. For a solo study tool this is acceptable; a collaborative scenario would require operational transforms or CRDTs, which are out of scope.

**PAT embedded in remote URL.**
GitHub personal access tokens can be embedded as `https://<pat>@github.com/user/repo.git`. This is the simplest credential mechanism — no credential helper, no SSH, no keychain integration. The PAT is also stored in `electron-store` (encrypted at rest on macOS via Keychain) and re-embedded on each git operation, so rotation is possible without re-initialising the repo.

The tradeoff is that `git remote -v` in the repo directory would reveal the PAT. For a data directory in `~/Library/Application Support/Cabinet/`, this is not a meaningful concern. A future improvement could use `GIT_ASKPASS` or a git credential helper.

**Single-file sync (`saves.json` only).**
The git repo in `DATA_DIR` tracks only `saves.json`. Session state (`chess_analysis_session_v2` in `localStorage`) is intentionally excluded — it is ephemeral and machine-specific. Sync is about the repertoire content, not the cursor position.

**Non-blocking commits after save.**
The `POST /api/saves` handler writes the file atomically (ADR-0006 pattern) and returns `200` immediately. The `commitAndPush` is fire-and-forget. The user never waits for git. The UI polls `/api/sync/status` every 30 seconds and shows `☁ Synced`, `↻ Syncing…`, or `⚠ Sync error` in the topbar.

**Blocking pull on startup.**
Startup pull blocks window creation so the user always opens the latest version from any machine. The delay is typically under 1 second on a reasonable connection. On error the startup continues — sync is best-effort and never interrupts the app.

### Module structure

```
electron/
  sync.cjs          # git module: initSync, pullSync, commitAndPush, getStatus, disconnect
  main.cjs          # startup pull, new /api/sync/* endpoints, background commit on save
slices/panel/
  panel.jsx         # SyncPanel component (connect form / disconnect / pull button)
app.jsx             # sync state, status indicator, first-run banner
tests/
  sync.test.js      # unit tests using Node built-in test runner; git + store injected
```

`sync.cjs` uses lazy `require()` for `simple-git` and `electron-store` so that tests can inject mocks without the actual packages being loaded. This keeps tests fast and runnable outside an Electron context.

### New API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/sync/status` | Returns `{ enabled, lastSync, lastError, bannerDismissed, repoUrl }` |
| `POST` | `/api/sync/init` | Body: `{ repoUrl, pat }` — calls `initSync`, returns `{ ok, error? }` |
| `POST` | `/api/sync/pull` | Calls `pullSync`, returns `{ ok, saves, error? }` |
| `POST` | `/api/sync/disconnect` | Clears credentials in store, returns `{ ok }` |

### First-run UX

On first launch when sync has not been configured and the user has not dismissed the banner, a persistent banner appears: `☁ Sync across devices with GitHub → Set up`. Clicking "Set up" scrolls to the Sync section in the sidebar. Clicking "×" permanently dismisses it. Once `initSync` succeeds, `bannerDismissed` is set in electron-store and the banner never reappears.

## Consequences

### Positive
- Repertoire is automatically current on any machine where the app is running.
- Zero additional infrastructure — uses an existing GitHub account.
- Recovery from a fresh machine: install app, enter repo URL and PAT, click Connect, startup pull loads the full repertoire.
- The git history is an automatic backup with a human-readable audit trail of when saves changed.

### Negative
- Requires a GitHub account and a private repo to be created manually before first use.
- PAT must be created with `repo` scope (read + write). Rotation requires re-connecting in Settings.
- Simultaneous edits on two machines result in the last-committed version winning. This is an accepted tradeoff for a solo tool.
- `simple-git` and `electron-store` add ~2 MB to the packaged app.

### Neutral
- The git repo in `DATA_DIR` accumulates one commit per save. For heavy users (dozens of saves per day) this could reach thousands of commits over months — negligible in disk terms, but `git gc` would keep it tidy if needed. Out of scope for now.

## Out of scope

- Multi-user or shared repertoire collaboration.
- Conflict resolution / three-way merge of the JSON tree.
- SSH key authentication.
- GitLab, Bitbucket, or self-hosted git support (the URL is freeform; only GitHub PAT auth is tested).
- Automatic repo creation (user must create the private repo on GitHub first).
