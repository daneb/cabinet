// Review quality tiers — node budgets per analyzed position. Pure data.
//
// Node-limited search (vs `go depth`) keeps per-position quality constant and
// makes batch time predictable. The single-threaded SF18-lite WASM build
// measures ~1.7 Mnps on an M4; the engine stays on one thread so the machine
// remains usable during a batch.

const QUALITY_TIERS = {
  fast: {
    label: 'Fast',
    nodes: 150000,
    hint: '~0.1s/position — bulk backfill of many games',
  },
  standard: {
    label: 'Standard',
    nodes: 600000,
    hint: '~0.4s/position (≈depth 18) — 20 games in ~10 min',
  },
  deep: {
    label: 'Deep',
    nodes: 2500000,
    hint: '~1.5s/position — single-game post-mortems',
  },
};

const DEFAULT_TIER = 'standard';

const ReviewBudgets = { QUALITY_TIERS, DEFAULT_TIER };

if (typeof window !== 'undefined') window.ReviewBudgets = ReviewBudgets;
export default ReviewBudgets;
