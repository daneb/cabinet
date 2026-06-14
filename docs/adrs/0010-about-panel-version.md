# ADR-0010: Explicit About panel version via app.getVersion()

**Status**: Accepted
**Date**: 2026-06-14
**Depends on**: ADR-0009 (release automation)

## Context

The macOS About panel (Menu → Cabinet → About) was consistently showing `1.0.11` regardless of which DMG was installed. Multiple releases (1.0.12, 1.0.13, 1.0.14) all displayed the same stale version, despite CI correctly naming the DMG after the new version.

The default Electron behaviour is to let macOS read `CFBundleShortVersionString` from the app bundle's `Info.plist`. electron-builder writes this from `package.json` at build time. However, macOS Launch Services caches bundle metadata — if the app was previously installed at the same path, the old version string can persist in the cache and be returned to the About dialog even after the app is replaced on disk.

The root cause is the lack of a runtime version assertion: nothing in the app actively told macOS what version it was running, so the OS served whatever it had cached.

## Decision

`main.cjs` now calls `app.setAboutPanelOptions()` in the `whenReady` handler, explicitly setting `applicationVersion` and `version` to `app.getVersion()`:

```js
app.setAboutPanelOptions({
  applicationName: 'Cabinet',
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  copyright: `Copyright © ${new Date().getFullYear()} Dane Balia`,
});
```

`app.getVersion()` reads from the `package.json` baked into the app's asar at build time — the same source of truth electron-builder uses to name the DMG. This overrides any cached `Info.plist` value that macOS Launch Services might return.

A startup log line `[cabinet] version X.Y.Z` was also added so the actual runtime version is always visible in Console.app without opening the About panel.

A test in `tests/version.test.js` enforces the contract:
- `package.json` has a valid semver version.
- `setAboutPanelOptions` is called in `main.cjs`.
- It uses `app.getVersion()` — not a hardcoded literal.
- `applicationVersion` and `version` both equal the `package.json` version.

## Consequences

- The About panel now always reflects the version the running binary was built from, regardless of OS-level caching.
- The test will catch any future regression where the version is hardcoded or the options call is removed.
- `app.getVersion()` is still only as correct as the `package.json` baked into the asar — the release script (`scripts/release.sh`) remains the enforcer that bumps this before tagging.
