import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Chess from '../../slices/game-core/chess.js';

function move(state, from, to, opts = {}) {
  const r = Chess.applyMove(state, Chess.fromName(from), Chess.fromName(to), opts);
  assert.ok(r, `applyMove(${from}-${to}) returned null`);
  return r.state;
}

function meta(state, from, to, opts = {}) {
  const r = Chess.applyMove(state, Chess.fromName(from), Chess.fromName(to), opts);
  assert.ok(r, `applyMove(${from}-${to}) returned null`);
  return r.meta;
}

describe('en passant', () => {
  it('e4 sets enPassant to e3', () => {
    const s = move(Chess.START_STATE, 'e2', 'e4');
    assert.equal(Chess.nameOf(s.enPassant), 'e3');
    assert.equal(s.turn, 'b');
    assert.equal(s.fullmove, 1);
  });

  it('single-step pawn does not set enPassant', () => {
    const s1 = move(Chess.START_STATE, 'e2', 'e3');
    assert.equal(s1.enPassant, null);
  });

  it('en passant capture removes the captured pawn', () => {
    // e4, d5, e5, d5 — set up exd6 en passant
    let s = Chess.START_STATE;
    s = move(s, 'e2', 'e4'); // white e4
    s = move(s, 'd7', 'd5'); // black d5
    s = move(s, 'e4', 'e5'); // white e5
    s = move(s, 'f7', 'f5'); // black f5 (to give white an en passant target)
    const m = meta(s, 'e5', 'f6'); // white exf6 e.p.
    assert.equal(m.enPassant, true);
    const after = move(s, 'e5', 'f6');
    // f5 pawn must be gone
    assert.equal(after.board[Chess.fromName('f5')], '.');
    // white pawn on f6
    assert.equal(after.board[Chess.fromName('f6')], 'P');
  });
});

describe('castling', () => {
  // Position after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 — white ready to castle kingside
  const RUY = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

  it('white castles kingside: king on g1, rook on f1', () => {
    const s = Chess.fromFEN(RUY);
    const after = move(s, 'e1', 'g1');
    assert.equal(after.board[Chess.fromName('g1')], 'K');
    assert.equal(after.board[Chess.fromName('f1')], 'R');
    assert.equal(after.board[Chess.fromName('e1')], '.');
    assert.equal(after.board[Chess.fromName('h1')], '.');
  });

  it('castling rights drop K and Q after white castles kingside', () => {
    const s = Chess.fromFEN(RUY);
    const after = move(s, 'e1', 'g1');
    assert.ok(!after.castling.includes('K'), 'K should be gone');
    assert.ok(!after.castling.includes('Q'), 'Q should be gone');
  });

  it('moving h1 rook removes K castling right', () => {
    // White moves h-rook away from its home square
    const s = Chess.fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1');
    const after = move(s, 'h1', 'h2');
    assert.ok(!after.castling.includes('K'), 'K right should be removed');
    assert.ok(after.castling.includes('Q'), 'Q right should remain');
  });
});

describe('promotion', () => {
  // White pawn on a7, ready to promote
  const PROMO_FEN = '8/P7/8/8/8/8/8/4K1k1 w - - 0 1';

  it('promotes to queen by default when option is q', () => {
    const s = Chess.fromFEN(PROMO_FEN);
    const after = move(s, 'a7', 'a8', { promotion: 'q' });
    assert.equal(after.board[Chess.fromName('a8')], 'Q');
    assert.equal(after.board[Chess.fromName('a7')], '.');
  });

  it('promotes to knight', () => {
    const s = Chess.fromFEN(PROMO_FEN);
    const after = move(s, 'a7', 'a8', { promotion: 'n' });
    assert.equal(after.board[Chess.fromName('a8')], 'N');
  });

  it('promotes to rook', () => {
    const s = Chess.fromFEN(PROMO_FEN);
    const after = move(s, 'a7', 'a8', { promotion: 'r' });
    assert.equal(after.board[Chess.fromName('a8')], 'R');
  });
});

describe('halfmove clock', () => {
  it('resets on pawn move', () => {
    // Artificially inflate halfmove then make a pawn move
    const s = { ...Chess.START_STATE, halfmove: 10 };
    const after = move(s, 'e2', 'e4');
    assert.equal(after.halfmove, 0);
  });

  it('increments on quiet piece move', () => {
    // Move the b1 knight
    const s = Chess.START_STATE;
    const after = move(s, 'b1', 'c3');
    assert.equal(after.halfmove, 1);
  });

  it('resets on capture', () => {
    // e4, d5, exd5
    let s = Chess.START_STATE;
    s = move(s, 'e2', 'e4');
    s = move(s, 'd7', 'd5');
    const m = meta(s, 'e4', 'd5');
    assert.equal(m.captured, 'p');
    const after = move(s, 'e4', 'd5');
    assert.equal(after.halfmove, 0);
  });
});

describe('fullmove counter', () => {
  it('increments after black moves', () => {
    let s = move(Chess.START_STATE, 'e2', 'e4');
    assert.equal(s.fullmove, 1);
    s = move(s, 'e7', 'e5');
    assert.equal(s.fullmove, 2);
  });
});
