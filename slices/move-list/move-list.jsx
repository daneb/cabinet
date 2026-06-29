// Move list — clean main-line table plus anchored side-line note cards.

const { useRef, useEffect, useMemo } = React;

// ---- Active path ----

function computeActivePath(tree, currentNodeId) {
  const path = new Set();
  let id = currentNodeId;
  while (id) {
    path.add(id);
    const node = tree.nodes[id];
    if (!node || !node.parentId) break;
    id = node.parentId;
  }
  return path;
}

function moveNumOf(node) {
  return Math.ceil(node.ply / 2);
}
function isWhiteMove(node) {
  return node.ply % 2 === 1;
}
function moveLabel(node) {
  return `${moveNumOf(node)}${isWhiteMove(node) ? '.' : '…'} ${node.san}`;
}

// ---- Model builder ----
//
// Produces a clean main line (the childIds[0] chain) and a flat, reading-ordered
// list of side-line cards. Every move number derives from `ply`, so it is correct
// regardless of how deeply a line is nested. Markers (a, b, … / a.1, a.2) tie an
// anchor move in one line to its alternative cards.

function buildMoveModel(tree, currentNodeId) {
  const activePath = computeActivePath(tree, currentNodeId);
  const cards = [];                 // flat, in reading order; each has a `depth`
  const labelToFirstNode = {};      // marker label -> first node id of that card
  let topCounter = 0;               // a, b, c … for side lines off the main line

  function makeCell(node) {
    return {
      nodeId: node.id,
      san: node.san,
      status: node.status,
      classification: node.reviewClass || null,
      isWhite: isWhiteMove(node),
      moveNum: moveNumOf(node),
      isCurrent: node.id === currentNodeId,
      isOnPath: activePath.has(node.id),
      markers: null,                // filled in below for anchor moves
    };
  }

  // Walk one line (a childIds[0] chain from firstNodeId), assign markers to anchor
  // moves, and recursively spawn cards for each alternative. parentLabel === null
  // means this is the main line.
  function processLine(firstNodeId, parentLabel, depth) {
    const cells = [];
    const byId = {};
    let id = firstNodeId;
    while (id) {
      const node = tree.nodes[id];
      if (!node || !node.san) break;
      const cell = makeCell(node);
      cells.push(cell);
      byId[id] = cell;
      id = node.childIds[0] || null;
    }

    // Find branch points along this line: a node whose parent has >1 children.
    let nestedCounter = 0;
    for (const cell of cells) {
      const node = tree.nodes[cell.nodeId];
      const parent = tree.nodes[node.parentId];
      if (!parent || parent.childIds.length <= 1) continue;
      if (parent.childIds[0] !== node.id) continue; // only anchor on the line's own move
      const alternatives = parent.childIds.slice(1);
      cell.markers = cell.markers || [];
      for (const altId of alternatives) {
        const label = parentLabel == null
          ? String.fromCharCode(97 + topCounter++)
          : `${parentLabel}.${++nestedCounter}`;
        cell.markers.push(label);
        labelToFirstNode[label] = altId;
        spawnCard(label, altId, node, depth);
      }
    }
    return cells;
  }

  // Create a card for one alternative, then process its continuation (which appends
  // any nested cards immediately after, preserving reading order).
  function spawnCard(label, altFirstId, anchorNode, depth) {
    const altNode = tree.nodes[altFirstId];
    const card = {
      label,
      depth,
      firstNodeId: altFirstId,
      anchorNodeId: anchorNode.id,
      insteadOf: moveLabel(anchorNode),
      firstMove: moveLabel(altNode),
      cells: null,
      hasCurrent: false,
    };
    cards.push(card);
    const cells = processLine(altFirstId, label, depth + 1);
    // Number labels for inline rendering inside the card.
    cells.forEach((c, idx) => {
      if (c.isWhite) c.numLabel = `${c.moveNum}.`;
      else if (idx === 0) c.numLabel = `${c.moveNum}…`;
      else c.numLabel = null;
    });
    card.cells = cells;
    card.hasCurrent = cells.some(c => c.isCurrent);
  }

  // Main line is the root's childIds[0] chain.
  const root = tree.nodes[tree.rootId];
  const firstMainId = root && root.childIds[0];
  const mainCells = firstMainId ? processLine(firstMainId, null, 0) : [];

  // Group main-line cells into paired rows (white | black) with a number column.
  const mainRows = [];
  for (let i = 0; i < mainCells.length;) {
    const c = mainCells[i];
    if (c.isWhite) {
      const next = mainCells[i + 1];
      if (next && !next.isWhite) {
        mainRows.push({ moveNum: c.moveNum, white: c, black: next });
        i += 2;
      } else {
        mainRows.push({ moveNum: c.moveNum, white: c, black: null });
        i += 1;
      }
    } else {
      mainRows.push({ moveNum: c.moveNum, white: null, black: c });
      i += 1;
    }
  }

  return { mainRows, cards, labelToFirstNode };
}

