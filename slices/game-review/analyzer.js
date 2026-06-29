// Game-review analyzer hook. Owns a SECOND Stockfish worker dedicated to
// analyzing historical positions so the live-position engine stays responsive.
//
// Exposes:
//   useReviewWorker() -> {
//     ready,                 // boolean — worker is alive and UCI handshake done
//     status,                // 'idle' | 'running' | 'cancelling'
//     progress,              // { current, total } during runs
//     analyzePositions(fens, { depth, onPositionDone, signal }) -> Promise<Array<{ fen, evalCp }>>
//   }
//
// `analyzePositions` walks FENs sequentially. For each, it sends
//   ucinewgame, position fen <fen>, go depth <depth>
// and waits for `bestmove`, while remembering the deepest `info ... multipv 1`
// score (already normalized to White's perspective).

const { useState, useEffect, useRef, useCallback } = React;

const STOCKFISH_PATH = 'slices/engine/vendor/stockfish.js';

function parseInfoScore(line, fenTurn) {
  // Returns { depth, score } or null. Only for the primary line — but Stockfish
  // omits `multipv` from info lines when MultiPV=1 (the analyzer's setting), so
  // a missing `multipv` field is treated as multipv 1.
  if (!line.startsWith('info')) return null;
  const parts = line.split(' ');
  const multipvIdx = parts.indexOf('multipv');
  if (multipvIdx >= 0 && parts[multipvIdx + 1] !== '1') return null;
  const depthIdx = parts.indexOf('depth');
  const scoreIdx = parts.indexOf('score');
  if (scoreIdx < 0) return null;
  const depth = depthIdx >= 0 ? parseInt(parts[depthIdx + 1], 10) : 0;
  const scoreType = parts[scoreIdx + 1];
  let value = parseInt(parts[scoreIdx + 2], 10);
  if (Number.isNaN(value)) return null;
  // Stockfish reports score from the side-to-move's perspective. Flip to White's view.
  if (fenTurn === 'b') value = -value;
  return { depth, score: { type: scoreType, value } };
}

function useReviewWorker() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const workerRef = useRef(null);
  const messageHandlerRef = useRef(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    let worker;
    try {
      worker = new Worker(STOCKFISH_PATH);
      workerRef.current = worker;
      worker.onmessage = (e) => {
        const line = (typeof e.data === 'string' ? e.data : String(e.data)).trim();
        if (messageHandlerRef.current) messageHandlerRef.current(line);
      };
      worker.onerror = (err) => {
        console.warn('[game-review] worker error:', err.message);
      };
      worker.postMessage('uci');
      worker.postMessage('isready');

      // First-time setup: wait for readyok, then enable.
      const initHandler = (line) => {
        if (line === 'readyok') {
          worker.postMessage('setoption name MultiPV value 1');
          setReady(true);
          messageHandlerRef.current = null;
        }
      };
      messageHandlerRef.current = initHandler;
    } catch (err) {
      console.warn('[game-review] could not start review worker:', err.message);
    }

    return () => {
      if (workerRef.current) {
        try { workerRef.current.postMessage('quit'); } catch {}
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Analyze one FEN; resolves with the best score we saw before `bestmove`.
  // Handles two edge cases that this Stockfish build doesn't emit `bestmove` for:
  //   - terminal positions (mate already on the board) — recognized via `score mate 0`
  //   - a safety timeout, in case the worker silently stalls
  const analyzeOne = useCallback((fen, depth) => {
    return new Promise((resolve) => {
      const worker = workerRef.current;
      if (!worker) { resolve(null); return; }
      const fenTurn = fen.split(' ')[1] || 'w';
      let bestScore = null;
      let settled = false;
      const settle = (score) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        messageHandlerRef.current = null;
        resolve(score);
      };

      const handler = (line) => {
        if (line.startsWith('info')) {
          const parsed = parseInfoScore(line, fenTurn);
          if (parsed) {
            bestScore = parsed.score;
            // Terminal: side to move is already mated/giving mate at depth 0.
            if (parsed.score.type === 'mate' && parsed.score.value === 0) {
              settle(bestScore);
            }
          }
          return;
        }
        if (line.startsWith('bestmove')) {
          settle(bestScore);
        }
      };
      messageHandlerRef.current = handler;
      const timer = setTimeout(() => {
        try { worker.postMessage('stop'); } catch {}
        settle(bestScore);
      }, 15000);

      worker.postMessage('stop');
      worker.postMessage('position fen ' + fen);
      worker.postMessage('go depth ' + depth);
    });
  }, []);

  const analyzePositions = useCallback(async (fens, opts = {}) => {
    if (!workerRef.current || !ready) return [];
    const depth = opts.depth || 14;
    const results = [];
    cancelRef.current = false;
    setStatus('running');
    setProgress({ current: 0, total: fens.length });

    for (let i = 0; i < fens.length; i++) {
      if (cancelRef.current) break;
      const fen = fens[i];
      const score = await analyzeOne(fen, depth);
      results.push({ fen, score });
      setProgress({ current: i + 1, total: fens.length });
      if (opts.onPositionDone) opts.onPositionDone({ index: i, fen, score });
    }

    // Make sure the worker isn't left thinking.
    try { workerRef.current.postMessage('stop'); } catch {}
    setStatus('idle');
    return results;
  }, [ready, analyzeOne]);

  const cancel = useCallback(() => {
    if (!workerRef.current) return;
    cancelRef.current = true;
    setStatus('cancelling');
    try { workerRef.current.postMessage('stop'); } catch {}
  }, []);

  return { ready, status, progress, analyzePositions, cancel };
}

if (typeof window !== 'undefined') window.useReviewWorker = useReviewWorker;
export default useReviewWorker;
