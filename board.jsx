// Board rendering — squares, pieces, click-to-move, legal-move dots.

// Use the FILLED (black) Unicode glyphs for BOTH sides — they share one silhouette.
// Color is applied via CSS so white pieces are tinted light with a dark stroke.
const PIECE_GLYPH = {
  K: '\u265A', Q: '\u265B', R: '\u265C', B: '\u265D', N: '\u265E', P: '\u265F',
  k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
};

function Square({ idx, piece, light, selected, isLast, isLegal, isCapture, showCorners, fileLabel, rankLabel, onClick, isCheck }) {
  const classes = ['sq'];
  classes.push(light ? 'light' : 'dark');
  if (selected) classes.push('sel');
  if (isLast) classes.push('last');
  return (
    <div className={classes.join(' ')} onClick={() => onClick(idx)}>
      {isCheck ? <div className="check-glow"></div> : null}
      {showCorners && fileLabel ? <span className="corner file">{fileLabel}</span> : null}
      {showCorners && rankLabel ? <span className="corner rank">{rankLabel}</span> : null}
      {piece !== '.' ? (
        <span className={`piece ${window.Chess.isWhite(piece) ? 'white' : 'black'}`}>
          {PIECE_GLYPH[piece]}
        </span>
      ) : null}
      {isLegal && !isCapture ? <div className="legal-dot"></div> : null}
      {isLegal && isCapture ? <div className="legal-ring"></div> : null}
    </div>
  );
}

function Board({ state, selected, legalTargets, lastMove, onSquareClick, checkSquare, flipped }) {
  const squares = [];
  const order = [];
  for (let i = 0; i < 64; i++) order.push(i);
  if (flipped) order.reverse();

  for (const i of order) {
    const [r, c] = window.Chess.rcOf(i);
    const light = (r + c) % 2 === 0;
    const piece = state.board[i];
    const isLegal = legalTargets.includes(i);
    const selPiece = selected !== null ? state.board[selected] : '.';
    const isCapture = isLegal && (piece !== '.' || (piece === '.' && state.enPassant === i && selPiece?.toLowerCase() === 'p'));
    const isLast = lastMove && (i === lastMove.from || i === lastMove.to);
    squares.push(
      <Square
        key={i}
        idx={i}
        piece={piece}
        light={light}
        selected={selected === i}
        isLast={isLast}
        isLegal={isLegal}
        isCapture={isCapture}
        showCorners={false}
        onClick={onSquareClick}
        isCheck={i === checkSquare}
      />
    );
  }

  const ranks = flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
  const files = flipped ? [...window.Chess.FILES].reverse() : window.Chess.FILES;

  return (
    <div className="board-frame">
      <div className="rank-labels">
        {ranks.map(n => <span key={n}>{n}</span>)}
      </div>
      <div className="board">
        {squares}
      </div>
      <div className="file-labels">
        {files.map(f => <span key={f}>{f}</span>)}
      </div>
    </div>
  );
}

window.ChessBoard = Board;
