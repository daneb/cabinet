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
  enPassant: null,
  halfmove: 0,
  fullmove: 1,
};

function isWhite(p) { return p && p !== '.' && p === p.toUpperCase(); }
function isBlack(p) { return p && p !== '.' && p === p.toLowerCase(); }
function colorOf(p) { return p === '.' ? null : (isWhite(p) ? 'w' : 'b'); }
function sameColor(a, b) { return a !== '.' && b !== '.' && colorOf(a) === colorOf(b); }

function rcOf(idx) { return [Math.floor(idx / 8), idx % 8]; }
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

function stateToFEN(state) {
  let placement = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = state.board[r * 8 + c];
      if (p === '.') {
        empty++;
      } else {
        if (empty) { placement += empty; empty = 0; }
        placement += p;
      }
    }
    if (empty) placement += empty;
    if (r < 7) placement += '/';
  }
  const ep = state.enPassant !== null ? nameOf(state.enPassant) : '-';
  const castling = state.castling || '-';
  return `${placement} ${state.turn} ${castling} ${ep} ${state.halfmove} ${state.fullmove}`;
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

  const r1 = r + dir;
  if (inBounds(r1, c) && board[r1*8+c] === '.') {
    moves.push(r1*8+c);
    if (r === startRank) {
      const r2 = r + 2*dir;
      if (board[r2*8+c] === '.') moves.push(r2*8+c);
    }
  }
  for (const dc of [-1, 1]) {
    const nr = r + dir, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const ni = nr*8+nc;
    const target = board[ni];
    if (target !== '.' && !sameColor(piece, target)) moves.push(ni);
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
  const [r, c] = rcOf(idx);
  const pdir = byColor === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const nr = r + pdir, nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr*8+nc];
      if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'p') return true;
    }
  }
  for (const [dr, dc] of KNIGHT_DELTAS) {
    const nr = r+dr, nc = c+dc;
    if (!inBounds(nr,nc)) continue;
    const p = board[nr*8+nc];
    if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'n') return true;
  }
  for (const [dr, dc] of KING_DELTAS) {
    const nr = r+dr, nc = c+dc;
    if (!inBounds(nr,nc)) continue;
    const p = board[nr*8+nc];
    if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'k') return true;
  }
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

