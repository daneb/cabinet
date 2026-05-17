import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Chess from '../../slices/game-core/chess.js';

function san(state, from, to, opts = {}) {
  return Chess.toSAN(state, Chess.fromName(from), Chess.fromName(to), opts);
}

function play(state, from, to, opts = {}) {
  return Chess.applyMove(state, Chess.fromName(from), Chess.fromName(to), opts).state;
}

describe('toSAN — pawn moves', () => {
  it('e4 from start', () => {
    assert.equal(san(Chess.START_STATE, 'e2', 'e4'), 'e4');
  });

  it('e3 from start', () => {
    assert.equal(san(Chess.START_STATE, 'e2', 'e3'), 'e3');
  });

  it('pawn capture includes file', () => {
    let s = Chess.START_STATE;
    s = play(s, 'e2', 'e4');
    s = play(s, 'd7', 'd5');
    assert.equal(san(s, 'e4', 'd5'), 'exd5');
  });

  it('promotion to queen', () => {
    const s = Chess.fromFEN('8/P7/8/8/8/8/8/4K1k1 w - - 0 1');
    assert.equal(san(s, 'a7', 'a8', { promotion: 'q' }), 'a8=Q');
  });

  it('promotion with check', () => {
    // White pawn on b7, black king on a8 — b8=Q+ is check
    const s = Chess.fromFEN('k7/1P6/8/8/8/8/8/4K3 w - - 0 1');
    assert.equal(san(s, 'b7', 'b8', { promotion: 'q' }), 'b8=Q+');
  });
});

describe('toSAN — piece moves', () => {
  it('Nf3 from start', () => {
    assert.equal(san(Chess.START_STATE, 'g1', 'f3'), 'Nf3');
  });

  it('castles kingside O-O', () => {
    const s = Chess.fromFEN('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
    assert.equal(san(s, 'e1', 'g1'), 'O-O');
  });

  it('castles queenside O-O-O', () => {
    const s = Chess.fromFEN('r3kbnr/ppp1pppp/2nq4/3p4/3P4/2NQ4/PPP1PPPP/R3KBNR w KQkq - 4 5');
    assert.equal(san(s, 'e1', 'c1'), 'O-O-O');
  });
});

describe('toSAN — check and checkmate suffixes', () => {
  it('check adds +', () => {
    // Qd7+ — queen moves to d7, checking king on e8 diagonally
    const s = Chess.fromFEN('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
    assert.equal(san(s, 'd1', 'd7'), 'Qd7+');
  });

  it('checkmate adds #', () => {
    // Scholar\'s mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#
    let s = Chess.START_STATE;
    s = play(s, 'e2', 'e4');
    s = play(s, 'e7', 'e5');
    s = play(s, 'f1', 'c4');
    s = play(s, 'b8', 'c6');
    s = play(s, 'd1', 'h5');
    s = play(s, 'g8', 'f6');
    assert.equal(san(s, 'h5', 'f7'), 'Qxf7#');
  });
});

describe('toSAN — disambiguation', () => {
  it('two rooks on same file: disambiguate by rank', () => {
    // Two white rooks on a1 and a3, both can go to a2
    const s = Chess.fromFEN('4k3/8/8/8/8/R7/8/R3K3 w Q - 0 1');
    // Ra1-a2 vs Ra3-a2: should be R1a2 and R3a2
    assert.equal(san(s, 'a1', 'a2'), 'R1a2');
    assert.equal(san(s, 'a3', 'a2'), 'R3a2');
  });

  it('two rooks on same rank: disambiguate by file', () => {
    // Rb1 and Rg1 can both reach d1; king on f4 keeps rooks unblocked, black king on a6
    const s = Chess.fromFEN('8/8/k7/8/5K2/8/8/1R4R1 w - - 0 1');
    assert.equal(san(s, 'b1', 'd1'), 'Rbd1');
    assert.equal(san(s, 'g1', 'd1'), 'Rgd1');
  });
});
