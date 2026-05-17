// Side panel: move list, navigation, named saves.

function MoveList({ history, currentIndex, onSelect }) {
  if (history.length === 0) {
    return (
      <div className="moves-empty">
        Awaiting the first move.
      </div>
    );
  }
  // Group into pairs: [white, black]
  const rows = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      num: Math.floor(i / 2) + 1,
      white: history[i],
      whiteIdx: i,
      black: history[i + 1] || null,
      blackIdx: i + 1,
    });
  }
  return (
    <div className="moves-grid">
      {rows.map(row => (
        <React.Fragment key={row.num}>
          <div className="mv-num">{row.num}.</div>
          <div
            className={`mv ${currentIndex === row.whiteIdx ? 'current' : ''}`}
            onClick={() => onSelect(row.whiteIdx)}
          >
            {row.white.san}
          </div>
          {row.black ? (
            <div
              className={`mv ${currentIndex === row.blackIdx ? 'current' : ''}`}
              onClick={() => onSelect(row.blackIdx)}
            >
              {row.black.san}
            </div>
          ) : (
            <div className="mv empty">·</div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function NavControls({ atStart, atEnd, onStart, onBack, onForward, onEnd, onFlip }) {
  return (
    <div className="nav-controls">
      <button className="nav-btn" onClick={onStart} disabled={atStart} title="Go to start">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 3v10h1.5V3H3zm10.5 0L6 8l7.5 5V3z"/></svg>
      </button>
      <button className="nav-btn" onClick={onBack} disabled={atStart} title="Previous move (←)">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M11 3L5 8l6 5V3z"/></svg>
      </button>
      <button className="nav-btn" onClick={onForward} disabled={atEnd} title="Next move (→)">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3l6 5-6 5V3z"/></svg>
      </button>
      <button className="nav-btn" onClick={onEnd} disabled={atEnd} title="Go to end">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13 3v10h-1.5V3H13zM2.5 3L10 8l-7.5 5V3z"/></svg>
      </button>
      <button className="nav-btn" onClick={onFlip} title="Flip board (F)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h10M3 6l3-3M3 6l3 3M13 10H3M13 10l-3-3M13 10l-3 3"/></svg>
      </button>
    </div>
  );
}

function SavePanel({ saves, activeId, onSave, onLoad, onDelete, onNew, currentName }) {
  const [name, setName] = React.useState('');
  React.useEffect(() => {
    if (currentName) setName(currentName);
  }, [currentName]);

  const submit = (e) => {
    e?.preventDefault?.();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <>
      <form className="save-form" onSubmit={submit}>
        <input
          type="text"
          placeholder="Name this line…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={48}
        />
        <button type="submit" className="btn btn-primary">Save</button>
      </form>
      {saves.length === 0 ? (
        <div className="saves-empty">No saved lines yet.</div>
      ) : (
        <div className="saves-list">
          {saves.map(s => (
            <div
              key={s.id}
              className={`save-item ${activeId === s.id ? 'active' : ''}`}
              onClick={() => onLoad(s.id)}
            >
              <div>
                <div className="save-name">{s.name}</div>
                <div className="save-meta">
                  <span>{s.history.length} {s.history.length === 1 ? 'ply' : 'plies'}</span>
                  <span>·</span>
                  <span>{formatDate(s.updatedAt)}</span>
                </div>
              </div>
              <div className="save-actions">
                <button
                  className="btn-danger-ghost"
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  title="Delete"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

window.MoveList = MoveList;
window.NavControls = NavControls;
window.SavePanel = SavePanel;
