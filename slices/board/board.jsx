// Board rendering with drag-and-drop support and arrow overlay.

const PIECE_GLYPH = {
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const Square = React.memo(function Square({
  idx, piece, light, selected, isLast, isLegal, isCapture, isCheck,
  onClick, isDragOver,
  onDragStart, onDragEnd, onDragOver, onDrop,
  isDragging,
}) {
  const classes = ['sq'];
  classes.push(light ? 'light' : 'dark');
  if (selected) classes.push('sel');
  if (isLast) classes.push('last');
  if (isDragOver) classes.push('drag-over');

  return (
    <div
      className={classes.join(' ')}
      onClick={() => onClick(idx)}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isCheck ? <div className="check-glow"></div> : null}
      {piece !== '.' ? (
        <span
          className={`piece ${window.Chess.isWhite(piece) ? 'white' : 'black'}${isDragging ? ' dragging' : ''}`}
          draggable
          onDragStart={(e) => onDragStart(e, idx)}
          onDragEnd={onDragEnd}
        >
          {PIECE_GLYPH[piece]}
        </span>
      ) : null}
      {isLegal && !isCapture ? <div className="legal-dot"></div> : null}
      {isLegal && isCapture ? <div className="legal-ring"></div> : null}
    </div>
  );
});

const Board = React.memo(function Board({
  state, selected, legalTargets, lastMove, onSquareClick, checkSquare, flipped,
  dragFrom, dragTargets, onDragStart, onDragEnd, onDrop,
  arrows,
}) {
  const squares = [];
  const order = [];
  for (let i = 0; i < 64; i++) order.push(i);
  if (flipped) order.reverse();

  const activeLegalTargets = dragFrom !== null ? (dragTargets || []) : legalTargets;

  for (const i of order) {
    const [r, c] = window.Chess.rcOf(i);
    const light = (r + c) % 2 === 0;
    const piece = state.board[i];
    const isLegal = activeLegalTargets.includes(i);
    const selPiece = (selected !== null ? state.board[selected] : null) || (dragFrom !== null ? state.board[dragFrom] : null) || '.';
    const isCapture = isLegal && (piece !== '.' || (piece === '.' && state.enPassant === i && selPiece?.toLowerCase() === 'p'));
    const isLast = lastMove && (i === lastMove.from || i === lastMove.to);

    squares.push(
      <Square
        key={i}
        idx={i}
        piece={piece}
        light={light}
        selected={selected === i || dragFrom === i}
        isLast={isLast}
        isLegal={isLegal}
        isCapture={isCapture}
        isCheck={i === checkSquare}
        onClick={onSquareClick}
        isDragOver={false}
        isDragging={dragFrom === i}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={(e) => { if (activeLegalTargets.includes(i)) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); onDrop(i); }}
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
      <div className="board-wrapper">
        <div className="board">
          {squares}
        </div>
        {arrows && arrows.length > 0 && window.ArrowOverlay
          ? <window.ArrowOverlay arrows={arrows} flipped={flipped} />
          : null}
      </div>
      <div className="file-labels">
        {files.map(f => <span key={f}>{f}</span>)}
      </div>
    </div>
  );
});

window.ChessBoard = Board;
