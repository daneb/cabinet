// Tree-formatted move list — mainline with indented variations.

const { useRef, useEffect } = React;

// ---- Row builder ----

function buildRows(tree, currentNodeId) {
  const rows = []; // { depth, moveNum, cells: [{type, nodeId, san, status, isCurrent}] }

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
      row.cells.push({ type: 'san', nodeId, san: node.san, status: node.status, isCurrent: nodeId === currentNodeId });
      rows.push(row);

      if (node.childIds.length > 0) walkBlack(node.childIds[0], depth, moveNum);
    }
  }

  function walkBlack(nodeId, depth, moveNum) {
    const node = tree.nodes[nodeId];
    if (!node || !node.san) return;

    const row = rows[rows.length - 1];
    row.cells.push({ type: 'san', nodeId, san: node.san, status: node.status, isCurrent: nodeId === currentNodeId });

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
      row.cells.push({ type: 'san', nodeId, san: node.san, status: node.status, isCurrent: nodeId === currentNodeId });
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
      row.cells.push({ type: 'san', nodeId, san: node.san, status: node.status, isCurrent: nodeId === currentNodeId });
      rows.push(row);

      if (node.childIds.length > 0) {
        walkVarBlack(node.childIds[0], depth, moveNum);
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

    const row = rows[rows.length - 1];
    row.cells.push({ type: 'san', nodeId, san: node.san, status: node.status, isCurrent: nodeId === currentNodeId });

    if (node.childIds.length > 0) {
      // Continue the variation
      walk(node.childIds[0], depth, moveNum + 1);

      // Sub-variations
      for (let i = 1; i < node.childIds.length; i++) {
        walkVariation(node.childIds[i], depth + 1, moveNum);
      }
    }
  }

  // Start from root
  const root = tree.nodes[tree.rootId];
  if (root && root.childIds.length > 0) {
    walk(root.childIds[0], 0, 1);
  }

  return rows;
}

// ---- Component ----

function MoveList({ tree, currentNodeId, onSelect, onContextMenu }) {
  const scrollRef = useRef(null);

  const rows = tree ? buildRows(tree, currentNodeId) : [];

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
          className="move-row"
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
              return (
                <span
                  key={ci}
                  className={`mv ${cell.isCurrent ? 'current' : ''}`}
                  onClick={() => onSelect && onSelect(cell.nodeId)}
                  onContextMenu={(e) => {
                    if (onContextMenu) {
                      e.preventDefault();
                      onContextMenu(cell.nodeId, e.clientX, e.clientY);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
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
