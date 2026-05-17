// Move tree data model — replaces the linear history array with a node-keyed tree.
// Pure functions operating on immutable tree objects. No React dependency.

function uuid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---- Fen key for transposition index ----

function fenKey(state) {
  const full = globalThis.Chess.stateToFEN(state);
  const parts = full.split(' ');
  return parts.slice(0, 4).join(' ');
}

// ---- Tree creation ----

function createTree(startState) {
  const rootId = uuid();
  const root = {
    id: rootId,
    parentId: null,
    ply: 0,
    state: startState,
    san: null,
    from: null,
    to: null,
    captured: null,
    promotion: null,
    childIds: [],
    comment: null,
    nag: null,
    status: null,
    lastSeenAt: null,
    lastDrilledAt: null,
    reviewCount: 0,
    tags: null,
  };
  return {
    schemaVersion: 2,
    rootId,
    nodes: { [rootId]: root },
    byFen: { [fenKey(startState)]: [rootId] },
  };
}

// ---- Core mutation: play a move ----

function playMove(tree, fromNodeId, from, to, opts) {
  const fromNode = tree.nodes[fromNodeId];
  if (!fromNode) return null;
  const state = fromNode.state;
  const san = globalThis.Chess.toSAN(state, from, to, opts);
  if (!san) return null;

  // Check for existing child with same SAN (no duplicate nodes)
  for (const cid of fromNode.childIds) {
    if (tree.nodes[cid].san === san) {
      return { tree, nodeId: cid };
    }
  }

  const result = globalThis.Chess.applyMove(state, from, to, opts);
  if (!result) return null;

  const nodeId = uuid();
  const newNode = {
    id: nodeId,
    parentId: fromNodeId,
    ply: fromNode.ply + 1,
    state: result.state,
    san,
    from,
    to,
    captured: result.meta.captured,
    promotion: result.meta.promotion || null,
    childIds: [],
    comment: null,
    nag: null,
    status: null,
    lastSeenAt: null,
    lastDrilledAt: null,
    reviewCount: 0,
    tags: null,
  };

  const key = fenKey(result.state);
  const nextTree = {
    ...tree,
    nodes: { ...tree.nodes, [nodeId]: newNode },
    byFen: { ...tree.byFen, [key]: [...(tree.byFen[key] || []), nodeId] },
  };
  nextTree.nodes[fromNodeId] = {
    ...fromNode,
    childIds: [...fromNode.childIds, nodeId],
  };

  return { tree: nextTree, nodeId };
}

// ---- promoteToMainline ----

function promoteToMainline(tree, nodeId) {
  const nextTree = { ...tree, nodes: { ...tree.nodes } };
  let current = nodeId;
  while (current) {
    const node = nextTree.nodes[current];
    if (!node || !node.parentId) break;
    const parent = nextTree.nodes[node.parentId];
    const idx = parent.childIds.indexOf(current);
    if (idx > 0) {
      const newChildIds = [...parent.childIds];
      newChildIds.splice(idx, 1);
      newChildIds.unshift(current);
      nextTree.nodes[node.parentId] = { ...parent, childIds: newChildIds };
    }
    current = node.parentId;
  }
  return nextTree;
}

// ---- deleteSubtree ----

function deleteSubtree(tree, nodeId) {
  if (nodeId === tree.rootId) return tree;

  const toRemove = new Set();
  function collect(id) {
    toRemove.add(id);
    for (const cid of tree.nodes[id].childIds) {
      collect(cid);
    }
  }
  collect(nodeId);

  const newNodes = {};
  const newByFen = { ...tree.byFen };

  for (const id of Object.keys(tree.nodes)) {
    if (toRemove.has(id)) {
      const key = fenKey(tree.nodes[id].state);
      if (newByFen[key]) {
        newByFen[key] = newByFen[key].filter(x => x !== id);
        if (newByFen[key].length === 0) delete newByFen[key];
      }
      continue;
    }
    newNodes[id] = tree.nodes[id];
  }

  // Prune childIds references to removed nodes
  for (const id of Object.keys(newNodes)) {
    const node = newNodes[id];
    if (node.childIds.some(cid => toRemove.has(cid))) {
      newNodes[id] = { ...node, childIds: node.childIds.filter(cid => !toRemove.has(cid)) };
    }
  }

  return { ...tree, nodes: newNodes, byFen: newByFen };
}

