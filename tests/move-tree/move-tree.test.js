import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import MoveTree from '../../slices/move-tree/move-tree.js';

// Needed by move-tree.js which references window.Chess
import Chess from '../../slices/game-core/chess.js';
globalThis.Chess = Chess;

const { createTree, playMove, promoteToMainline, deleteSubtree, markStatus,
        walkMainline, pathToRoot, fenKey, buildFenIndex, nodeCount, mainlineDepth,
        migrateV1toV2 } = MoveTree;

describe('createTree', () => {
  it('produces a valid root node', () => {
    const tree = createTree(Chess.START_STATE);
    assert.ok(tree.rootId);
    assert.ok(tree.nodes[tree.rootId]);
    const root = tree.nodes[tree.rootId];
    assert.equal(root.ply, 0);
    assert.equal(root.parentId, null);
    assert.equal(root.san, null);
    assert.deepEqual(root.childIds, []);
    assert.equal(tree.schemaVersion, 2);
  });

  it('populates byFen with root position', () => {
    const tree = createTree(Chess.START_STATE);
    const key = fenKey(Chess.START_STATE);
    assert.ok(tree.byFen[key]);
    assert.ok(tree.byFen[key].includes(tree.rootId));
  });
});

describe('playMove', () => {
  it('appends a new child as last sibling', () => {
    let tree = createTree(Chess.START_STATE);
    const res = playMove(tree, tree.rootId, 52, 36); // e2 → e4
    assert.ok(res);
    tree = res.tree;
    assert.ok(res.nodeId);
    const child = tree.nodes[res.nodeId];
    assert.equal(child.san, 'e4');
    assert.equal(child.parentId, tree.rootId);
    assert.equal(tree.nodes[tree.rootId].childIds.length, 1);
    assert.equal(tree.nodes[tree.rootId].childIds[0], res.nodeId);
  });

  it('returns existing child when SAN matches', () => {
    let tree = createTree(Chess.START_STATE);
    const r1 = playMove(tree, tree.rootId, 52, 36); // e4
    assert.ok(r1);
    tree = r1.tree;
    // Same move again
    const r2 = playMove(tree, tree.rootId, 52, 36); // e4
    assert.ok(r2);
    assert.equal(r2.nodeId, r1.nodeId);
    assert.equal(Object.keys(r2.tree.nodes).length, Object.keys(tree.nodes).length);
  });

  it('never overwrites siblings — e4 stays at [0], d4 added at [1]', () => {
    let tree = createTree(Chess.START_STATE);
    const r1 = playMove(tree, tree.rootId, 52, 36); // e4
    assert.ok(r1);
    tree = r1.tree;
    const r2 = playMove(tree, tree.rootId, 51, 35); // d4
    assert.ok(r2);
    tree = r2.tree;
    const root = tree.nodes[tree.rootId];
    assert.equal(root.childIds.length, 2);
    assert.equal(root.childIds[0], r1.nodeId); // e4 still at [0]
    assert.equal(root.childIds[1], r2.nodeId); // d4 at [1]
  });

  it('applies promotion correctly', () => {
    // Push a pawn to the 7th rank: white pawn on d7
    const fen = 'rnbqkbnr/3P4/8/8/8/8/8/RNBQKBNR w KQkq - 0 6';
    const state = Chess.fromFEN(fen);
    // d7 = rank 1 (0-indexed), file 3 → 1*8+3 = 11
    // d8 = rank 0, file 3 → 0*8+3 = 3
    let tree = createTree(state);
    const res = playMove(tree, tree.rootId, 11, 3, { promotion: 'q' }); // d7d8=q
    assert.ok(res);
    tree = res.tree;
    const child = tree.nodes[res.nodeId];
    assert.equal(child.promotion, 'q');
  });

  it('captures set captured field', () => {
    // Position where white queen can capture black knight
    const fen = 'rnbqkbnr/ppp1pppp/8/3n4/4Q3/8/PPPP1PPP/RNB1KB1R w KQkq - 0 4';
    const state = Chess.fromFEN(fen);
    // e4 = rank 4, file 4 → 4*8+4 = 36
    // d5 = rank 3, file 3 → 3*8+3 = 27
    let tree = createTree(state);
    const res = playMove(tree, tree.rootId, 36, 27); // Qe4xd5
    assert.ok(res);
    tree = res.tree;
    const child = tree.nodes[res.nodeId];
    assert.equal(child.captured, 'n');
  });
});

