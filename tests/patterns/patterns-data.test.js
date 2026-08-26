import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Chess from '../../slices/game-core/chess.js';
import MoveTree from '../../slices/move-tree/move-tree.js';
import Patterns from '../../slices/patterns/patterns-data.js';

// Needed by move-tree.js / patterns-data.js which reference globalThis
globalThis.Chess = Chess;
globalThis.MoveTree = MoveTree;

const { PATTERNS, CATEGORIES, buildTree } = Patterns;

describe('patterns dataset shape', () => {
  it('has exactly 33 entries', () => {
    assert.equal(PATTERNS.length, 33);
  });

  it('has unique ids', () => {
    const ids = PATTERNS.map(p => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('every entry has the required fields', () => {
    for (const p of PATTERNS) {
      assert.match(p.id, /^[a-z0-9-]+$/, `${p.id}: id must be kebab-case`);
      assert.ok(p.name, `${p.id}: name`);
      assert.ok(p.description && p.description.length > 20, `${p.id}: description`);
      assert.ok(Array.isArray(p.line) && p.line.length > 0, `${p.id}: line`);
      assert.ok(p.sideToWin === 'w' || p.sideToWin === 'b', `${p.id}: sideToWin`);
      assert.ok(CATEGORIES.some(c => c.id === p.category), `${p.id}: category "${p.category}" not in CATEGORIES`);
    }
  });
});

describe('pattern category drillability', () => {
  it('endgame category is not drillable', () => {
    assert.equal(CATEGORIES.find(c => c.id === 'endgame').drillable, false);
  });

  it('mate category is not drillable', () => {
    assert.equal(CATEGORIES.find(c => c.id === 'mate').drillable, false);
  });
});

describe('patterns positions are valid', () => {
  for (const p of PATTERNS) {
    it(`${p.id}: FEN is sane`, () => {
      const state = Chess.fromFEN(p.fen);
      assert.equal(state.board.length, 64, 'board is 64 squares');
      assert.ok(Chess.findKing(state.board, 'w') >= 0, 'white king present');
      assert.ok(Chess.findKing(state.board, 'b') >= 0, 'black king present');
      assert.equal(state.turn, p.sideToWin, 'side to move is the winning side');
      const opp = state.turn === 'w' ? 'b' : 'w';
      assert.ok(!Chess.inCheck(state, opp), 'side not to move is not in check');
      // FEN round-trips through the engine
      assert.equal(Chess.stateToFEN(state), p.fen);
    });
  }
});

describe('patterns lines are legal and end in verified mate', () => {
  for (const p of PATTERNS) {
    it(`${p.id}: ${p.line.join(' ')}`, () => {
      let state = Chess.fromFEN(p.fen);
      p.line.forEach((san, i) => {
        const mv = Chess.parseSAN(state, san);
        assert.ok(mv, `ply ${i + 1}: "${san}" is illegal or ambiguous`);
        const opts = mv.promotion ? { promotion: mv.promotion } : {};
        // Engine-produced SAN must match the authored SAN exactly
        // (correct disambiguation and +/# suffixes).
        const engineSan = Chess.toSAN(state, mv.from, mv.to, opts);
        assert.equal(engineSan, san, `ply ${i + 1}: authored "${san}" vs engine "${engineSan}"`);
        const isLast = i === p.line.length - 1;
        assert.equal(san.endsWith('#'), isLast, `ply ${i + 1}: only the final move may mate`);
        const res = Chess.applyMove(state, mv.from, mv.to, opts);
        assert.ok(res, `ply ${i + 1}: applyMove failed for "${san}"`);
        state = res.state;
      });
      // Final position is a true checkmate for the winning side.
      assert.equal(state.turn === 'w' ? 'b' : 'w', p.sideToWin, 'loser is to move');
      assert.ok(Chess.inCheck(state, state.turn), 'loser is in check');
      assert.equal(Chess.allLegalMoves(state).length, 0, 'loser has no legal moves');
    });
  }
});

describe('buildTree', () => {
  for (const p of PATTERNS) {
    it(`${p.id}: builds a tree matching the line`, () => {
      const { tree, error } = buildTree(p);
      assert.equal(error, null);
      assert.ok(tree);
      assert.equal(MoveTree.mainlineDepth(tree), p.line.length);
      const mainline = MoveTree.walkMainline(tree);
      assert.equal(mainline[0].comment, p.description, 'description on root comment');
      mainline.slice(1).forEach((node, i) => {
        assert.equal(node.san, p.line[i]);
      });
    });
  }
});
