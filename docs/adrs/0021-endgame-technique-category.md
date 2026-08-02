# ADR-0021: Endgame technique category in the Patterns slice

**Status**: Accepted
**Date**: 2026-08-01

## Context

The user asked for a way to drill basic endgame technique the same way the Patterns slice already drills checkmate motifs. ADR-0016 built `category` as the extension point specifically for this ("openings/middlegame strategies... later"), and the entire pipeline — `buildTree`, `PatternsPanel`, `useDrill`'s `'mainline'` strictness, the drill-completion progress tracker (ADR-0019) — is already generic over any FEN + scripted SAN line, not mate-specific.

The catch: the dataset's correctness gate (`tests/patterns/patterns-data.test.js`) mechanically requires every entry's line to end in a real, fully-forced checkmate. That fits the four fundamental "basic mates" (K+Q, K+R, K+2B, K+B+N vs lone K) cleanly — each has a short, genuinely forced final sequence. It does **not** fit free-form endgame technique with multiple correct move orders (king-and-pawn opposition, Lucena, Philidor) or techniques that end in a won material advantage rather than mate — forcing one of those into a single canonical line would mark other correct moves as wrong, which is exactly the failure mode flagged when this was first discussed.

## Decision

- Added `{ id: 'endgame', label: 'Endgame technique' }` to `CATEGORIES` in `slices/patterns/patterns-data.js`, alongside the existing `mate` category. No code changes elsewhere — `PatternsPanel` already renders categories generically, `buildTree`/`useDrill` already treat every pattern uniformly.
- Added four entries, all lone-king basic mates, authored as **minimal constructed positions** (not real games) the same way most of the `mate` set already is:
  - `queen-king-mate` — K+Q vs K, 1 ply (`Qa8#`): the concluding move once the kings are in direct opposition.
  - `rook-king-mate` — K+R vs K, 3 plies (`Kb6 Kb8 Rh8#`): includes the opposition-taking move, so the drill also tests recognizing the shouldering technique, not just the final blow.
  - `two-bishops-mate` — K+2B vs K, 1 ply (`Be4#`): one bishop already covers a flight square, the other delivers mate on the long diagonal.
  - `bishop-knight-mate` — K+B+N vs K, 1 ply (`Bb7#`): the classically hard mate, but the position is set up with the king already in the bishop's-color corner (the technique's actual hard part — herding the king into the *correct* corner — is out of scope for a single scripted line).
- Every position was authored and pre-verified with a standalone script against the project's own `Chess` module (same checks the test suite runs — FEN round-trip, SAN round-trip through `Chess.toSAN`, forced checkmate with zero legal replies) before being added, then confirmed green under the real `tests/patterns/patterns-data.test.js`. `has exactly N entries` bumped from 25 to 29.
- Free-form technique (opposition, Lucena, Philidor, general rook-endgame play) is explicitly deferred — noted in the file's header comment — since it needs the engine-eval-based drill validation discussed but not yet built, rather than a fixed line.

## Consequences

- Endgame drilling works today for the four basic mates, fully reusing existing infrastructure (drill mode, completion tracking, UI) with zero structural changes — a data-only addition, exactly as ADR-0016 anticipated.
- The dataset's "every line is a verified forced mate" invariant holds uniformly across `mate` and `endgame` categories; the test suite doesn't need to special-case category.
- Adding king-and-pawn or rook-endgame technique later is a distinct, larger effort: either curate positions where a single line really is forced (rare beyond the basic mates), or extend `useDrill` to accept "any move that keeps the position winning" via the existing Stockfish worker instead of exact-SAN matching. Both remain open; this ADR intentionally stops at the low-risk, high-confidence slice.
