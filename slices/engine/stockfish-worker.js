// Stockfish Web Worker — loads Stockfish and communicates via postMessage.
// Messages IN from main thread:  { type: 'analyze', fen } | { type: 'stop' } | { type: 'quit' }
// Messages OUT to main thread:   { type: 'ready' } | { type: 'info', evaluation, arrows } | { type: 'bestmove', move }

importScripts('/slices/engine/vendor/stockfish.js');

let sf = null;
let fenTurn = 'w';
let pvLines = {};
let engineReady = false;

try {
  // stockfish.js@10 (cdnjs) exposes STOCKFISH(); newer builds may expose Stockfish()
  if (typeof STOCKFISH !== 'undefined') {
    sf = STOCKFISH();
  } else if (typeof Stockfish !== 'undefined') {
    sf = Stockfish();
  } else {
    self.postMessage({ type: 'error', message: 'No Stockfish constructor found' });
  }
} catch (e) {
  self.postMessage({ type: 'error', message: 'Failed to load Stockfish: ' + e.message });
}

function parseInfoLine(line) {
  const parts = line.split(' ');
  const depthIdx = parts.indexOf('depth');
  const multipvIdx = parts.indexOf('multipv');
  const scoreIdx = parts.indexOf('score');
  const pvIdx = parts.indexOf('pv');

  if (depthIdx < 0 || multipvIdx < 0 || scoreIdx < 0) return null;

  const depth = parseInt(parts[depthIdx + 1]);
  const multipv = parseInt(parts[multipvIdx + 1]);
  const scoreType = parts[scoreIdx + 1]; // 'cp' or 'mate'
  let scoreValue = parseInt(parts[scoreIdx + 2]);

  // Normalize to white's POV
  if (fenTurn === 'b') scoreValue = -scoreValue;

  const moves = pvIdx >= 0 ? parts.slice(pvIdx + 1, pvIdx + 4) : [];

  return { depth, multipv, score: { type: scoreType, value: scoreValue }, moves };
}

if (sf) {
  sf.onmessage = function(event) {
    const line = typeof event === 'string' ? event : (event.data || '');

    if (line === 'readyok') {
      engineReady = true;
      self.postMessage({ type: 'ready' });
      return;
    }

    if (line.startsWith('info') && line.includes('multipv') && line.includes('score') && line.includes('pv')) {
      const parsed = parseInfoLine(line);
      if (!parsed) return;
      const { depth, multipv, score, moves } = parsed;

      if (!pvLines.depth || pvLines.depth !== depth) {
        pvLines = { depth, lines: {} };
      }
      pvLines.lines[multipv] = { score, moves };

      const lineCount = Object.keys(pvLines.lines).length;
      if (lineCount >= 3 || lineCount >= 1) {
        const arrows = [];
        for (let rank = 1; rank <= 3; rank++) {
          const pvLine = pvLines.lines[rank];
          if (pvLine && pvLine.moves[0] && pvLine.moves[0].length >= 4) {
            arrows.push({ move: pvLine.moves[0], rank });
          }
        }
        const bestLine = pvLines.lines[1];
        if (bestLine) {
          self.postMessage({
            type: 'info',
            depth,
            evaluation: bestLine.score,
            arrows,
          });
        }
      }
      return;
    }

    if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      const move = parts[1] !== '(none)' ? parts[1] : null;
      self.postMessage({ type: 'bestmove', move });
    }
  };

  sf.postMessage('uci');
  sf.postMessage('setoption name MultiPV value 3');
  sf.postMessage('setoption name Threads value 1');
  sf.postMessage('isready');
}

self.onmessage = function(e) {
  if (!sf) return;
  const { type, fen } = e.data;

  if (type === 'analyze') {
    pvLines = {};
    fenTurn = fen.split(' ')[1] || 'w';
    sf.postMessage('stop');
    sf.postMessage('position fen ' + fen);
    sf.postMessage('go depth 18');
  } else if (type === 'stop') {
    sf.postMessage('stop');
  } else if (type === 'quit') {
    sf.postMessage('quit');
    self.close();
  }
};
