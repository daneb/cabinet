// Engine slice: useEngine hook + ArrowOverlay SVG component.
// UCI handshake: send 'uci' + 'isready' together; configure MultiPV after 'readyok'.

const { useState, useEffect, useRef } = React;

const ARROW_COLORS = {
  1: '#00c853',  // best move — bright green
  2: '#2962ff',  // 2nd — blue
  3: '#9e9e9e',  // 3rd — gray
};
const ARROW_IDS = { 1: 'green', 2: 'blue', 3: 'gray' };

function squareCenter(idx, flipped) {
  let [row, col] = window.Chess.rcOf(idx);
  if (flipped) { row = 7 - row; col = 7 - col; }
  return { x: col + 0.5, y: row + 0.5 };
}

function uciToArrow(move) {
  if (!move || move.length < 4) return null;
  const from = window.Chess.fromName(move.slice(0, 2));
  const to = window.Chess.fromName(move.slice(2, 4));
  if (isNaN(from) || isNaN(to)) return null;
  return { from, to };
}

function ArrowOverlay({ arrows, flipped }) {
  if (!arrows || arrows.length === 0) return null;

  return (
    <svg
      className="arrow-overlay"
      viewBox="0 0 8 8"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {[1, 2, 3].map(rank => (
          <marker
            key={rank}
            id={`ah-${ARROW_IDS[rank]}`}
            markerWidth="4"
            markerHeight="4"
            refX="2"
            refY="2"
            orient="auto"
          >
            <polygon
              points="0 0, 4 2, 0 4"
              fill={ARROW_COLORS[rank]}
              opacity="0.9"
            />
          </marker>
        ))}
      </defs>
      {arrows.map((arrow, i) => {
        const indices = uciToArrow(arrow.move);
        if (!indices) return null;
        const from = squareCenter(indices.from, flipped);
        const to = squareCenter(indices.to, flipped);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return null;
        const shortTo = {
          x: to.x - (dx / len) * 0.42,
          y: to.y - (dy / len) * 0.42,
        };
        const color = ARROW_COLORS[arrow.rank] || '#9e9e9e';
        const markerId = ARROW_IDS[arrow.rank] || 'gray';
        return (
          <line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={shortTo.x}
            y2={shortTo.y}
            stroke={color}
            strokeWidth="0.18"
            strokeLinecap="round"
            markerEnd={`url(#ah-${markerId})`}
            opacity="0.80"
          />
        );
      })}
    </svg>
  );
}

function useEngine(fen) {
  const [engineReady, setEngineReady] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [arrows, setArrows] = useState([]);
  const workerRef = useRef(null);
  const debounceRef = useRef(null);
  const lastArrowUpdateRef = useRef(0);
  const lastArrowsRef = useRef([]);

  useEffect(() => {
    let worker;
    let currentFenTurn = 'w';
    let pvLines = {};

    try {
      worker = new Worker('slices/engine/vendor/stockfish.js');
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const line = (typeof e.data === 'string' ? e.data : String(e.data)).trim();

        if (line === 'readyok') {
          console.log('[engine] ready');
          worker.postMessage('setoption name MultiPV value 3');
          setEngineReady(true);
          return;
        }

        if (line.startsWith('bestmove')) {
          if (lastArrowsRef.current.length > 0) {
            setArrows(lastArrowsRef.current);
            lastArrowUpdateRef.current = performance.now();
          }
          return;
        }

        if (line.startsWith('info') && line.includes('multipv') && line.includes('score') && line.includes(' pv ')) {
          const parts = line.split(' ');
          const depthIdx = parts.indexOf('depth');
          const multipvIdx = parts.indexOf('multipv');
          const scoreIdx = parts.indexOf('score');
          const pvIdx = parts.indexOf('pv');
          if (depthIdx < 0 || multipvIdx < 0 || scoreIdx < 0 || pvIdx < 0) return;

          const depth = parseInt(parts[depthIdx + 1]);
          const multipv = parseInt(parts[multipvIdx + 1]);
          const scoreType = parts[scoreIdx + 1];
          let scoreValue = parseInt(parts[scoreIdx + 2]);
          if (currentFenTurn === 'b') scoreValue = -scoreValue;
          const moves = parts.slice(pvIdx + 1, pvIdx + 4);

          if (!pvLines.depth || pvLines.depth !== depth) {
            pvLines = { depth, lines: {} };
          }
          pvLines.lines[multipv] = { score: { type: scoreType, value: scoreValue }, moves };

          const bestLine = pvLines.lines[1];
          if (bestLine) {
            const newArrows = [];
            for (let rank = 1; rank <= 3; rank++) {
              const l = pvLines.lines[rank];
              if (l && l.moves[0] && l.moves[0].length >= 4) {
                newArrows.push({ move: l.moves[0], rank });
              }
            }
            setEvaluation(bestLine.score);
            lastArrowsRef.current = newArrows;
            const now = performance.now();
            if (newArrows.length > 0 && now - lastArrowUpdateRef.current > 200) {
              setArrows(newArrows);
              lastArrowUpdateRef.current = now;
            }
          }
        }
      };

      worker.onerror = (err) => {
        console.warn('[engine] worker error:', err.message);
      };

      // Send uci + isready together; setoption is sent after readyok arrives.
      worker.postMessage('uci');
      worker.postMessage('isready');

      workerRef._setFenTurn = (t) => { currentFenTurn = t; };
    } catch (err) {
      console.warn('[engine] could not start worker:', err.message);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage('quit');
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!engineReady || !fen || !workerRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const turn = fen.split(' ')[1] || 'w';
      if (workerRef._setFenTurn) workerRef._setFenTurn(turn);
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage('position fen ' + fen);
      workerRef.current.postMessage('go depth 14');
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fen, engineReady]);

  return { engineReady, evaluation, arrows };
}

window.useEngine = useEngine;
window.ArrowOverlay = ArrowOverlay;
