import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Chess from '../../slices/game-core/chess.js';
import { POSITIONS } from '../fixtures/positions.js';

// Enumerate moves, expanding pawn promotions into 4 separate moves each.
function perftMoves(state) {
  const moves = [];
  for (const [from, to] of Chess.allLegalMoves(state)) {
    const piece = state.board[from].toLowerCase();
    const [toR] = Chess.rcOf(to);
    if (piece === 'p' && (toR === 0 || toR === 7)) {
      for (const promo of ['q', 'r', 'b', 'n']) {
        moves.push([from, to, promo]);
      }
    } else {
      moves.push([from, to, null]);
    }
  }
  return moves;
}

function perft(state, depth) {
  if (depth === 0) return 1;
  const moves = perftMoves(state);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const [from, to, promo] of moves) {
    const result = Chess.applyMove(state, from, to, promo ? { promotion: promo } : {});
    if (result) nodes += perft(result.state, depth - 1);
  }
  return nodes;
}

const DEEP = !!process.env.PERFT_DEEP;

for (const pos of POSITIONS) {
  describe(`perft: ${pos.name}`, () => {
    const state = Chess.fromFEN(pos.fen);
    it('depth 1', () => assert.equal(perft(state, 1), pos.perft[1]));
    it('depth 2', () => assert.equal(perft(state, 2), pos.perft[2]));
    if (DEEP) {
      it('depth 3', { timeout: 30000 }, () => assert.equal(perft(state, 3), pos.perft[3]));
      it('depth 4', { timeout: 120000 }, () => assert.equal(perft(state, 4), pos.perft[4]));
    }
  });
}
