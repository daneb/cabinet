// Move list: renders a path through the tree as a paired move table.

const { useRef, useEffect } = React;

function MoveList({ path, currentIndex, onSelect }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const current = el.querySelector('.mv.current');
    if (current) current.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [currentIndex]);

  // path includes root (index 0, no SAN). Moves start at index 1.
  const moves = path.slice(1);
  if (moves.length === 0) {
    return (
      <div className="moves-empty" ref={scrollRef}>
        Awaiting the first move.
      </div>
    );
  }

  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || null,
    });
  }

  return (
    <div className="moves-grid" ref={scrollRef}>
      {rows.map(row => (
        <React.Fragment key={row.num}>
          <div className="mv-num">{row.num}.</div>
          <div
            className={`mv ${currentIndex === row.white.id ? 'current' : ''}`}
            onClick={() => onSelect(row.white.id)}
          >
            {row.white.san}
          </div>
          {row.black ? (
            <div
              className={`mv ${currentIndex === row.black.id ? 'current' : ''}`}
              onClick={() => onSelect(row.black.id)}
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

window.MoveList = MoveList;