// ---- Metadata setters ----

function setComment(tree, nodeId, comment) {
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  return { ...tree, nodes: { ...tree.nodes, [nodeId]: { ...node, comment } } };
}

function setNag(tree, nodeId, nag) {
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  return { ...tree, nodes: { ...tree.nodes, [nodeId]: { ...node, nag } } };
}

function markStatus(tree, nodeId, status) {
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [nodeId]: { ...node, status },
    },
  };
}

// Mark a node as visited (passive navigation). Unseen → reviewing.
function visitNode(tree, nodeId) {
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  if (node.status && node.status !== 'unseen') {
    // Already reviewing or known — just bump lastSeenAt
    return { ...tree, nodes: { ...tree.nodes, [nodeId]: { ...node, lastSeenAt: Date.now() } } };
  }
  return {
    ...tree,
    nodes: { ...tree.nodes, [nodeId]: { ...node, status: 'reviewing', lastSeenAt: Date.now() } },
  };
}

// Record a drill result. Handles status transitions per ADR-0004.
function recordDrillResult(tree, nodeId, success) {
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  const now = Date.now();
  if (success) {
    const count = (node.reviewCount || 0) + 1;
    let status = 'reviewing';
    if (count >= 3) status = 'known';
    else if (count >= 2 && node.status === 'reviewing') status = 'known';
    return {
      ...tree,
      nodes: {
        ...tree.nodes,
        [nodeId]: { ...node, status, reviewCount: count, lastDrilledAt: now },
      },
    };
  } else {
    // Failure: drops to reviewing
    return {
      ...tree,
      nodes: {
        ...tree.nodes,
        [nodeId]: { ...node, status: 'reviewing', lastDrilledAt: now },
      },
    };
  }
}

// Decay: known nodes not drilled in >30 days drop to reviewing.
function applyDecay(tree) {
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  let changed = false;
  const newNodes = { ...tree.nodes };
  for (const id of Object.keys(newNodes)) {
    const node = newNodes[id];
    if (node.status === 'known' && node.lastDrilledAt && (now - node.lastDrilledAt) > THIRTY_DAYS) {
      newNodes[id] = { ...node, status: 'reviewing' };
      changed = true;
    }
  }
  return changed ? { ...tree, nodes: newNodes } : tree;
}

// Chapter / section stats for tagged nodes.
function chapterStats(tree) {
  const chapters = {};
  for (const id of Object.keys(tree.nodes)) {
    const node = tree.nodes[id];
    if (!node.tags || !node.tags.chapter) continue;
    const name = node.tags.chapter;
    if (!chapters[name]) chapters[name] = { nodeId: id, name, total: 0, known: 0, reviewing: 0, unseen: 0 };
    const ch = chapters[name];
    // Count this node + descendants that belong to this chapter
    function count(nid) {
      const n = tree.nodes[nid];
      if (!n) return;
      // If node has a different chapter tag, stop (sub-chapter boundary)
      if (n.tags && n.tags.chapter && n.tags.chapter !== name) return;
      ch.total++;
      if (n.status === 'known') ch.known++;
      else if (n.status === 'reviewing') ch.reviewing++;
      else ch.unseen++;
      for (const cid of n.childIds) count(cid);
    }
    count(id);
  }
  return Object.values(chapters);
}

// ---- Traversal helpers ----