function applyMove(state, from, to, options = {}) {
  const piece = state.board[from];
  if (piece === '.') return null;
  const white = isWhite(piece);
  let board = state.board;
  let captured = board[to];
  const meta = { piece, from, to, captured, castle: null, enPassant: false, promotion: null };

  if (piece.toLowerCase() === 'p' && to === state.enPassant && board[to] === '.') {
    const epPawnIdx = white ? to + 8 : to - 8;
    captured = board[epPawnIdx];
    board = setSquare(board, epPawnIdx, '.');
    meta.captured = captured;
    meta.enPassant = true;
  }

  if (piece.toLowerCase() === 'k' && Math.abs((to % 8) - (from % 8)) === 2) {
    const rank = white ? 7 : 0;
    if (to % 8 === 6) {
      board = setSquare(board, rank*8+5, board[rank*8+7]);
      board = setSquare(board, rank*8+7, '.');
      meta.castle = 'K';
    } else if (to % 8 === 2) {
      board = setSquare(board, rank*8+3, board[rank*8+0]);
      board = setSquare(board, rank*8+0, '.');
      meta.castle = 'Q';
    }
  }

  board = setSquare(board, to, piece);
  board = setSquare(board, from, '.');

  if (piece.toLowerCase() === 'p') {
    const [tr] = rcOf(to);
    if (tr === 0 || tr === 7) {
      const promo = options.promotion || 'q';
      board = setSquare(board, to, white ? promo.toUpperCase() : promo.toLowerCase());
      meta.promotion = promo;
    }
  }

  let cr = state.castling;
  if (piece === 'K') cr = cr.replace('K','').replace('Q','');
  if (piece === 'k') cr = cr.replace('k','').replace('q','');
  if (piece === 'R' && from === 63) cr = cr.replace('K','');
  if (piece === 'R' && from === 56) cr = cr.replace('Q','');
  if (piece === 'r' && from === 7)  cr = cr.replace('k','');
  if (piece === 'r' && from === 0)  cr = cr.replace('q','');
  if (to === 63) cr = cr.replace('K','');
  if (to === 56) cr = cr.replace('Q','');
  if (to === 7)  cr = cr.replace('k','');
  if (to === 0)  cr = cr.replace('q','');
  if (cr === '') cr = '-';

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

function isLegalMove(state, from, to, options = {}) {
  const piece = state.board[from];
  if (piece === '.') return false;
  if (colorOf(piece) !== state.turn) return false;
  if (sameColor(piece, state.board[to])) return false;

  if (piece.toLowerCase() === 'k' && Math.abs((to % 8) - (from % 8)) === 2) {
    return isLegalCastle(state, from, to);
  }

  const raw = rawPieceMoves(state, from);
  if (!raw.includes(to)) return false;

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
  if (squareAttacked(state.board, from, opp)) return false;

  if (to === rank*8 + 6) {
    if (!state.castling.includes(white ? 'K' : 'k')) return false;
    if (state.board[rank*8+5] !== '.' || state.board[rank*8+6] !== '.') return false;
    if (squareAttacked(state.board, rank*8+5, opp)) return false;
    if (squareAttacked(state.board, rank*8+6, opp)) return false;
    return true;
  }
  if (to === rank*8 + 2) {
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

function toSAN(state, from, to, options = {}) {
  const piece = state.board[from];
  const white = isWhite(piece);
  const type = piece.toLowerCase();
  const captured = state.board[to];
  const isCapture = captured !== '.' || (type === 'p' && to === state.enPassant);

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

function parseSAN(state, san) {
  let s = san.replace(/[+#!?]/g, '');

  // Promotion suffix
  let promotion = null;
  if (s.includes('=')) {
    promotion = s[s.length - 1].toLowerCase();
    s = s.slice(0, -2);
  }

  // Castles
  if (s === 'O-O' || s === 'O-O-O') {
    const kIdx = findKing(state.board, state.turn);
    const rank = state.turn === 'w' ? 7 : 0;
    const to = s === 'O-O' ? rank * 8 + 6 : rank * 8 + 2;
    return { from: kIdx, to, promotion: null };
  }

  // Destination is always the last 2 chars
  if (s.length < 2) return null;
  const to = fromName(s.slice(-2));
  if (to < 0 || to >= 64) return null;
  s = s.slice(0, -2);

  // Remove capture marker
  s = s.replace('x', '');

  // Determine piece type
  let pieceType = 'p';
  if (s.length > 0 && s[0] >= 'A' && s[0] <= 'Z') {
    pieceType = s[0].toLowerCase();
    s = s.slice(1);
  }

  // Disambiguation
  let disFile = null;
  let disRank = null;
  if (s.length >= 1 && s[0] >= 'a' && s[0] <= 'h') {
    disFile = s[0];
    if (s.length >= 2) disRank = parseInt(s[1], 10);
  } else if (s.length >= 1 && s[0] >= '1' && s[0] <= '8') {
    disRank = parseInt(s[0], 10);
  }

  const candidates = [];
  for (const [from, t] of allLegalMoves(state)) {
    if (t !== to) continue;
    const piece = state.board[from];
    if (piece === '.') continue;
    if (piece.toLowerCase() !== pieceType) continue;
    if (colorOf(piece) !== state.turn) continue;

    // Disambiguation filters
    const fc = from % 8;
    const fr = Math.floor(from / 8);
    if (disFile && FILES[fc] !== disFile) continue;
    if (disRank && (8 - fr) !== disRank) continue;

    // Promotion check
    if (promotion) {
      if (piece.toLowerCase() !== 'p') continue;
      const tr = Math.floor(to / 8);
      if (tr !== 0 && tr !== 7) continue;
    } else {
      // Without explicit promotion, reject pawn moves to the last rank
      if (piece.toLowerCase() === 'p') {
        const tr = Math.floor(to / 8);
        if (tr === 0 || tr === 7) continue;
      }
    }

    candidates.push({ from, to, promotion });
  }

  return candidates.length === 1 ? candidates[0] : null;
}

function fromFEN(fen) {
  const [placement, turn, castling, epStr, halfmove, fullmove] = fen.split(' ');
  let board = '';
  for (const ch of placement) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') board += '.'.repeat(+ch);
    else board += ch;
  }
  return {
    board,
    turn,
    castling: castling === '-' ? '' : castling,
    enPassant: epStr === '-' ? null : fromName(epStr),
    halfmove: +halfmove,
    fullmove: +fullmove,
  };
}

const Chess = {
  START_STATE, FILES,
  isWhite, isBlack, colorOf,
  rcOf, nameOf, fromName,
  applyMove, isLegalMove, legalTargetsFrom, allLegalMoves,
  toSAN, parseSAN, inCheck, findKing, stateToFEN, fromFEN,
};
if (typeof window !== 'undefined') window.Chess = Chess;
export default Chess;
