// Game-review classification + accuracy math. Pure functions, no React, no DOM.
//
// Inputs: a sequence of per-position engine evaluations expressed in centipawns
// from White's perspective. Mate scores are clamped to ±MATE_CP for math.
//
// For each ply, the centipawn loss attributed to the player who moved is
//   loss = (turn === 'w' ? 1 : -1) * (evalBefore - evalAfter)
// clamped to >= 0 (a "better than the engine" move just gets loss 0).
//
// Accuracy follows the Lichess formula:
//   winPct(cp) = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
//   accuracy(loss%) = 103.1668 * exp(-0.04354 * loss%) - 3.1669   (clamped 0..100)
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

// Lichess-style classification by centipawn loss.
// A "best" move is loss <= 10cp (close enough to engine's top choice).
function classifyByLoss(lossCp, opts = {}) {
  if (lossCp == null) return null;
  if (opts.wasBestMove) return 'best';
  if (lossCp <= 10) return 'best';
  if (lossCp < 30) return 'excellent';
  if (lossCp < 60) return 'good';
  if (lossCp < 100) return 'inaccuracy';
  if (lossCp < 200) return 'mistake';
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
  if (evalBeforeCp == null || evalAfterCp == null) return null;
  const wBefore = cpToWinPct(evalBeforeCp);
  const wAfter = cpToWinPct(evalAfterCp);
  // Win pct from the moving player's view.
  const sign = turn === 'w' ? 1 : -1;
  const lossPct = sign * (wBefore - wAfter);
  const clamped = lossPct < 0 ? 0 : lossPct;
  return winPctLossToAccuracy(clamped);
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
  classifyByLoss,
  cpToWinPct,
  moveAccuracy,
  summarize,
};

if (typeof window !== 'undefined') window.GameReviewClassify = Classify;
export default Classify;
