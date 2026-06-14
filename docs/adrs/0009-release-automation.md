# ADR-0009: Automated release script with ADR-driven release notes

**Status**: Accepted
**Date**: 2026-06-14

## Context

Releases were done manually: bump `package.json`, commit, tag, push, then hope the GitHub Action picked up the right version. In practice this broke twice in the same session — once because the version wasn't bumped before tagging (`v1.0.12` uploaded files named `Cabinet-1.0.11-*` and they landed on the wrong release), and once because the CI workflow always created a fresh empty release, overwriting any notes added beforehand.

Release notes were also an afterthought — the workflow used `--notes ""` and there was no convention for what should go in them. Commit messages are too terse and implementation-focused to serve as user-facing changelogs.

## Decision

### `scripts/release.sh`

A single script drives the full release process:

1. **Preflight checks** — must be on `master`, clean working tree, in sync with `origin/master`, `gh` authenticated.
2. **Version bump** — accepts `patch | minor | major | x.y.z`. Reads current version from `package.json`, computes the new one, asks for confirmation.
3. **Release notes generation** — ADR files changed since the previous tag are the primary source. The script extracts the `## Context` and `## Decision` sections from each changed ADR and assembles them into a human-readable body. `fix:` commits without a corresponding ADR appear as a fallback "Bug fixes" section. A screenshot (`assets/screenshot.png`) and a full-changelog link are appended if available.
4. **Commit + tag + push** — bumps `package.json`, commits `chore: bump version to X.Y.Z`, tags `vX.Y.Z`, pushes both.
5. **Draft release** — creates the GitHub release with the generated notes via `gh release create --draft`. CI then builds and attaches the DMG/deb/AppImage and publishes.

### CI workflow update

The `create-release` job now checks whether a release already exists before creating one (`gh release view || gh release create`). This lets the script pre-create the release with rich notes without the CI job overwriting it with an empty one.

### ADR convention in CLAUDE.md

`CLAUDE.md` now documents when to write an ADR (any feature, architectural change, or non-obvious fix) and requires all ADRs for a release to be written and committed before running the release script. This makes ADRs the enforced source of truth for release notes rather than an optional afterthought.

## Consequences

- Releases are now a single command: `./scripts/release.sh [patch|minor|major]`.
- Release notes are written at the right level of detail — drawn from ADRs that already explain the *why*, not from terse commit subjects.
- The version-in-package.json always matches the tag, eliminating the class of mistake where assets are named after the wrong version.
- Any release not preceded by an ADR will produce thinner notes (commit-only fallback), creating a natural incentive to write ADRs before releasing.
- The script requires `git`, `gh`, `node`, and `jq` — all present in the standard dev environment.
