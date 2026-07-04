# ADR-0014: Insights — deterministic error patterns + optional Ollama coach

**Status**: Accepted
**Date**: 2026-07-04

## Context

The question this feature answers: *"do I have consistent, fixable errors across my games?"* — e.g. "I blunder in endgames" or "I collapse when worse". An LLM is the wrong tool for detecting these (LLMs are unreliable at chess analysis), but a generic algorithm over engine-classified moves detects them well. The user has Ollama on a 16 GB M4 and wanted narrative coaching output on top of the numbers.

## Decision

Two-layer design: **deterministic stats, optional verbalization.**

- **Tagging at review time** (`slices/game-review/features.js`, pure + tested): every reviewed move gets
  - *phase* — endgame ≤ 6 minor/major pieces; middlegame ≤ 10 or ply > 20; else opening;
  - *situation* — winning/better/equal/worse/lost from the eval before the move, mover's perspective (±80/±200 cp bands);
  - *features* — capture, check, king/pawn move, promotion, piece moved;
  - *motifs* — `missedWin` (≥ +300 → < +100), `missedMate`, `hungPiece` (loss ≥ 250 cp and the engine's best reply captures on the moved piece's square), `collapse` (mistake/blunder while worse/lost).
- **Aggregation** (`slices/insights/insights.js`, pure + tested): over reviewed library games, user's moves only — error rate (mistakes+blunders per 100 moves) and ACPL by phase and by situation, conversion/defence percentages, motif counts, per-opening table (first-8-plies key). **Sample-size guards**: cells under 30 moves are marked low-sample and excluded from findings; reviews from a mismatched `engineId` are excluded rather than mixed across eval scales. "Top findings" are the cells deviating most from the player's own overall baseline (≥ +2 errors/100 and ≥ 1.5x baseline).
- **Ollama layer** (`slices/insights/coach.js`): probes `GET /api/tags` (1.5 s timeout) and hides the button when Ollama is down — insights are fully useful without it. Generation is one `POST /api/chat` (temperature 0.4, non-streaming) with a system prompt that pins the contract: *interpret only the provided statistics, never invent moves or positions, flag small samples.* **No FENs or move lists are ever sent.** The configured model is used if installed, otherwise the first installed model. CORS failures surface as a one-line `OLLAMA_ORIGINS` hint.

## Consequences

- Pattern detection is reproducible and testable; the LLM can only rephrase, not hallucinate analysis. Verified end-to-end with `qwen2.5-coder:7b` (~20 s generation, ~5 GB RAM, one-shot).
- Phase/situation heuristics are deliberately coarse (material counts, eval bands). They are stored per move at review time, so refining them later requires re-review — acceptable, since re-review is cheap at Fast tier.
- Motif detection leans on the single captured best reply; it finds outright hangs but not deeper tactics. Chess.com-style Brilliant/Great/Miss remains rejected (ADR-0011).
