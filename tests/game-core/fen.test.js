import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Chess from '../../slices/game-core/chess.js';
import { POSITIONS } from '../fixtures/positions.js';

describe('stateToFEN', () => {
  it('round-trips START_STATE', () => {
    assert.equal(
      Chess.stateToFEN(Chess.START_STATE),
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
  });

  it('fromFEN → stateToFEN is identity for all five perft positions', () => {
    for (const pos of POSITIONS) {
      const state = Chess.fromFEN(pos.fen);
      assert.equal(Chess.stateToFEN(state), pos.fen, `failed for ${pos.name}`);
    }
  });

  it('reflects en passant square', () => {
    const s = Chess.applyMove(Chess.START_STATE, Chess.fromName('e2'), Chess.fromName('e4')).state;
    assert.ok(Chess.stateToFEN(s).includes(' e3 '), 'FEN should include e3 en passant');
  });

  it('reflects updated castling rights after king moves', () => {
    const s = Chess.fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1');
    const after = Chess.applyMove(s, Chess.fromName('e1'), Chess.fromName('f1')).state;
    const fen = Chess.stateToFEN(after);
    assert.ok(!fen.split(' ')[2].includes('K'), 'K right should be gone from FEN');
    assert.ok(!fen.split(' ')[2].includes('Q'), 'Q right should be gone from FEN');
  });
});

describe('fromFEN', () => {
  it('parses start position', () => {
    const s = Chess.fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    assert.equal(s.turn, 'w');
    assert.equal(s.castling, 'KQkq');
    assert.equal(s.enPassant, null);
    assert.equal(s.halfmove, 0);
    assert.equal(s.fullmove, 1);
    assert.equal(s.board, Chess.START_STATE.board);
  });

  it('parses en passant square correctly', () => {
    const s = Chess.fromFEN('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    assert.equal(Chess.nameOf(s.enPassant), 'e3');
  });

  it('parses no castling rights', () => {
    const s = Chess.fromFEN('8/8/8/8/8/8/8/4K2k w - - 0 1');
    assert.equal(s.castling, '');
  });
});
