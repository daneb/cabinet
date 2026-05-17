import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import PGN from '../../slices/pgn/pgn.js';

// Dependencies
import Chess from '../../slices/game-core/chess.js';
import MoveTree from '../../slices/move-tree/move-tree.js';
globalThis.Chess = Chess;
globalThis.MoveTree = MoveTree;

const { parse, serialize } = PGN;

describe('PGN parse — bare game', () => {
  it('parses a simple game into a tree', () => {
    const pgn = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 *`;

    const { tree, headers, warnings } = parse(pgn);
    assert.equal(warnings.length, 0);
    assert.equal(headers.Event, 'Test');
    assert.equal(headers.White, 'Alice');
    assert.equal(headers.Black, 'Bob');

    const mainline = MoveTree.walkMainline(tree);
    assert.equal(mainline.length, 4); // root + e4 + e5 + Nf3
    assert.equal(mainline[1].san, 'e4');
    assert.equal(mainline[2].san, 'e5');
    assert.equal(mainline[3].san, 'Nf3');
  });

  it('parses without headers', () => {
    const { tree, warnings } = parse('1. e4 e5 2. Nf3 *');
    assert.equal(warnings.length, 0);
    const mainline = MoveTree.walkMainline(tree);
    assert.equal(mainline.length, 4);
    assert.equal(mainline[1].san, 'e4');
  });
});

describe('PGN parse — variations', () => {
  it('parses a single variation', () => {
    const pgn = `[Result "*"]
1. c4 e5 (1... c5) 2. Nc3 *`;

    const { tree, warnings } = parse(pgn);
    assert.equal(warnings.length, 0);
    const root = tree.nodes[tree.rootId];

    // Mainline first child: c4
    const c4 = tree.nodes[root.childIds[0]];
    assert.equal(c4.san, 'c4');
    assert.equal(c4.childIds.length, 2); // e5 (main) + c5 (variation)

    // e5 is mainline after c4
    const e5_main = tree.nodes[c4.childIds[0]];
    assert.equal(e5_main.san, 'e5');

    // c5 is variation sibling of e5
    const c5_var = tree.nodes[c4.childIds[1]];
    assert.equal(c5_var.san, 'c5');
  });

  it('parses nested variations', () => {
    // Properly formed RAV: each RAV replaces the preceding move (same color).
    // 1...d5 replaces 1...e5. 2. Nc3 replaces 2. Nf3 inside the RAV.
    const pgn = `[Result "*"]
1. e4 e5 (1... d5 2. Nf3 (2. Nc3 Nf6) Nc6) 2. Nf3 *`;

    const { tree, warnings } = parse(pgn);
    assert.equal(warnings.length, 0);
    const root = tree.nodes[tree.rootId];

    // e4 should have children (e5 mainline, d5 variation)
    const e4 = tree.nodes[root.childIds[0]];
    assert.equal(e4.san, 'e4');
    assert.equal(e4.childIds.length >= 2, true);
  });

  it('handles deeply nested variations 3 deep', () => {
    const pgn = `[Result "*"]
1. d4 d5 (1... Nf6 2. c4 e6 (2... g6 3. Nc3 Bg7 (3... d5)) 3. Nc3) 2. c4 *`;

    const { tree, warnings } = parse(pgn);
    assert.equal(warnings.length, 0);
    // Shouldn't crash, tree should have nodes
    assert.ok(MoveTree.nodeCount(tree) > 5);
  });
});

describe('PGN parse — NAGs', () => {
  it('parses numeric NAGs', () => {
    const pgn = `[Result "*"]
1. e4 $1 e5 $2 2. Nf3 $14 *`;

    const { tree, warnings } = parse(pgn);
    assert.equal(warnings.length, 0);
    const mainline = MoveTree.walkMainline(tree);
    assert.equal(mainline[1].nag, 1);
    assert.equal(mainline[2].nag, 2);
    assert.equal(mainline[3].nag, 14);
  });

  it('parses shorthand NAGs inline', () => {
    const pgn = `[Result "*"]
1. e4! e5? 2. Nf3!! 2... Nc6?? 3. Bb5!? 3... a6?! *`;

    const { tree, warnings } = parse(pgn);
    assert.equal(warnings.length, 0);
    const mainline = MoveTree.walkMainline(tree);
    assert.equal(mainline[1].nag, 1);  // !
    assert.equal(mainline[2].nag, 2);  // ?
    assert.equal(mainline[3].nag, 3);  // !!
    assert.equal(mainline[4].nag, 4);  // ??
    assert.equal(mainline[5].nag, 5);  // !?
    assert.equal(mainline[6].nag, 6);  // ?!
  });
});

describe('PGN parse — comments', () => {
  it('attaches comments to the correct node', () => {
    const pgn = `[Result "*"]
1. e4 {A good move} e5 {The standard reply} 2. Nf3 *`;

    const { tree, warnings } = parse(pgn);
    assert.equal(warnings.length, 0);
    const mainline = MoveTree.walkMainline(tree);
    assert.equal(mainline[1].comment, 'A good move');
    assert.equal(mainline[2].comment, 'The standard reply');
    assert.equal(mainline[3].comment, null);
  });

  it('handles comment before first move (game comment on root)', () => {
    const pgn = `[Result "*"]
{This is a test game} 1. e4 e5 *`;

    const { tree, warnings } = parse(pgn);
    assert.equal(warnings.length, 0);
    const root = tree.nodes[tree.rootId];
    assert.equal(root.comment, 'This is a test game');
  });

  it('handles comment after NAG', () => {
    const pgn = `[Result "*"]
1. e4! {best by test} e5 *`;

    const { tree, warnings } = parse(pgn);
    assert.equal(warnings.length, 0);
    const mainline = MoveTree.walkMainline(tree);
    assert.equal(mainline[1].nag, 1);
    assert.equal(mainline[1].comment, 'best by test');
  });
});

describe('PGN parse — promotions', () => {
  it('parses pawn promotion', () => {
    // White pawn on a7, empty a8, king moved aside
    const fen = '1nbqkbnr/Pppppppp/8/8/8/8/1PPP1PPP/RNBQKBNR w KQkq - 0 4';
    const pgn = `[FEN "${fen}"]
[Result "*"]

1. axb8=Q+ *`;

    const { tree, warnings } = parse(pgn);
    assert.equal(warnings.length, 0);
    const mainline = MoveTree.walkMainline(tree);
    assert.equal(mainline[1].promotion, 'q');
    // SAN should contain promotion
    assert.ok(mainline[1].san.includes('=Q'));
  });
});

describe('PGN parse — FEN header', () => {
  it('starts from the position specified in FEN header', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const pgn = `[FEN "${fen}"]
[Result "*"]

1... e5 2. Nf3 *`;

    const { tree, warnings } = parse(pgn);
    assert.equal(warnings.length, 0);
    const root = tree.nodes[tree.rootId];
    // Root state should match the FEN
    assert.equal(Chess.stateToFEN(root.state), fen);

    const mainline = MoveTree.walkMainline(tree);
    assert.equal(mainline.length, 3); // root + e5 + Nf3
    assert.equal(mainline[1].san, 'e5');
  });
});

describe('PGN parse — error handling', () => {
  it('warns on illegal move when allowIllegal is true', () => {
    const { tree, warnings, error } = parse('1. e4 e5 2. Ke2?? *', { allowIllegal: true });
    // Ke2 might or might not be legal depending on position state
    // Actually Ke2 is a legal move from start after e4 e5 (king is not in check)
    // Let me use a genuinely illegal move
    const res = parse('1. e4 e5 2. Qe9 *', { allowIllegal: true });
    assert.ok(res.warnings.length >= 1);
    assert.ok(!res.error); // no hard error
  });

  it('returns error on illegal move by default', () => {
    const { error } = parse('1. e4 e5 2. Qe9 *');
    assert.ok(error);
  });
});

describe('PGN round-trip', () => {
  it('serializes and re-parses to an equivalent tree', () => {
    const pgn = `[Event "Round-trip test"]
[Site "Cabinet"]
[Date "2026.05.17"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 (1... c5 2. Nf3 d6 {Sicilian}) 2. Nf3 Nc6 3. Bb5 $14 *`;

    const { tree: t1, warnings: w1 } = parse(pgn);
    assert.equal(w1.length, 0);

    const serialized = serialize(t1, { headers: t1.headers });
    const { tree: t2, warnings: w2 } = parse(serialized);
    assert.equal(w2.length, 0);

    // Both trees should have the same structure
    const ml1 = MoveTree.walkMainline(t1);
    const ml2 = MoveTree.walkMainline(t2);
    assert.equal(ml1.length, ml2.length);

    for (let i = 0; i < ml1.length; i++) {
      assert.equal(ml1[i].san, ml2[i].san);
      assert.equal(Chess.stateToFEN(ml1[i].state), Chess.stateToFEN(ml2[i].state));
      assert.equal(ml1[i].nag, ml2[i].nag);
      assert.equal(ml1[i].comment, ml2[i].comment);
      assert.equal(ml1[i].childIds.length, ml2[i].childIds.length);
    }
  });

  it('bare game round-trips', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O *';
    const { tree: t1 } = parse(pgn);
    const serialized = serialize(t1);
    const { tree: t2 } = parse(serialized);

    const ml1 = MoveTree.walkMainline(t1);
    const ml2 = MoveTree.walkMainline(t2);
    assert.equal(ml1.length, ml2.length);
    for (let i = 0; i < ml1.length; i++) {
      assert.equal(ml1[i].san, ml2[i].san);
      assert.equal(Chess.stateToFEN(ml1[i].state), Chess.stateToFEN(ml2[i].state));
    }
  });

  it('preserves headers on round-trip', () => {
    const pgn = `[Event "Test Event"]
[White "Player One"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

    const { tree, headers } = parse(pgn);
    assert.equal(headers.Event, 'Test Event');
    assert.equal(headers.White, 'Player One');
    assert.equal(headers.Result, '1-0');

    const serialized = serialize(tree, { headers: tree.headers });
    assert.ok(serialized.includes('[Event "Test Event"]'));
    assert.ok(serialized.includes('[White "Player One"]'));
    assert.ok(serialized.includes('[Result "1-0"]'));
  });
});

describe('PGN serialize', () => {
  it('emits bare game correctly', () => {
    const { tree } = parse('1. e4 e5 2. Nf3 *');
    const out = serialize(tree);
    assert.ok(out.includes('1. e4 e5'));
    assert.ok(out.includes('2. Nf3'));
    assert.ok(out.endsWith('*'));
  });

  it('emits variations in parentheses', () => {
    const { tree } = parse('[Result "*"]\n1. e4 e5 (1... c5) 2. Nf3 *');
    const out = serialize(tree, { headers: tree.headers });
    assert.ok(out.includes('('));
    assert.ok(out.includes('c5'));
    assert.ok(out.includes(')'));
  });

  it('emits NAGs as $NNN', () => {
    const { tree } = parse('[Result "*"]\n1. e4! e5? 2. Nf3 $14 *');
    const out = serialize(tree, { headers: tree.headers });
    assert.ok(out.includes('$1'));
    assert.ok(out.includes('$2'));
    assert.ok(out.includes('$14'));
  });

  it('emits comments in braces', () => {
    const { tree } = parse('[Result "*"]\n1. e4 {best} e5 *');
    const out = serialize(tree, { headers: tree.headers });
    assert.ok(out.includes('{best}'));
  });
});
