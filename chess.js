// Minimal but correct chess engine for opening analysis.
// Board: 64-char string, index 0 = a8 (top-left), index 63 = h1 (bottom-right).
// Pieces: uppercase = white, lowercase = black, '.' = empty.

const FILES = ['a','b','c','d','e','f','g','h'];

const START_BOARD =
  "rnbqkbnr" +
  "pppppppp" +
  "........" +
  "........" +
  "........" +
  "........" +
  "PPPPPPPP" +
  "RNBQKBNR";

const START_STATE = {
  board: START_BOARD,
  turn: 'w',
  castling: 'KQkq',
  enPassant: null,         // square index or null
  halfmove: 0,
  fullmove: 1,
};

function clone(state) {
  return { ...state, board: state.board };
}

function isWhite(p) { return p && p !== '.' && p === p.toUpperCase(); }
function isBlack(p) { return p && p !== '.' && p === p.toLowerCase(); }
function colorOf(p) { return p === '.' ? null : (isWhite(p) ? 'w' : 'b'); }
function sameColor(a, b) { return a !== '.' && b !== '.' && colorOf(a) === colorOf(b); }

function sq(file, rank) {
  // file 0..7 (a..h), rank 0..7 (rank 8..rank 1)
  return rank * 8 + file;
}
function rcOf(idx) { return [Math.floor(idx / 8), idx % 8]; } // [rank-row, file-col]
function nameOf(idx) {
  const [r, c] = rcOf(idx);
  return FILES[c] + (8 - r);
}
function fromName(name) {
  const file = FILES.indexOf(name[0]);
  const rank = 8 - parseInt(name[1], 10);
  return rank * 8 + file;
}
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function setSquare(board, idx, piece) {
  return board.slice(0, idx) + piece + board.slice(idx + 1);
}

// ---------- pseudo-legal move generation ----------

function slidingMoves(board, idx, deltas) {
  const moves = [];
  const piece = board[idx];
  const [r, c] = rcOf(idx);
  for (const [dr, dc] of deltas) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const ni = nr * 8 + nc;
      const target = board[ni];
      if (target === '.') {
        moves.push(ni);
      } else {
        if (!sameColor(piece, target)) moves.push(ni);
        break;
      }
      nr += dr; nc += dc;
    }
  }
  return moves;
}

function stepMoves(board, idx, deltas) {
  const moves = [];
  const piece = board[idx];
  const [r, c] = rcOf(idx);
  for (const [dr, dc] of deltas) {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const ni = nr * 8 + nc;
    if (!sameColor(piece, board[ni])) moves.push(ni);
  }
  return moves;
}

const KNIGHT_DELTAS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING_DELTAS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const BISHOP_DELTAS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROOK_DELTAS = [[-1,0],[1,0],[0,-1],[0,1]];
const QUEEN_DELTAS = [...BISHOP_DELTAS, ...ROOK_DELTAS];

function pawnMoves(state, idx) {
  const moves = [];
  const { board, enPassant } = state;
  const piece = board[idx];
  const white = isWhite(piece);
  const dir = white ? -1 : 1;
  const startRank = white ? 6 : 1;
  const [r, c] = rcOf(idx);

  // forward 1
  const r1 = r + dir;
  if (inBounds(r1, c) && board[r1*8+c] === '.') {
    moves.push(r1*8+c);
    // forward 2 from start
    if (r === startRank) {
      const r2 = r + 2*dir;
      if (board[r2*8+c] === '.') moves.push(r2*8+c);
    }
  }
  // captures
  for (const dc of [-1, 1]) {
    const nr = r + dir, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const ni = nr*8+nc;
    const target = board[ni];
    if (target !== '.' && !sameColor(piece, target)) moves.push(ni);
    // en passant
    if (target === '.' && enPassant === ni) moves.push(ni);
  }
  return moves;
}

function rawPieceMoves(state, idx) {
  const piece = state.board[idx];
  if (piece === '.') return [];
  const t = piece.toLowerCase();
  switch (t) {
    case 'p': return pawnMoves(state, idx);
    case 'n': return stepMoves(state.board, idx, KNIGHT_DELTAS);
    case 'b': return slidingMoves(state.board, idx, BISHOP_DELTAS);
    case 'r': return slidingMoves(state.board, idx, ROOK_DELTAS);
    case 'q': return slidingMoves(state.board, idx, QUEEN_DELTAS);
    case 'k': return stepMoves(state.board, idx, KING_DELTAS);
  }
  return [];
}

