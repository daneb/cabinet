// Tree-formatted move list — mainline with indented variations.

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

// ---- Row builder ----

function buildRows(tree, currentNodeId, activePath) {
  const rows = []; // { depth, moveNum, isVariation, hasActivePath, cells: [{type, nodeId, san, status, isCurrent, isOnPath}] }

  function walk(nodeId, depth, moveNum) {
    const node = tree.nodes[nodeId];
    if (!node || !node.san) {
      if (node && node.childIds[0]) walk(node.childIds[0], 0, 1);
      return;
    }

    const isWhite = node.ply % 2 === 1;

    if (isWhite) {
      const row = { depth, moveNum, cells: [] };
      row.cells.push({ type: 'moveNum', value: moveNum });
      row.cells.push({ type: 'san', nodeId, san: node.san, status: node.status, isCurrent: nodeId === currentNodeId, isOnPath: activePath.has(nodeId) });
      rows.push(row);

      if (node.childIds.length > 0) walkBlack(node.childIds[0], depth, moveNum);
      // Alternative Black responses (variations off a White move)
      for (let i = 1; i < node.childIds.length; i++) {
        walkVariation(node.childIds[i], depth + 1, moveNum);
      }
    }
  }

  function walkBlack(nodeId, depth, moveNum) {
    const node = tree.nodes[nodeId];
    if (!node || !node.san) return;

    const row = rows[rows.length - 1];
    row.cells.push({ type: 'san', nodeId, san: node.san, status: node.status, isCurrent: nodeId === currentNodeId, isOnPath: activePath.has(nodeId) });

    if (node.childIds.length > 0) walk(node.childIds[0], depth, moveNum + 1);

    // Variation siblings
    for (let i = 1; i < node.childIds.length; i++) {
      walkVariation(node.childIds[i], depth + 1, moveNum);
    }
  }

  function walkVariation(nodeId, depth, moveNum) {
    const node = tree.nodes[nodeId];
    if (!node) return;

    const isWhite = node.ply % 2 === 1;
    const beforeIdx = rows.length;

    if (isWhite) {
      const row = { depth, moveNum, cells: [], isVariation: true };
      row.cells.push({ type: 'paren', value: '(' });
      row.cells.push({ type: 'moveNum', value: moveNum });
      row.cells.push({ type: 'san', nodeId, san: node.san, status: node.status, isCurrent: nodeId === currentNodeId, isOnPath: activePath.has(nodeId) });
      rows.push(row);

      if (node.childIds.length > 0) {
        walkVarBlack(node.childIds[0], depth, moveNum);
      } else {
        row.cells.push({ type: 'paren', value: ')' });
      }
    } else {
      // Black-start variation
      const row = { depth, moveNum: null, cells: [], isVariation: true };
      row.cells.push({ type: 'paren', value: '(' });
      row.cells.push({ type: 'moveNum', value: moveNum, ellipsis: true });
      row.cells.push({ type: 'san', nodeId, san: node.san, status: node.status, isCurrent: nodeId === currentNodeId, isOnPath: activePath.has(nodeId) });
      rows.push(row);

      if (node.childIds.length > 0) {
        // White's response is at moveNum+1
        walkVarBlack(node.childIds[0], depth, moveNum + 1);
      } else {
        row.cells.push({ type: 'paren', value: ')' });
      }
    }

    // After walking the variation subtree, ensure the last row has a closing paren
    const lastRow = rows[rows.length - 1];
    if (lastRow && rows.length > beforeIdx) {
      const lastCell = lastRow.cells[lastRow.cells.length - 1];
      if (!lastCell || lastCell.type !== 'paren' || lastCell.value !== ')') {
        lastRow.cells.push({ type: 'paren', value: ')' });
      }
    }
  }

  function walkVarBlack(nodeId, depth, moveNum) {
    const node = tree.nodes[nodeId];
    if (!node || !node.san) {
      const row = rows[rows.length - 1];
      if (row) row.cells.push({ type: 'paren', value: ')' });
      return;
    }

    const isWhite = node.ply % 2 === 1;

    if (isWhite) {
      // White continuation in a black-start variation — needs its own row
      const newRow = { depth, moveNum, cells: [], isVariation: true };
      newRow.cells.push({ type: 'moveNum', value: moveNum });
      newRow.cells.push({ type: 'san', nodeId, san: node.san, status: node.status, isCurrent: nodeId === currentNodeId, isOnPath: activePath.has(nodeId) });
      rows.push(newRow);
      if (node.childIds.length > 0) {
        walkVarBlack(node.childIds[0], depth, moveNum);
      }
    } else {
      // Black move — append to the current row
      const row = rows[rows.length - 1];
      row.cells.push({ type: 'san', nodeId, san: node.san, status: node.status, isCurrent: nodeId === currentNodeId, isOnPath: activePath.has(nodeId) });

      if (node.childIds.length > 0) {
        // Continue the variation (next is White)
        walk(node.childIds[0], depth, moveNum + 1);
        // Sub-variations
        for (let i = 1; i < node.childIds.length; i++) {
          walkVariation(node.childIds[i], depth + 1, moveNum);
        }
      }
    }
  }

  // Start from root
  const root = tree.nodes[tree.rootId];
  if (root && root.childIds.length > 0) {
    walk(root.childIds[0], 0, 1);
  }

  // Mark variation rows that contain the active cursor path
  for (const row of rows) {
    if (row.isVariation) {
      row.hasActivePath = row.cells.some(c => c.type === 'san' && c.isOnPath);
    }
  }

  return rows;
}

