# Cabinet

> A desktop tool for studying chess opening repertoires from memory.

![Cabinet — Opening Analysis Board](assets/cabinet.png)

---

## Download

Grab the latest `.dmg` from [**Releases →**](../../releases)

---

## Features

| | |
|---|---|
| **Move tree** | Full branching variations. Arrow keys walk depth and sibling lines. |
| **Drill mode** | Play your repertoire from memory. Misses reveal the expected move; a final summary shows your score and every miss. |
| **Study tracking** | Per-move status — unseen, reviewing, known — with automatic spaced-repetition decay. |
| **Chapter support** | PGN comments like `{Chapter: The King's English}` organise lines with aggregate stats and one-click drilling. |
| **Engine analysis** | Stockfish 16 runs locally, no API key needed. Top-3 MultiPV arrows render directly on the board. |
| **PGN import/export** | Full round-trip: variations, NAGs, comments, and headers all preserved. |

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Step backward / forward |
| `↑` / `↓` | Cycle sibling variations |
| `Home` / `End` | Jump to start / end of mainline |
| `F` | Flip board |
| `?` | Show hint *(drill mode)* |
| `Esc` | End drill / deselect |

---

## Development

```bash
npm install
npm run dev        # esbuild watch + serve at http://localhost:8765
```

To package a local DMG:

```bash
npm run package    # builds bundle, then runs electron-builder
```

### Releases

Use the release script — it handles the version bump, tag, and GitHub release creation in one step:

```bash
./scripts/release.sh          # patch bump  (1.0.x → 1.0.x+1)
./scripts/release.sh minor    # minor bump  (1.x.0 → 1.x+1.0)
./scripts/release.sh major    # major bump  (x.0.0 → x+1.0.0)
./scripts/release.sh 2.1.0    # explicit version
```

The script will:
1. Check your working tree is clean and `gh` has repo permissions.
2. Ask for confirmation, then bump `package.json`, commit, tag, and push.
3. Generate release notes from any ADR files changed since the last tag, with `fix:` commits as a fallback.
4. Create a draft GitHub release with those notes.
5. Trigger the [CI workflow](.github/workflows/release.yml) which builds the DMG and Linux packages, attaches them, and publishes the release.

**Before releasing**, write an ADR in `docs/adrs/` for any feature or non-obvious fix — the script pulls `## Context` and `## Decision` from each changed ADR to produce user-facing release notes. See `CLAUDE.md` for the full convention.

**Prerequisites**: `gh auth login` with `repo` scope. If your token lacks it, run `gh auth refresh -s repo`.

**Recovering from a failed release creation** (e.g. after fixing token permissions when the tag is already pushed):

```bash
./scripts/release.sh --create-release v1.0.13
```

---

*Private — all rights reserved.*
