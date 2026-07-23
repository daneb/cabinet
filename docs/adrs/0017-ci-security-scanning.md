# ADR-0017: CI dependency security scanning

**Status**: Accepted
**Date**: 2026-07-23

## Context

The project had no automated check for known-vulnerable or malicious dependencies — the only CI workflow was `release.yml`, which builds and publishes packaged binaries. `npm audit` run locally already showed high-severity advisories in the `electron-builder` toolchain (a devDependency, not shipped in the app). Investigating this also surfaced that `package-lock.json` was excluded via `.gitignore`, so there was no committed record of exactly which dependency versions were resolved — `npm ci` wasn't usable, and any audit run would scan whatever versions happened to resolve at scan time rather than what was actually built and shipped.

## Decision

- Committed `package-lock.json` and removed it from `.gitignore` (kept the `yarn.lock` ignore, since the project is npm-only). CI now uses `npm ci` for reproducible installs.
- New `.github/workflows/security.yml`, triggered on push and PR against `master`:
  - `audit` job: `npm audit --omit=dev --audit-level=high` **blocks** the build on high/critical vulnerabilities in runtime dependencies (`electron-store`, `simple-git`). A separate `npm audit` (full, including devDependencies) runs report-only via `::warning::` — visible, non-blocking, since devDependency fixes (e.g. an `electron-builder` major bump) need their own testing pass rather than gating every PR.
  - `osv-scan` job: calls Google's `osv-scanner-action` reusable workflow (`fail-on-vuln: false`) to cross-reference the lockfile against the OSV database — broader ecosystem/advisory coverage than `npm audit` alone, including entries for known-malicious packages. Non-blocking; results upload as SARIF to the repo's Security tab.
- New `.github/dependabot.yml`: weekly update PRs for both the `npm` and `github-actions` ecosystems, so advisories get a proposed fix automatically instead of waiting for someone to notice.

## Consequences

- CI now fails on any high/critical vulnerability newly introduced into runtime dependencies; the existing devDependency backlog (electron-builder chain) is visible but doesn't block merges until addressed deliberately.
- `package-lock.json` is now a tracked file — dependency bumps must include the lockfile diff in the same commit.
- Malware/typosquat coverage is best-effort: it relies on OSV's advisory database, not a dedicated package-behavior scanner. If that proves insufficient, a follow-up could add a paid service (e.g. Socket Security) for deeper install-script/obfuscation analysis.