// ---- Shared bits ----

function StatusBadge({ status }) {
  if (!status || status === 'unseen') return null;
  if (status === 'reviewing') return <span className="mv-status reviewing">●</span>;
  if (status === 'known') return <span className="mv-status known">✓</span>;
  return null;
}

const CLASS_BADGE = {
  inaccuracy: { glyph: '?!', cls: 'inaccuracy', title: 'Inaccuracy' },
  mistake: { glyph: '?', cls: 'mistake', title: 'Mistake' },
  blunder: { glyph: '??', cls: 'blunder', title: 'Blunder' },
};

function ClassBadge({ classification }) {
  if (!classification) return null;
  const entry = CLASS_BADGE[classification];
  if (!entry) return null;
  return <span className={`mv-class ${entry.cls}`} title={entry.title}>{entry.glyph}</span>;
}

function Markers({ markers, onMarkerClick }) {
  if (!markers || markers.length === 0) return null;
  return (
    <>
      {markers.map((m) => (
        <button
          key={m}
          className="mv-marker"
          title={`Side line ${m}`}
          onClick={(e) => { e.stopPropagation(); onMarkerClick && onMarkerClick(m); }}
        >
          {m}
        </button>
      ))}
    </>
  );
}

function MoveToken({ cell, onSelect, onContextMenu, onMarkerClick }) {
  const cls = cell.isCurrent ? 'current' : cell.isOnPath ? 'on-path' : '';
  return (
    <span
      className={`mv${cls ? ' ' + cls : ''}`}
      onClick={() => onSelect && onSelect(cell.nodeId)}
      onContextMenu={(e) => {
        if (onContextMenu) { e.preventDefault(); onContextMenu(cell.nodeId, e.clientX, e.clientY); }
      }}
    >
      {cell.san}
      <ClassBadge classification={cell.classification} />
      <StatusBadge status={cell.status} />
      <Markers markers={cell.markers} onMarkerClick={onMarkerClick} />
    </span>
  );
}

// ---- Main line table ----

function MoveList({ model, currentNodeId, onSelect, onContextMenu, onMarkerClick }) {
  const scrollRef = useRef(null);
  const rows = model ? model.mainRows : [];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const current = el.querySelector('.mv.current');
    if (current) current.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [currentNodeId]);

  if (rows.length === 0) {
    return <div className="moves-empty" ref={scrollRef}>Awaiting the first move.</div>;
  }

  return (
    <div className="moves-main" ref={scrollRef}>
      {rows.map((row, ri) => (
        <div key={ri} className="main-row">
          <span className="mv-num">{row.moveNum}.</span>
          <span className="mv-slot">
            {row.white
              ? <MoveToken cell={row.white} onSelect={onSelect} onContextMenu={onContextMenu} onMarkerClick={onMarkerClick} />
              : <span className="mv-ellipsis">…</span>}
          </span>
          <span className="mv-slot">
            {row.black
              ? <MoveToken cell={row.black} onSelect={onSelect} onContextMenu={onContextMenu} onMarkerClick={onMarkerClick} />
              : null}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---- Side-line note cards ----

function SideLines({ model, currentNodeId, onSelect, onContextMenu, onMarkerClick }) {
  const cards = model ? model.cards : [];
  const activeRef = useRef(null);

  useEffect(() => {
    if (activeRef.current) activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [currentNodeId]);

  if (cards.length === 0) return null;

  return (
    <div className="side-lines">
      <div className="section-label">
        <span>Side Lines</span>
        <span className="count">{cards.length}</span>
      </div>
      <div className="side-lines-list">
        {cards.map((card) => (
          <div
            key={card.label}
            id={`sl-${card.label}`}
            ref={card.hasCurrent ? activeRef : null}
            className={`side-card${card.hasCurrent ? ' active' : ''}`}
            style={{ marginLeft: card.depth ? (card.depth - 1) * 16 : 0 }}
          >
            <div className="side-card-head">
              <span className="side-card-label">{card.label}</span>
              <button
                className="side-card-anchor"
                title="Jump to the move this branches from"
                onClick={() => onSelect && onSelect(card.anchorNodeId)}
              >
                ↑ instead of {card.insteadOf}
              </button>
            </div>
            <div className="side-card-moves">
              {card.cells.map((cell, ci) => (
                <span key={ci} className="side-move">
                  {cell.numLabel ? <span className="mv-num inline">{cell.numLabel}</span> : null}
                  <MoveToken cell={cell} onSelect={onSelect} onContextMenu={onContextMenu} onMarkerClick={onMarkerClick} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.buildMoveModel = buildMoveModel;
window.MoveList = MoveList;
window.SideLines = SideLines;