// ---- Component ----

function MoveList({ tree, currentNodeId, onSelect, onContextMenu }) {
  const scrollRef = useRef(null);

  const activePath = useMemo(() => computeActivePath(tree, currentNodeId), [tree, currentNodeId]);
  const rows = tree ? buildRows(tree, currentNodeId, activePath) : [];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const current = el.querySelector('.mv.current');
    if (current) current.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [currentNodeId]);

  if (rows.length === 0) {
    return (
      <div className="moves-empty" ref={scrollRef}>
        Awaiting the first move.
      </div>
    );
  }

  return (
    <div className="moves-tree" ref={scrollRef}>
      {rows.map((row, ri) => (
        <div
          key={ri}
          className={`move-row${row.isVariation && row.hasActivePath ? ' in-variation-path' : ''}`}
          style={{ paddingLeft: row.depth * 20, display: 'flex', alignItems: 'baseline', gap: 4, fontSize: 13, lineHeight: '1.7' }}
        >
          {row.cells.map((cell, ci) => {
            if (cell.type === 'moveNum') {
              return (
                <span key={ci} className="mv-num" style={{ color: 'var(--ink-3)', minWidth: 24, textAlign: 'right' }}>
                  {cell.value}{cell.ellipsis ? '...' : '.'}
                </span>
              );
            }
            if (cell.type === 'paren') {
              return <span key={ci} style={{ color: 'var(--ink-3)' }}>{cell.value}</span>;
            }
            if (cell.type === 'san') {
              const cls = cell.isCurrent ? 'current' : cell.isOnPath ? 'on-path' : '';
              return (
                <span
                  key={ci}
                  className={`mv${cls ? ' ' + cls : ''}`}
                  onClick={() => onSelect && onSelect(cell.nodeId)}
                  onContextMenu={(e) => {
                    if (onContextMenu) {
                      e.preventDefault();
                      onContextMenu(cell.nodeId, e.clientX, e.clientY);
                    }
                  }}
                >
                  {cell.san}
                  <StatusBadge status={cell.status} />
                </span>
              );
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status || status === 'unseen') return null;
  if (status === 'reviewing') return <span style={{ color: '#d4a017', marginLeft: 3, fontSize: 11 }}>●</span>;
  if (status === 'known') return <span style={{ color: '#3a8', marginLeft: 3, fontSize: 11 }}>✓</span>;
  return null;
}

window.MoveList = MoveList;
