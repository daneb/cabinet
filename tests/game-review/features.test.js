import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Chess from '../../slices/game-core/chess.js';
import MoveTree from '../../slices/move-tree/move-tree.js';
import Classify from '../../slices/game-review/classify.js';
import Features from '../../slices/game-review/features.js';
globalThis.Chess = Chess;
globalThis.MoveTree = MoveTree;
globalThis.GameReviewClassify = Classify;

const {
  phaseOf, situationOf, moveFeatures, motifsFor,
  sideScore, gameOutcomeMotifs, openingKey, tagMoves,
} = Features;

const START_BOARD = Chess.START_STATE.board;

describe('phaseOf', () => {
  it('start position is opening', () => {
    assert.equal(phaseOf(START_BOARD, 1), 'opening');
  });

  it('past ply 20 is middlegame even with full material', () => {
    assert.equal(phaseOf(START_BOARD, 21), 'middlegame');
  });

  it('king-and-pawn boards are endgame', () => {
    const board = '....k...' + '........' + '........' + '........' +
                  '........' + '........' + 'PPP.....' + '....K...';
    assert.equal(phaseOf(board, 40), 'endgame');
  });

  it('six or fewer pieces is endgame regardless of ply', () => {
    const board = 'r...k...' + '........' + '........' + '........' +
                  '........' + '........' + '........' + 'R...K..R';
    assert.equal(phaseOf(board, 10), 'endgame');
  });
});

describe('situationOf', () => {
  it('flips perspective for black', () => {
    assert.equal(situationOf(250, 'w'), 'winning');
    assert.equal(situationOf(250, 'b'), 'lost');
    assert.equal(situationOf(-250, 'b'), 'winning');
  });

  it('buckets around the thresholds', () => {
    assert.equal(situationOf(100, 'w'), 'better');
    assert.equal(situationOf(0, 'w'), 'equal');
    assert.equal(situationOf(-100, 'w'), 'worse');
    assert.equal(situationOf(null, 'w'), null);
  });
});

describe('moveFeatures', () => {
  it('tags pawn moves and captures', () => {
    // 1. e4 from the start position
    const from = Chess.fromName('e2');
    const to = Chess.fromName('e4');
    const result = Chess.applyMove(Chess.START_STATE, from, to);
    const node = { from, to, captured: null, promotion: null, state: result.state };
    const { piece, features } = moveFeatures(Chess.START_STATE, node);
    assert.equal(piece, 'p');
    assert.ok(features.includes('pawnMove'));
    assert.ok(!features.includes('capture'));
  });
});

describe('motifsFor', () => {
  it('missedWin: winning eval collapses to nothing', () => {
    const motifs = motifsFor({
      evalBeforeCp: 400, evalAfterCp: 0, turn: 'w',
      lossCp: 400, classification: 'blunder', situation: 'winning',
      scoreBefore: { type: 'cp', value: 400 }, scoreAfter: { type: 'cp', value: 0 },
      bestReplyUci: null, toSquareName: null,
    });
    assert.ok(motifs.includes('missedWin'));
  });

  it('missedMate: mate-for-mover disappears', () => {
    const motifs = motifsFor({
      evalBeforeCp: 10000, evalAfterCp: 200, turn: 'b',
      scoreBefore: { type: 'mate', value: -3 }, scoreAfter: { type: 'cp', value: 200 },
      lossCp: 800, classification: 'blunder', situation: 'winning',
      bestReplyUci: null, toSquareName: null,
    });
    assert.ok(motifs.includes('missedMate'));
  });

  it('hungPiece: best reply captures the moved piece', () => {
    const motifs = motifsFor({
      evalBeforeCp: 0, evalAfterCp: -300, turn: 'w',
      scoreBefore: { type: 'cp', value: 0 }, scoreAfter: { type: 'cp', value: -300 },
      lossCp: 300, classification: 'blunder', situation: 'equal',
      bestReplyUci: 'd8g5', toSquareName: 'g5',
    });
    assert.ok(motifs.includes('hungPiece'));
  });

  it('collapse: mistake while already worse', () => {
    const motifs = motifsFor({
      evalBeforeCp: -150, evalAfterCp: -400, turn: 'w',
      scoreBefore: { type: 'cp', value: -150 }, scoreAfter: { type: 'cp', value: -400 },
      lossCp: 250, classification: 'mistake', situation: 'worse',
      bestReplyUci: null, toSquareName: null,
    });
    assert.ok(motifs.includes('collapse'));
  });

  it('no motifs on a quiet good move', () => {
    const motifs = motifsFor({
      evalBeforeCp: 30, evalAfterCp: 25, turn: 'w',
      scoreBefore: { type: 'cp', value: 30 }, scoreAfter: { type: 'cp', value: 25 },
      lossCp: 5, classification: 'best', situation: 'equal',
      bestReplyUci: 'e7e5', toSquareName: 'f3',
    });
    assert.deepEqual(motifs, []);
  });
});

