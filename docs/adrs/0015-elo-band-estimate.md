# ADR-0015: Playing-strength band estimate from ACPL

**Status**: Accepted
**Date**: 2026-07-04

## Context

The user asked whether a near-accurate Elo for each player can be derived from their play. The honest answer: not from one game. Engine-consistency metrics (ACPL, accuracy) correlate with rating, but a single game's estimate is uncertain by several hundred Elo, and systematic error — time control, opposition strength, opening familiarity, eval scale — never averages out completely. ADR-0011 listed "no Game Rating" as a non-goal; this revisits it with uncertainty as the headline rather than a point score.

## Decision

- `slices/game-review/elo.js` (pure + tested): monotone piecewise-linear interpolation over an ACPL→rating table in the style of published Lichess-data fits (10→2700, 25→2350, 40→2000, 60→1700, 80→1450, 100→1250, 130→1000), computed from the mover's mean mate-clamped centipawn loss.
- Games with fewer than 20 scored moves for the side are excluded.
- **Bands, never points**: ±300 per game; aggregated over n games the band is `max(150, 300/√n)` — the 150 floor is deliberate honesty about systematic error. The aggregate uses move-weighted ACPL so long games count for more.
- Displayed only in the Insights panel as e.g. **"Estimated playing strength: 1650 ± 250 (14 games) — engine-consistency estimate, not a rating."** The formatter refuses to output a bare number.

## Consequences

- Users get a stable, honestly-framed strength read that sharpens with more reviewed games; it will never claim precision it doesn't have.
- Per-opening or per-phase Elo is intentionally not offered — samples never support it.
- `%clk` move-time analysis (time-pressure effects) is future work; the PGN parser already preserves comments, so the data survives import.