describe('promoteToMainline', () => {
  it('reorders childIds so the promoted branch is first', () => {
    let tree = createTree(Chess.START_STATE);
    const d4 = playMove(tree, tree.rootId, 51, 35); // d4
    assert.ok(d4);
    tree = d4.tree;
    const e4 = playMove(tree, tree.rootId, 52, 36); // e4
    assert.ok(e4);
    tree = e4.tree;
    // Now: childIds = [d4, e4]. Promote e4.
    tree = promoteToMainline(tree, e4.nodeId);
    const root = tree.nodes[tree.rootId];
    assert.equal(root.childIds[0], e4.nodeId);
    assert.equal(root.childIds[1], d4.nodeId);
  });

  it('promotes at multiple levels', () => {
    let tree = createTree(Chess.START_STATE);
    // e4 e5, then alternative from e4 position
    const r1 = playMove(tree, tree.rootId, 52, 36); // e4
    tree = r1.tree;
    const e4Id = r1.nodeId;
    const r2 = playMove(tree, e4Id, 12, 28); // e5 (mainline)
    tree = r2.tree;
    const e5_main = r2.nodeId;
    const r3 = playMove(tree, e4Id, 11, 27); // d5 (alternative from e4)
    tree = r3.tree;
    // childIds for e4 node: [e5, d5]. Promote d5.
    tree = promoteToMainline(tree, r3.nodeId);
    const e4Node = tree.nodes[e4Id];
    assert.equal(e4Node.childIds[0], r3.nodeId); // d5 now first
    assert.equal(e4Node.childIds[1], e5_main);
  });
});

describe('deleteSubtree', () => {
  it('removes a node and all descendants from nodes and byFen', () => {
    let tree = createTree(Chess.START_STATE);
    const r1 = playMove(tree, tree.rootId, 52, 36); // e4
    tree = r1.tree;
    const r2 = playMove(tree, r1.nodeId, 12, 28); // e5
    tree = r2.tree;
    const e5Id = r2.nodeId;
    const r3 = playMove(tree, e5Id, 49, 41); // Nc3
    tree = r3.tree;

    // Delete e5 node (and Nc3 child)
    tree = deleteSubtree(tree, e5Id);

    assert.ok(!tree.nodes[e5Id]);
    assert.ok(!tree.nodes[r3.nodeId]); // descendant
    assert.ok(tree.nodes[tree.rootId]);
    assert.ok(tree.nodes[r1.nodeId]); // e4 still there
    assert.equal(tree.nodes[r1.nodeId].childIds.length, 0);

    // Check byFen cleanup
    for (const key of Object.keys(tree.byFen)) {
      for (const id of tree.byFen[key]) {
        assert.ok(tree.nodes[id], `byFen[${key}] contains deleted node ${id}`);
      }
    }
  });

  it('is a no-op on root', () => {
    const tree = createTree(Chess.START_STATE);
    const result = deleteSubtree(tree, tree.rootId);
    assert.equal(result, tree);
  });

  it('prunes childIds references in parent', () => {
    let tree = createTree(Chess.START_STATE);
    const d4 = playMove(tree, tree.rootId, 51, 35);
    tree = d4.tree;
    const e4 = playMove(tree, tree.rootId, 52, 36);
    tree = e4.tree;
    // childIds = [d4, e4]. Delete e4.
    tree = deleteSubtree(tree, e4.nodeId);
    const root = tree.nodes[tree.rootId];
    assert.equal(root.childIds.length, 1);
    assert.equal(root.childIds[0], d4.nodeId);
    assert.ok(!root.childIds.includes(e4.nodeId));
  });
});