function walkMainline(tree, fromNodeId) {
  const nodes = [];
  let id = fromNodeId || tree.rootId;
  while (id) {
    const node = tree.nodes[id];
    if (!node) break;
    nodes.push(node);
    id = node.childIds[0] || null;
  }
  return nodes;
}

function pathToRoot(tree, nodeId) {
  const nodes = [];
  let id = nodeId;
  while (id) {
    const node = tree.nodes[id];
    if (!node) break;
    nodes.unshift(node);
    id = node.parentId;
  }
  return nodes;
}

// ---- Index / stats ----

function buildFenIndex(tree) {
  const byFen = {};
  for (const id of Object.keys(tree.nodes)) {
    const node = tree.nodes[id];
    const key = fenKey(node.state);
    if (!byFen[key]) byFen[key] = [];
    byFen[key].push(id);
  }
  return { ...tree, byFen };
}

function nodeCount(tree) {
  return Object.keys(tree.nodes).length;
}

function mainlineDepth(tree) {
  return walkMainline(tree).length - 1;
}

// ---- v1 → v2 migration ----

function migrateV1toV2(oldSaves) {
  return oldSaves.map(save => {
    const history = save.history || [];
    if (history.length === 0) return null;

    let tree = createTree(history[0].state);
    let parentId = tree.rootId;

    for (let i = 1; i < history.length; i++) {
      const move = history[i];
      if (move.from == null || move.to == null) continue;
      const opts = move.promotion ? { promotion: move.promotion } : {};
      const res = playMove(tree, parentId, move.from, move.to, opts);
      if (!res) break;
      tree = res.tree;
      parentId = res.nodeId;
    }

    return {
      id: save.id || uuid(),
      name: save.name || 'Migrated line',
      tree,
      cursorOn: parentId,
      updatedAt: save.updatedAt || Date.now(),
    };
  }).filter(Boolean);
}

// ---- Validation (gated behind ?validate=1) ----

function validateMigration(oldSaves, newSaves) {
  const results = [];
  for (let i = 0; i < oldSaves.length; i++) {
    const old = oldSaves[i];
    const nu = newSaves[i];
    if (!nu) { results.push({ name: old.name, ok: false, errors: ['no corresponding v2 save'] }); continue; }

    const mainline = walkMainline(nu.tree);
    const oldHistory = old.history || [];
    const errors = [];

    if (mainline.length !== oldHistory.length) {
      errors.push(`mainline length ${mainline.length} !== old history ${oldHistory.length}`);
    }

    for (let j = 0; j < Math.min(mainline.length, oldHistory.length); j++) {
      if (j > 0 && mainline[j].san !== oldHistory[j].san) {
        errors.push(`ply ${j}: san "${mainline[j].san}" !== "${oldHistory[j].san}"`);
      }
      const fenA = globalThis.Chess.stateToFEN(mainline[j].state);
      const fenB = globalThis.Chess.stateToFEN(oldHistory[j].state);
      if (fenA !== fenB) {
        errors.push(`ply ${j}: fen mismatch "${fenA}" !== "${fenB}"`);
      }
    }

    for (const id of Object.keys(nu.tree.nodes)) {
      const node = nu.tree.nodes[id];
      const key = fenKey(node.state);
      const entries = nu.tree.byFen[key];
      if (!entries || !entries.includes(id)) {
        errors.push(`node ${id} missing from byFen[${key}]`);
      }
    }

    results.push({ name: nu.name, ok: errors.length === 0, errors });
  }
  return results;
}

// ---- Export ----

const MoveTree = {
  createTree, playMove, promoteToMainline, deleteSubtree,
  setComment, setNag, markStatus,
  visitNode, recordDrillResult, applyDecay, chapterStats,
  walkMainline, pathToRoot,
  fenKey, buildFenIndex, nodeCount, mainlineDepth,
  migrateV1toV2, validateMigration, uuid,
};

if (typeof window !== 'undefined') window.MoveTree = MoveTree;
export default MoveTree;
