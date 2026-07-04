// Game library store + settings — pure module, no React, no DOM.
//
// The library is a flat list of game records (imported PGNs or games played
// in-app), each carrying its PGN text and, once reviewed, a per-move review
// blob. PGN text is stored instead of tree JSON because it is 10–20x smaller.
//
// Record shape:
//   { id, name, headers, pgn, userSide: 'w'|'b'|null, createdAt,
//     review: null | { engineId, nodesPerPos, reviewedAt, moves: [...],
//                      bestReplies: [...], summary } }
//
// Persistence mirrors the saves store: localStorage for instant load, best-
// effort disk mirror via /api/library (serve.js and electron/main.cjs).

const LIBRARY_KEY = 'chess_review_library_v1';
const SETTINGS_KEY = 'chess_review_settings_v1';
const LIBRARY_URL = '/api/library';

const DEFAULT_SETTINGS = {
  playerNames: [],
  defaultQuality: 'standard',
  ollama: { url: 'http://localhost:11434', model: 'qwen2.5:7b-instruct' },
};

function loadLibraryLocal() {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]'); } catch { return []; }
}

function persistLibraryLocal(records) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(records)); } catch {}
}

async function loadLibraryFromDisk() {
  try {
    const res = await fetch(LIBRARY_URL);
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

async function persistLibraryToDisk(records) {
  try {
    await fetch(LIBRARY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records),
    });
  } catch {}
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!stored) return { ...DEFAULT_SETTINGS };
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      ollama: { ...DEFAULT_SETTINGS.ollama, ...(stored.ollama || {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

// Which side did the user play? Case-insensitive substring match of any known
// player name against the White/Black headers. Ambiguous (both match) or no
// match -> null; the UI offers a manual toggle.
function inferUserSide(headers, playerNames) {
  if (!headers || !playerNames || playerNames.length === 0) return null;
  const names = playerNames.map(n => n.trim().toLowerCase()).filter(Boolean);
  const white = (headers.White || '').toLowerCase();
  const black = (headers.Black || '').toLowerCase();
  const matchesWhite = names.some(n => white.includes(n));
  const matchesBlack = names.some(n => black.includes(n));
  if (matchesWhite && !matchesBlack) return 'w';
  if (matchesBlack && !matchesWhite) return 'b';
  return null;
}

function defaultName(headers) {
  const white = (headers && headers.White) || '?';
  const black = (headers && headers.Black) || '?';
  const date = (headers && headers.Date) || '';
  const result = (headers && headers.Result) || '';
  return `${white} – ${black}${result && result !== '*' ? ' ' + result : ''}${date ? ' (' + date + ')' : ''}`;
}

function makeRecord({ name, headers, pgn, userSide }) {
  return {
    id: globalThis.MoveTree.uuid(),
    name: name || defaultName(headers),
    headers: headers || {},
    pgn,
    userSide: userSide != null ? userSide : null,
    createdAt: Date.now(),
    review: null,
  };
}

const GameLibrary = {
  LIBRARY_KEY,
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  loadLibraryLocal,
  persistLibraryLocal,
  loadLibraryFromDisk,
  persistLibraryToDisk,
  loadSettings,
  persistSettings,
  inferUserSide,
  defaultName,
  makeRecord,
};

if (typeof window !== 'undefined') window.GameLibrary = GameLibrary;
export default GameLibrary;