describe('walkMainline', () => {
  it('returns root-to-leaf chain following childIds[0]', () => {
    let tree = createTree(Chess.START_STATE);
    const r1 = playMove(tree, tree.rootId, 52, 36);
    tree = r1.tree;
    const r2 = playMove(tree, r1.nodeId, 12, 28);
    tree = r2.tree;
    const r3 = playMove(tree, r2.nodeId, 57, 42); // Nc3
    tree = r3.tree;

    const mainline = walkMainline(tree);
    assert.equal(mainline.length, 4); // root + 3 moves
    assert.equal(mainline[0].id, tree.rootId);
    assert.equal(mainline[1].san, 'e4');
    assert.equal(mainline[2].san, 'e5');
    assert.equal(mainline[3].san, 'Nc3');
  });

  it('starts from given node', () => {
    let tree = createTree(Chess.START_STATE);
    const r1 = playMove(tree, tree.rootId, 52, 36);
    tree = r1.tree;
    const r2 = playMove(tree, r1.nodeId, 12, 28);
    tree = r2.tree;

    const mainline = walkMainline(tree, r1.nodeId);
    assert.equal(mainline.length, 2); // e4 + e5
    assert.equal(mainline[0].id, r1.nodeId);
  });
});

describe('pathToRoot', () => {
  it('returns root-first array from any node', () => {
    let tree = createTree(Chess.START_STATE);
    const r1 = playMove(tree, tree.rootId, 52, 36);
    tree = r1.tree;
    const r2 = playMove(tree, r1.nodeId, 12, 28);
    tree = r2.tree;

    const path = pathToRoot(tree, r2.nodeId);
    assert.equal(path.length, 3); // root, e4, e5
    assert.equal(path[0].id, tree.rootId);
    assert.equal(path[1].id, r1.nodeId);
    assert.equal(path[2].id, r2.nodeId);
  });
});

