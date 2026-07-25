// Patterns panel — browse curated patterns, load one onto the board, or drill it.

const { useState, useCallback } = React;

function PatternsPanel({ onOpenPattern, onDrillPattern, showToast }) {
  const [openCategories, setOpenCategories] = useState(() => ({ mate: true }));
  const [expandedId, setExpandedId] = useState(null);

  const toggleCategory = useCallback((id) => {
    setOpenCategories(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const build = useCallback((pattern) => {
    const { tree, error } = window.Patterns.buildTree(pattern);
    if (error) {
      showToast(`Pattern failed to load: ${error}`);
      return null;
    }
    return tree;
  }, [showToast]);

  const handleView = useCallback((pattern) => {
    const tree = build(pattern);
    if (tree) onOpenPattern(tree, pattern);
  }, [build, onOpenPattern]);

  const handleDrill = useCallback((pattern) => {
    const tree = build(pattern);
    if (tree) onDrillPattern(tree, pattern);
  }, [build, onDrillPattern]);

  return (
    <div className="patterns">
      <div className="rail-label">
        <span>Patterns</span>
        <span className="count">{window.Patterns.PATTERNS.length}</span>
      </div>

      {window.Patterns.CATEGORIES.map(cat => {
        const items = window.Patterns.PATTERNS.filter(p => p.category === cat.id);
        if (items.length === 0) return null;
        const open = !!openCategories[cat.id];
        return (
          <div key={cat.id}>
            <button
              className="btn btn-ghost"
              style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', padding: '4px 2px', fontSize: 13, color: 'var(--ink-2)' }}
              onClick={() => toggleCategory(cat.id)}
            >
              <span>{cat.label}</span>
              <span style={{ color: 'var(--ink-3)' }}>{open ? '▾' : '▸'} {items.length}</span>
            </button>

            {open ? (
              <div className="saves-list">
                {items.map(p => (
                  <div
                    key={p.id}
                    className="save-item"
                    onClick={() => setExpandedId(id => id === p.id ? null : p.id)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="save-name">{p.name}</div>
                      <div
                        className="save-meta"
                        style={expandedId === p.id ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {p.description}
                      </div>
                      {expandedId === p.id && p.source ? (
                        <div className="save-meta" style={{ marginTop: 2, fontStyle: 'italic' }}>
                          {p.source.players}{p.source.year ? `, ${p.source.year}` : ''}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={(e) => { e.stopPropagation(); handleView(p); }}
                      >
                        View
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={(e) => { e.stopPropagation(); handleDrill(p); }}
                      >
                        Drill
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

window.PatternsPanel = PatternsPanel;
