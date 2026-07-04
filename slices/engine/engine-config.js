// Engine build registry + shared UCI worker boot. Pure module, no React.
//
// Both the live-analysis engine (engine.jsx) and the game-review analyzer
// (analyzer.js) spawn Stockfish as a plain Web Worker speaking raw UCI
// strings. This module owns which build gets spawned and the uci/isready
// handshake, so a bad or missing primary build degrades to the legacy one
// instead of silently killing analysis.
//
//   bootUciWorker() -> Promise<{ worker, engineId }>
//
// Resolves after `readyok`; the caller then installs its own onmessage and
// sends its setoptions. Rejects only if BOTH builds fail to boot.

const ENGINE_PRIMARY = {
  id: 'sf18-lite-single',
  label: 'Stockfish 18 lite',
  path: 'slices/engine/vendor/stockfish-18-lite-single.js',
};

// Pre-NNUE stockfish.js build that shipped with the first engine slice.
// Kept as a runtime fallback: it is meaningfully weaker per node, so reviews
// produced on it carry a different engineId and are never aggregated with
// primary-build reviews.
const ENGINE_FALLBACK = {
  id: 'sf-legacy',
  label: 'Stockfish (legacy)',
  path: 'slices/engine/vendor/stockfish.js',
};

const BOOT_TIMEOUT_MS = 8000;

function bootBuild(build, timeoutMs) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(build.path);
    } catch (err) {
      reject(err);
      return;
    }
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { worker.terminate(); } catch {}
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error('boot timeout: ' + build.path)), timeoutMs);
    worker.onerror = (e) => fail(new Error(e.message || 'worker error: ' + build.path));
    worker.onmessage = (e) => {
      const line = (typeof e.data === 'string' ? e.data : String(e.data)).trim();
      if (line === 'readyok' && !settled) {
        settled = true;
        clearTimeout(timer);
        worker.onmessage = null;
        worker.onerror = null;
        resolve({ worker, engineId: build.id, engineLabel: build.label });
      }
    };
    worker.postMessage('uci');
    worker.postMessage('isready');
  });
}

async function bootUciWorker() {
  try {
    return await bootBuild(ENGINE_PRIMARY, BOOT_TIMEOUT_MS);
  } catch (err) {
    console.warn('[engine] primary build failed to boot, falling back:', err.message);
    return bootBuild(ENGINE_FALLBACK, BOOT_TIMEOUT_MS);
  }
}

const EngineConfig = { ENGINE_PRIMARY, ENGINE_FALLBACK, bootUciWorker };

if (typeof window !== 'undefined') window.EngineConfig = EngineConfig;
export default EngineConfig;