function squareAttacked(board, idx, byColor) {
  // is `idx` attacked by any piece of `byColor`?
  const [r, c] = rcOf(idx);
  // pawn attacks
  const pdir = byColor === 'w' ? 1 : -1; // pawns of byColor capture toward us from this direction
  for (const dc of [-1, 1]) {
    const nr = r + pdir, nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr*8+nc];
      if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'p') return true;
    }
  }
  // knights
  for (const [dr, dc] of KNIGHT_DELTAS) {
    const nr = r+dr, nc = c+dc;
    if (!inBounds(nr,nc)) continue;
    const p = board[nr*8+nc];
    if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'n') return true;
  }
  // king
  for (const [dr, dc] of KING_DELTAS) {
    const nr = r+dr, nc = c+dc;
    if (!inBounds(nr,nc)) continue;
    const p = board[nr*8+nc];
    if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'k') return true;
  }
  // sliding: bishops/queens (diag) & rooks/queens (orth)
  for (const [dr, dc] of BISHOP_DELTAS) {
    let nr = r+dr, nc = c+dc;
    while (inBounds(nr,nc)) {
      const p = board[nr*8+nc];
      if (p !== '.') {
        if (colorOf(p) === byColor && (p.toLowerCase() === 'b' || p.toLowerCase() === 'q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  for (const [dr, dc] of ROOK_DELTAS) {
    let nr = r+dr, nc = c+dc;
    while (inBounds(nr,nc)) {
      const p = board[nr*8+nc];
      if (p !== '.') {
        if (colorOf(p) === byColor && (p.toLowerCase() === 'r' || p.toLowerCase() === 'q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  return false;
}

function findKing(board, color) {
  const target = color === 'w' ? 'K' : 'k';
  for (let i = 0; i < 64; i++) if (board[i] === target) return i;
  return -1;
}

function inCheck(state, color) {
  const k = findKing(state.board, color);
  if (k < 0) return false;
  return squareAttacked(state.board, k, color === 'w' ? 'b' : 'w');
}

// Apply a move (no validation beyond piece type). Returns new state + meta.
function applyMove(state, from, to, options = {}) {
  const piece = state.board[from];
  if (piece === '.') return null;
  const white = isWhite(piece);
  let board = state.board;
  let captured = board[to];
  const meta = { piece, from, to, captured, castle: null, enPassant: false, promotion: null };

  // En passant capture
  if (piece.toLowerCase() === 'p' && to === state.enPassant && board[to] === '.') {
    const epPawnIdx = white ? to + 8 : to - 8;
    captured = board[epPawnIdx];
    board = setSquare(board, epPawnIdx, '.');
    meta.captured = captured;
    meta.enPassant = true;
  }

  // Castling: king moves two squares
  if (piece.toLowerCase() === 'k' && Math.abs((to % 8) - (from % 8)) === 2) {
    const rank = white ? 7 : 0;
    if (to % 8 === 6) { // king-side
      board = setSquare(board, rank*8+5, board[rank*8+7]);
      board = setSquare(board, rank*8+7, '.');
      meta.castle = 'K';
    } else if (to % 8 === 2) { // queen-side
      board = setSquare(board, rank*8+3, board[rank*8+0]);
      board = setSquare(board, rank*8+0, '.');
      meta.castle = 'Q';
    }
  }

  // Move piece
  board = setSquare(board, to, piece);
  board = setSquare(board, from, '.');

  // Promotion (auto to queen unless specified)
  if (piece.toLowerCase() === 'p') {
    const [tr] = rcOf(to);
    if (tr === 0 || tr === 7) {
      const promo = options.promotion || 'q';
      board = setSquare(board, to, white ? promo.toUpperCase() : promo.toLowerCase());
      meta.promotion = promo;
    }
  }

  // Castling rights update
  let cr = state.castling;
  if (piece === 'K') cr = cr.replace('K','').replace('Q','');
  if (piece === 'k') cr = cr.replace('k','').replace('q','');
  if (piece === 'R' && from === 63) cr = cr.replace('K','');
  if (piece === 'R' && from === 56) cr = cr.replace('Q','');
  if (piece === 'r' && from === 7)  cr = cr.replace('k','');
  if (piece === 'r' && from === 0)  cr = cr.replace('q','');
  // captured rook
  if (to === 63) cr = cr.replace('K','');
  if (to === 56) cr = cr.replace('Q','');
  if (to === 7)  cr = cr.replace('k','');
  if (to === 0)  cr = cr.replace('q','');
  if (cr === '') cr = '-';

  // En passant target
  let ep = null;
  if (piece.toLowerCase() === 'p' && Math.abs(from - to) === 16) {
    ep = (from + to) / 2;
  }

  const newState = {
    board,
    turn: state.turn === 'w' ? 'b' : 'w',
    castling: cr,
    enPassant: ep,
    halfmove: (piece.toLowerCase() === 'p' || captured !== '.') ? 0 : state.halfmove + 1,
    fullmove: state.turn === 'b' ? state.fullmove + 1 : state.fullmove,
  };

  return { state: newState, meta };
}

// Is a move fully legal? (correct color, valid pattern, doesn't leave king in check, castling rules)
function isLegalMove(state, from, to, options = {}) {
  const piece = state.board[from];
  if (piece === '.') return false;
  if (colorOf(piece) !== state.turn) return false;
  if (sameColor(piece, state.board[to])) return false;

  // Castling: special handling
  if (piece.toLowerCase() === 'k' && Math.abs((to % 8) - (from % 8)) === 2) {
    return isLegalCastle(state, from, to);
  }

  const raw = rawPieceMoves(state, from);
  if (!raw.includes(to)) return false;

  // Doesn't leave own king in check
  const res = applyMove(state, from, to, options);
  if (!res) return false;
  if (inCheck(res.state, state.turn)) return false;
  return true;
}

function isLegalCastle(state, from, to) {
  const white = state.turn === 'w';
  const rank = white ? 7 : 0;
  if (from !== rank*8 + 4) return false;
  const opp = white ? 'b' : 'w';
  if (squareAttacked(state.board, from, opp)) return false; // not in check

  if (to === rank*8 + 6) { // king-side
    if (!state.castling.includes(white ? 'K' : 'k')) return false;
    if (state.board[rank*8+5] !== '.' || state.board[rank*8+6] !== '.') return false;
    if (squareAttacked(state.board, rank*8+5, opp)) return false;
    if (squareAttacked(state.board, rank*8+6, opp)) return false;
    return true;
  }
  if (to === rank*8 + 2) { // queen-side
    if (!state.castling.includes(white ? 'Q' : 'q')) return false;
    if (state.board[rank*8+1] !== '.' || state.board[rank*8+2] !== '.' || state.board[rank*8+3] !== '.') return false;
    if (squareAttacked(state.board, rank*8+3, opp)) return false;
    if (squareAttacked(state.board, rank*8+2, opp)) return false;
    return true;
  }
  return false;
}

function legalTargetsFrom(state, from) {
  const piece = state.board[from];
  if (piece === '.' || colorOf(piece) !== state.turn) return [];
  const targets = new Set(rawPieceMoves(state, from));
  // add castling possibilities
  if (piece.toLowerCase() === 'k') {
    const rank = state.turn === 'w' ? 7 : 0;
    if (isLegalCastle(state, from, rank*8+6)) targets.add(rank*8+6);
    if (isLegalCastle(state, from, rank*8+2)) targets.add(rank*8+2);
  }
  const legal = [];
  for (const t of targets) {
    if (isLegalMove(state, from, t)) legal.push(t);
  }
  return legal;
}

// All legal moves for current player (for SAN disambiguation + check/mate)
function allLegalMoves(state) {
  const moves = [];
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (p === '.' || colorOf(p) !== state.turn) continue;
    for (const t of legalTargetsFrom(state, i)) {
      moves.push([i, t]);
    }
  }
  return moves;
}

// SAN notation
function toSAN(state, from, to, options = {}) {
  const piece = state.board[from];
  const white = isWhite(piece);
  const type = piece.toLowerCase();
  const captured = state.board[to];
  const isCapture = captured !== '.' || (type === 'p' && to === state.enPassant);

  // Castling
  if (type === 'k' && Math.abs((to % 8) - (from % 8)) === 2) {
    const san = (to % 8 === 6) ? 'O-O' : 'O-O-O';
    return san + suffixCheck(state, from, to, options);
  }

  let san = '';
  if (type === 'p') {
    if (isCapture) san += FILES[from % 8] + 'x';
    san += nameOf(to);
    if (options.promotion) san += '=' + options.promotion.toUpperCase();
  } else {
    san += type.toUpperCase();
    // Disambiguation
    const all = allLegalMoves(state);
    const sameTarget = all.filter(([f, t]) =>
      t === to && f !== from && state.board[f].toLowerCase() === type
    );
    if (sameTarget.length > 0) {
      const [fr, fc] = rcOf(from);
      const sameFile = sameTarget.some(([f]) => (f % 8) === fc);
      const sameRank = sameTarget.some(([f]) => Math.floor(f / 8) === fr);
      if (!sameFile) san += FILES[fc];
      else if (!sameRank) san += String(8 - fr);
      else san += FILES[fc] + (8 - fr);
    }
    if (isCapture) san += 'x';
    san += nameOf(to);
  }
  return san + suffixCheck(state, from, to, options);
}

function suffixCheck(state, from, to, options) {
  const res = applyMove(state, from, to, options);
  if (!res) return '';
  const opp = res.state.turn;
  if (!inCheck(res.state, opp)) return '';
  if (allLegalMoves(res.state).length === 0) return '#';
  return '+';
}

window.Chess = {
  START_STATE, FILES,
  isWhite, isBlack, colorOf,
  sq, rcOf, nameOf, fromName,
  applyMove, isLegalMove, legalTargetsFrom, allLegalMoves,
  toSAN, inCheck, findKing,
};
