# ADR-0023: Design system v2 — new look and feel

**Status**: Accepted
**Date**: 2026-11-07

## Context

`docs/Cabinet — Opening Analysis redesign.{pdf,html}` specifies a redesigned
analysis board and a design system ("Built for reading the board"). The old
"flat ledger" look had a near-black dark square on which black pieces nearly
vanished (1.6 : 1), a brand-red accent that doubled as error/selection colour,
small mono-caps labels, and square-cornered controls under 44 px.

## Decision

Re-skin, not restructure. Layout (left rail / board / right rail) and every
component's behaviour are unchanged.

- **Tokens** (`styles.css` `:root`): paper `#f4f2ec`, white panels, ink
  `#15171c`, control border `#b9b2a2`; radii 6 / 8 / 12. Blue `#1f5bd8` is the
  single accent ("selected / you": current move, selection, primary button,
  focus ring); orange `#e8590c` is "engine suggestion" (arrows); red is reserved
  for danger/errors (`--danger`).
- **Board**: Wood theme with mid-tone dark squares (`#b58863`), yellow
  last-move tint, rounded board with shadow instead of a 3 px border. White
  pieces are a single filled glyph with an ink stroke painted under the fill
  (`paint-order: stroke fill`) for crisp edges; black pieces get a light halo.
  Glyphs use the text-presentation selector U+FE0E so ♟ never renders as emoji.
- **Type**: Fraunces (wordmark and line titles only), Inter (UI), JetBrains Mono
  (notation, evaluations), Noto Sans Symbols 2 (piece glyphs). Latin subsets are
  vendored in `assets/fonts/` (SIL OFL) and loaded by `@font-face`, so the
  Electron build works offline. `.woff2` was added to the MIME map in both
  `serve.js` and `electron/main.cjs`.
- **Chrome**: dark header bar with the wordmark and status; sentence-case panel
  headings; segmented Library / Insights / Patterns tabs; 40–44 px controls with
  a 2 px blue focus ring; eval bar widened to 22 px with ink/white halves.

## Not done

The design also proposes a unified library list (type badges, All / Lines /
Games chips, search, sort, ⋯ menu for delete) and moving Save into the board
header. Those change behaviour and data flow, so they are left for a separate
change. Board themes Slate and Green and the "Saved just now" status are
likewise not implemented.

## Consequences

- Only presentation changed; `node --test` still passes (277 tests).
- Any new red-for-accent usage should use `--danger` or `--accent` by intent.
