import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import PGN from '../../slices/pgn/pgn.js';

// Dependencies
import Chess from '../../slices/game-core/chess.js';
import MoveTree from '../../slices/move-tree/move-tree.js';
globalThis.Chess = Chess;
globalThis.MoveTree = MoveTree;

const { parseAll, splitGames } = PGN;

const TWO_GAMES = `[Event "Round 1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0

[Event "Round 2"]
[White "Bob"]
[Black "Alice"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1`;

describe('PGN splitGames', () => {
  it('splits a two-game file into two chunks', () => {
    const chunks = splitGames(TWO_GAMES);
    assert.equal(chunks.length, 2);
    assert.ok(chunks[0].includes('Round 1'));
    assert.ok(chunks[1].includes('Round 2'));
  });

  it('returns a single chunk for a single game', () => {
    const chunks = splitGames('[Event "Solo"]\n\n1. e4 e5 *');
    assert.equal(chunks.length, 1);
  });

  it('handles empty input', () => {
    assert.deepEqual(splitGames(''), []);
    assert.deepEqual(splitGames('   \n\n  '), []);
  });

  it('handles a game with no headers at all', () => {
    const chunks = splitGames('1. e4 e5 2. Nf3 *');
    assert.equal(chunks.length, 1);
  });
});

describe('PGN parseAll', () => {
  it('parses each game with its own headers (no header merge)', () => {
    const games = parseAll(TWO_GAMES);
    assert.equal(games.length, 2);
    assert.equal(games[0].headers.White, 'Alice');
    assert.equal(games[0].headers.Result, '1-0');
    assert.equal(games[1].headers.White, 'Bob');
    assert.equal(games[1].headers.Result, '0-1');
  });

  it('parses each game to its own tree', () => {
    const games = parseAll(TWO_GAMES);
    const line0 = MoveTree.walkMainline(games[0].tree);
    const line1 = MoveTree.walkMainline(games[1].tree);
    assert.equal(line0[1].san, 'e4');
    assert.equal(line1[1].san, 'd4');
    assert.equal(line0.length, 5); // root + 4 plies
    assert.equal(line1.length, 5);
  });

  it('preserves variations and comments within each game', () => {
    const text = `[Event "A"]

1. e4 e5 (1... c5 {Sicilian}) 2. Nf3 1-0

[Event "B"]

1. c4 *`;
    const games = parseAll(text);
    assert.equal(games.length, 2);
    const root = games[0].tree.nodes[games[0].tree.rootId];
    const e4 = games[0].tree.nodes[root.childIds[0]];
    assert.equal(e4.childIds.length, 2); // e5 mainline + c5 variation
  });

  it('carries per-game warnings independently', () => {
    const text = `[Event "Good"]

1. e4 e5 1-0

[Event "Bad"]

1. e4 e9 *`;
    const games = parseAll(text, { allowIllegal: true });
    assert.equal(games.length, 2);
    assert.equal(games[0].warnings.length, 0);
    assert.ok(games[1].warnings.length > 0);
  });
});