describe('gameOutcomeMotifs', () => {
  const winningMoves = [{ turn: 'w', situation: 'winning' }, { turn: 'b', situation: 'lost' }];

  it('failedConversion: was winning, did not win', () => {
    assert.ok(gameOutcomeMotifs(winningMoves, '1/2-1/2', 'w').includes('failedConversion'));
    assert.ok(!gameOutcomeMotifs(winningMoves, '1-0', 'w').includes('failedConversion'));
  });

  it('defence flags for the side that was lost', () => {
    assert.ok(gameOutcomeMotifs(winningMoves, '1/2-1/2', 'b').includes('goodDefence'));
    assert.ok(gameOutcomeMotifs(winningMoves, '1-0', 'b').includes('failedDefence'));
  });

  it('unknown result yields nothing', () => {
    assert.deepEqual(gameOutcomeMotifs(winningMoves, '*', 'w'), []);
  });
});

describe('sideScore', () => {
  it('maps results to scores', () => {
    assert.equal(sideScore('1-0', 'w'), 1);
    assert.equal(sideScore('1-0', 'b'), 0);
    assert.equal(sideScore('0-1', 'b'), 1);
    assert.equal(sideScore('1/2-1/2', 'w'), 0.5);
    assert.equal(sideScore('*', 'w'), null);
  });
});

describe('openingKey', () => {
  it('joins the first 8 plies', () => {
    const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5'];
    assert.equal(openingKey(sans), 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5');
  });
});

describe('tagMoves — end to end on a real line', () => {
  // Build 1. e4 e5 2. Nf3 in a move tree and feed synthetic evals.
  let tree = MoveTree.createTree(Chess.START_STATE);
  let cur = tree.rootId;
  for (const san of ['e4', 'e5', 'Nf3']) {
    const parsed = Chess.parseSAN(tree.nodes[cur].state, san);
    const res = MoveTree.playMove(tree, cur, parsed.from, parsed.to, {});
    tree = res.tree;
    cur = res.nodeId;
  }
  const mainline = MoveTree.walkMainline(tree, tree.rootId);
  const results = [
    { fen: 'f0', score: { type: 'cp', value: 30 }, bestMove: 'e2e4' },
    { fen: 'f1', score: { type: 'cp', value: 30 }, bestMove: 'e7e5' },
    { fen: 'f2', score: { type: 'cp', value: 25 }, bestMove: 'g1f3' },
    { fen: 'f3', score: { type: 'cp', value: 25 }, bestMove: 'b8c6' },
  ];

  it('tags every mainline move with class, phase, situation', () => {
    const moves = tagMoves(mainline, results);
    assert.equal(moves.length, 3);
    for (const m of moves) {
      assert.equal(m.phase, 'opening');
      assert.equal(m.situation, 'equal');
      assert.equal(m.class, 'best'); // all played engine-best moves
      assert.ok(m.accuracy > 95);
    }
    assert.deepEqual(moves.map(m => m.turn), ['w', 'b', 'w']);
    assert.deepEqual(moves.map(m => m.san), ['e4', 'e5', 'Nf3']);
  });
});
