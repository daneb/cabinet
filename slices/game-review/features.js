// Game-review feature tagging — pure functions, no React, no DOM.
//
// Tags each reviewed move with the context Insights aggregates over:
//   phase      — opening | middlegame | endgame (material + ply heuristic)
//   situation  — winning | better | equal | worse | lost (eval before the
//                move, from the mover's perspective)
//   features   — capture / check / kingMove / pawnMove / promotion
//   motifs     — missedWin / missedMate / hungPiece / collapse
//
// All eval inputs are centipawns from White's perspective (the analyzer's
// output); helpers flip to the mover's perspective internally.

const SITUATION_WINNING = 200;
const SITUATION_BETTER = 80;
const HUNG_PIECE_MIN_LOSS_CP = 250;
const MISSED_WIN_BEFORE_CP = 300;
const MISSED_WIN_AFTER_CP = 100;

function moverCp(cpWhite, turn) {
  if (cpWhite == null) return null;
  return turn === 'w' ? cpWhite : -cpWhite;
}

// Board is the 64-char string; m = non-pawn, non-king pieces on the board.
// Lichess-style division: few pieces = endgame; reduced material or past the
// opening plies = middlegame.
function phaseOf(board, ply) {
  let m = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i].toLowerCase();
    if (p === 'n' || p === 'b' || p === 'r' || p === 'q') m++;
  }
  if (m <= 6) return 'endgame';
  if (m <= 10 || ply > 20) return 'middlegame';
  return 'opening';
}

function situationOf(evalBeforeCp, turn) {
  const cp = moverCp(evalBeforeCp, turn);
  if (cp == null) return null;
  if (cp >= SITUATION_WINNING) return 'winning';
  if (cp >= SITUATION_BETTER) return 'better';
  if (cp > -SITUATION_BETTER) return 'equal';
  if (cp > -SITUATION_WINNING) return 'worse';
  return 'lost';
}

// `parentState` is the position before the move; `node` the move-tree node
// after it (carries from/to as 0–63 indices, captured, promotion, state).
function moveFeatures(parentState, node) {
  const features = [];
  const pieceChar = node.from != null ? parentState.board[node.from] : null;
  const piece = pieceChar && pieceChar !== '.' ? pieceChar.toLowerCase() : null;
  if (node.captured) features.push('capture');
  if (node.promotion) features.push('promotion');
  if (piece === 'k') features.push('kingMove');
  if (piece === 'p') features.push('pawnMove');
  if (node.state && globalThis.Chess.inCheck(node.state, node.state.turn)) features.push('check');
  return { piece, features };
}

function isMateFor(score, turn) {
  return !!score && score.type === 'mate' && score.value !== 0 &&
    (turn === 'w' ? score.value > 0 : score.value < 0);
}

// `scoreBefore`/`scoreAfter` are raw { type, value } evals (White POV);
// `bestReplyUci` is the engine's best move in the position AFTER this move;
// `toSquareName` is where the moved piece landed ('e4' style).
function motifsFor({ scoreBefore, scoreAfter, evalBeforeCp, evalAfterCp, turn,
                     lossCp, classification, situation, bestReplyUci, toSquareName }) {
  const motifs = [];
  const before = moverCp(evalBeforeCp, turn);
  const after = moverCp(evalAfterCp, turn);

  if (before != null && after != null &&
      before >= MISSED_WIN_BEFORE_CP && after < MISSED_WIN_AFTER_CP) {
    motifs.push('missedWin');
  }
  if (isMateFor(scoreBefore, turn) && !isMateFor(scoreAfter, turn)) {
    motifs.push('missedMate');
  }
  if (lossCp != null && lossCp >= HUNG_PIECE_MIN_LOSS_CP &&
      bestReplyUci && toSquareName && bestReplyUci.slice(2, 4) === toSquareName) {
    motifs.push('hungPiece');
  }
  if ((classification === 'mistake' || classification === 'blunder') &&
      (situation === 'worse' || situation === 'lost')) {
    motifs.push('collapse');
  }
  return motifs;
}

// Game score for a side from the PGN Result header: 1 / 0.5 / 0, or null if
// the result is unknown.
function sideScore(result, side) {
  if (result === '1-0') return side === 'w' ? 1 : 0;
  if (result === '0-1') return side === 'w' ? 0 : 1;
  if (result === '1/2-1/2') return 0.5;
  return null;
}

// Per-game, per-side flags from the tagged move list + game result.
// `moves` entries need { turn, situation }.
function gameOutcomeMotifs(moves, result, side) {
  const score = sideScore(result, side);
  if (score == null) return [];
  const own = moves.filter(m => m.turn === side);
  const sawWinning = own.some(m => m.situation === 'winning');
  const sawLost = own.some(m => m.situation === 'lost');
  const motifs = [];
  if (sawWinning && score < 1) motifs.push('failedConversion');
  if (sawLost && score >= 0.5) motifs.push('goodDefence');
  if (sawLost && score < 0.5) motifs.push('failedDefence');
  return motifs;
}

// Grouping key for "which opening was this" — first N plies of mainline SAN.
function openingKey(sans, plies = 8) {
  return sans.slice(0, plies).join(' ');
}

// Full per-move tagging for a reviewed mainline.
// `mainline` — nodes from MoveTree.walkMainline (root first).
// `results`  — analyzer output aligned with mainline: [{ fen, score, bestMove }].
// Returns the review `moves` array stored on a library record.
function tagMoves(mainline, results) {
  const C = globalThis.GameReviewClassify;
  const out = [];
  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i];
    const parent = mainline[i - 1];
    const turn = parent.state.turn;
    const scoreBefore = results[i - 1] ? results[i - 1].score : null;
    const scoreAfter = results[i] ? results[i].score : null;
    const evalBeforeCp = C.evalToCp(scoreBefore);
    const evalAfterCp = C.evalToCp(scoreAfter);

    const playedUci = node.from != null && node.to != null
      ? globalThis.Chess.nameOf(node.from) + globalThis.Chess.nameOf(node.to)
      : null;
    const engineBest = results[i - 1] ? results[i - 1].bestMove : null;
    const wasBestMove = !!(playedUci && engineBest && engineBest.slice(0, 4) === playedUci);

    const lossCp = C.computeLossCp(evalBeforeCp, evalAfterCp, turn);
    const winPctLoss = C.computeWinPctLoss(evalBeforeCp, evalAfterCp, turn);
    const classification = C.classifyByWinPctLoss(winPctLoss, { wasBestMove });
    const accuracy = C.moveAccuracy(evalBeforeCp, evalAfterCp, turn);

    const phase = phaseOf(parent.state.board, node.ply);
    const situation = situationOf(evalBeforeCp, turn);
    const { piece, features } = moveFeatures(parent.state, node);
    const motifs = motifsFor({
      scoreBefore, scoreAfter, evalBeforeCp, evalAfterCp, turn,
      lossCp, classification, situation,
      bestReplyUci: results[i] ? results[i].bestMove : null,
      toSquareName: node.to != null ? globalThis.Chess.nameOf(node.to) : null,
    });

    out.push({
      ply: node.ply, san: node.san, turn,
      lossCp, winPctLoss, class: classification, accuracy,
      phase, situation, piece, features, motifs,
    });
  }
  return out;
}

const GameReviewFeatures = {
  phaseOf,
  situationOf,
  moveFeatures,
  motifsFor,
  sideScore,
  gameOutcomeMotifs,
  openingKey,
  tagMoves,
};

if (typeof window !== 'undefined') window.GameReviewFeatures = GameReviewFeatures;
export default GameReviewFeatures;