describe('fenKey', () => {
  it('strips halfmove and fullmove clocks', () => {
    const key1 = fenKey(Chess.START_STATE);
    const state2 = { ...Chess.START_STATE, halfmove: 5, fullmove: 10 };
    const key2 = fenKey(state2);
    assert.equal(key1, key2);
  });

  it('preserves castling rights and en passant', () => {
    const state = Chess.fromFEN('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    const key = fenKey(state);
    assert.ok(key.includes('KQkq'));
    assert.ok(key.includes('e3'));
  });

  it('different positions have different keys', () => {
    const key1 = fenKey(Chess.START_STATE);
    const state2 = Chess.applyMove(Chess.START_STATE, 52, 36);
    const key2 = fenKey(state2.state);
    assert.notEqual(key1, key2);
  });
});

describe('buildFenIndex', () => {
  it('produces correct byFen map', () => {
    let tree = createTree(Chess.START_STATE);
    const r1 = playMove(tree, tree.rootId, 52, 36);
    tree = r1.tree;
    const r2 = playMove(tree, r1.nodeId, 12, 28);
    tree = r2.tree;

    // Scramble byFen
    tree = { ...tree, byFen: {} };
    tree = buildFenIndex(tree);

    // Root should be in byFen
    const rootKey = fenKey(Chess.START_STATE);
    assert.ok(tree.byFen[rootKey]);
    assert.ok(tree.byFen[rootKey].includes(tree.rootId));

    // Every node should be in byFen
    for (const id of Object.keys(tree.nodes)) {
      const key = fenKey(tree.nodes[id].state);
      assert.ok(tree.byFen[key].includes(id));
    }
  });

  it('groups transpositions under same key', () => {
    // 1.e4 d5 2.d4 dxe4 and 1.d4 d5 2.e4 dxe4 reach the same position
    let tree = createTree(Chess.START_STATE);

    // Path 1: 1.e4 d5 2.d4 dxe4
    const e4_a = playMove(tree, tree.rootId, 52, 36); // e2→e4
    tree = e4_a.tree;
    const d5_a = playMove(tree, e4_a.nodeId, 11, 27); // d7→d5
    tree = d5_a.tree;
    const d4_a = playMove(tree, d5_a.nodeId, 51, 35); // d2→d4
    tree = d4_a.tree;
    const dxe4_a = playMove(tree, d4_a.nodeId, 27, 36); // d5xe4
    tree = dxe4_a.tree;

    // Path 2: 1.d4 d5 2.e4 dxe4 (different move order to same position)
    const d4_b = playMove(tree, tree.rootId, 51, 35); // d2→d4
    tree = d4_b.tree;
    const d5_b = playMove(tree, d4_b.nodeId, 11, 27); // d7→d5
    tree = d5_b.tree;
    const e4_b = playMove(tree, d5_b.nodeId, 52, 36); // e2→e4
    tree = e4_b.tree;
    const dxe4_b = playMove(tree, e4_b.nodeId, 27, 36); // d5xe4
    tree = dxe4_b.tree;

    tree = buildFenIndex(tree);

    // Both paths end with the same position (last move dxe4 in both)
    const transpoKey = fenKey(tree.nodes[dxe4_a.nodeId].state);
    const entries = tree.byFen[transpoKey];
    assert.ok(entries);
    assert.equal(entries.length, 2,
      'both transposition nodes should be in byFen');
    assert.ok(entries.includes(dxe4_b.nodeId),
      'transposition node should share byFen key with original');
  });
});

describe('migrateV1toV2', () => {
  it('losslessly converts a linear v1 history to a v2 tree', () => {
    let cur = Chess.START_STATE;
    const history = [{ state: cur, san: null, from: null, to: null, captured: null }];

    // 1. e4
    const r1 = Chess.applyMove(cur, 52, 36);
    history.push({ state: r1.state, san: 'e4', from: 52, to: 36, captured: null });
    cur = r1.state;

    // 1... e5
    const r2 = Chess.applyMove(cur, 12, 28);
    history.push({ state: r2.state, san: 'e5', from: 12, to: 28, captured: null });
    cur = r2.state;

    const oldSaves = [{ id: 'a', name: 'test', history, cursor: 2, updatedAt: 1000 }];
    const newSaves = migrateV1toV2(oldSaves);

    assert.equal(newSaves.length, 1);
    const nu = newSaves[0];
    assert.equal(nu.name, 'test');

    // mainline should match
    const mainline = walkMainline(nu.tree);
    assert.equal(mainline.length, 3); // root + 2 plies
    assert.equal(mainline[1].san, 'e4');
    assert.equal(mainline[2].san, 'e5');

    // FENs should match
    for (let i = 0; i < history.length; i++) {
      assert.equal(
        Chess.stateToFEN(mainline[i].state),
        Chess.stateToFEN(history[i].state),
      );
    }

    // byFen should contain all nodes
    for (const id of Object.keys(nu.tree.nodes)) {
      const key = fenKey(nu.tree.nodes[id].state);
      assert.ok(nu.tree.byFen[key].includes(id));
    }
  });
});

describe('markStatus', () => {
  it('updates status, lastSeenAt, and reviewCount', () => {
    let tree = createTree(Chess.START_STATE);
    tree = markStatus(tree, tree.rootId, 'reviewing');
    const node = tree.nodes[tree.rootId];
    assert.equal(node.status, 'reviewing');
    assert.ok(node.lastSeenAt > 0);
    assert.equal(node.reviewCount, 1);

    tree = markStatus(tree, tree.rootId, 'known');
    assert.equal(tree.nodes[tree.rootId].reviewCount, 2);
    assert.equal(tree.nodes[tree.rootId].status, 'known');
  });
});

describe('nodeCount and mainlineDepth', () => {
  it('returns correct counts', () => {
    let tree = createTree(Chess.START_STATE);
    assert.equal(nodeCount(tree), 1);
    assert.equal(mainlineDepth(tree), 0);

    const r1 = playMove(tree, tree.rootId, 52, 36);
    tree = r1.tree;
    assert.equal(nodeCount(tree), 2);
    assert.equal(mainlineDepth(tree), 1);

    // sibling — still 3 nodes, but depth is still 1 (mainline)
    const r2 = playMove(tree, tree.rootId, 51, 35);
    tree = r2.tree;
    assert.equal(nodeCount(tree), 3);
    assert.equal(mainlineDepth(tree), 1);
  });
});
