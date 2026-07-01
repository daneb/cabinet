// Game-review classification + accuracy math. Pure functions, no React, no DOM.
//
// Inputs: a sequence of per-position engine evaluations expressed in centipawns
// from White's perspective. Mate scores are clamped to ±MATE_CP for math.
//
// **Classification is by win-percentage loss, not raw centipawn loss.** A
// 150cp drop in an equal position is a real mistake (the win% craters from
// ~62% to ~45%), but the same 150cp drop in a +5 winning position is noise
// (~95% → ~93%). Lichess uses win% delta for exactly this reason.
//
//   winPct(cp) = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
//   accuracy(loss%) = 103.1668 * exp(-0.04354 * loss%) - 3.1669   (clamped 0..100)
//
// Per-game accuracy is the mean of per-move accuracy values for that side
// (Lichess uses a weighted/harmonic blend; mean is a close-enough v1).

const MATE_CP = 10000;
const MATE_CLAMP_FOR_MATH = 1000;

function evalToCp(evalObj) {
  if (!evalObj) return null;
  if (evalObj.type === 'cp') return evalObj.value;
  if (evalObj.type === 'mate') {
    // mate 0 (from the side-to-move's view) = that side is already mated → -MATE_CP.
    // Positive non-zero = giving mate; negative = receiving mate.
    if (evalObj.value === 0) return -MATE_CP;
    return evalObj.value > 0 ? MATE_CP : -MATE_CP;
  }
  return null;
}

function clampForMath(cp) {
  if (cp == null) return null;
  if (cp > MATE_CLAMP_FOR_MATH) return MATE_CLAMP_FOR_MATH;
  if (cp < -MATE_CLAMP_FOR_MATH) return -MATE_CLAMP_FOR_MATH;
  return cp;
}

// Centipawn loss for a move, from the moving player's perspective.
// `turn` is the side that moved ('w' or 'b').
function computeLossCp(evalBeforeCp, evalAfterCp, turn) {
  if (evalBeforeCp == null || evalAfterCp == null) return null;
  const before = clampForMath(evalBeforeCp);
  const after = clampForMath(evalAfterCp);
  const sign = turn === 'w' ? 1 : -1;
  const loss = sign * (before - after);
  return loss < 0 ? 0 : loss;
}

// Win-percentage loss for a move, from the moving player's perspective.
// Returns a 0..100 value (NOT 0..1). Negative values (player "improved" beyond
// the engine) clamp to 0.
function computeWinPctLoss(evalBeforeCp, evalAfterCp, turn) {
  if (evalBeforeCp == null || evalAfterCp == null) return null;
  const wBefore = cpToWinPct(evalBeforeCp);
  const wAfter = cpToWinPct(evalAfterCp);
  const sign = turn === 'w' ? 1 : -1;
  const loss = sign * (wBefore - wAfter);
  return loss < 0 ? 0 : loss;
}

// Lichess-style classification by win-percentage loss. Mirrors Lichess thresholds
// (0.10 / 0.20 / 0.30 of winning chance, scaled to a 0–100 percentage).
function classifyByWinPctLoss(winPctLoss, opts = {}) {
  if (winPctLoss == null) return null;
  if (opts.wasBestMove) return 'best';
  if (winPctLoss < 1) return 'best';
  if (winPctLoss < 3) return 'excellent';
  if (winPctLoss < 10) return 'good';
  if (winPctLoss < 20) return 'inaccuracy';
  if (winPctLoss < 30) return 'mistake';
  return 'blunder';
}

// Lichess win-percentage curve.
function cpToWinPct(cp) {
  const c = clampForMath(cp);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

// Lichess per-move accuracy from win-percentage loss.
function winPctLossToAccuracy(winPctLoss) {
  const a = 103.1668 * Math.exp(-0.04354 * winPctLoss) - 3.1669;
  if (a < 0) return 0;
  if (a > 100) return 100;
  return a;
}

// Per-move accuracy% given before/after eval cps and which side moved.
function moveAccuracy(evalBeforeCp, evalAfterCp, turn) {
  const loss = computeWinPctLoss(evalBeforeCp, evalAfterCp, turn);
  if (loss == null) return null;
  return winPctLossToAccuracy(loss);
}

// Aggregate per-side accuracy + classification counts.
// `moves` is an array of { turn, lossCp, classification, accuracy }.
function summarize(moves) {
  const blank = () => ({
    accuracy: null,
    counts: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
    moveCount: 0,
  });
  const result = { white: blank(), black: blank() };
  const acc = { white: [], black: [] };

  for (const m of moves) {
    if (!m || !m.turn) continue;
    const side = m.turn === 'w' ? 'white' : 'black';
    result[side].moveCount++;
    if (m.classification && result[side].counts[m.classification] != null) {
      result[side].counts[m.classification]++;
    }
    if (m.accuracy != null) acc[side].push(m.accuracy);
  }

  for (const side of ['white', 'black']) {
    if (acc[side].length > 0) {
      const sum = acc[side].reduce((a, b) => a + b, 0);
      result[side].accuracy = sum / acc[side].length;
    }
  }

  return result;
}

const Classify = {
  MATE_CP,
  evalToCp,
  computeLossCp,
  computeWinPctLoss,
  classifyByWinPctLoss,
  cpToWinPct,
  moveAccuracy,
  summarize,
};

if (typeof window !== 'undefined') window.GameReviewClassify = Classify;
export default Classify;
