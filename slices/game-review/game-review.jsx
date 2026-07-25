// GameReviewPanel — manual-trigger Lichess-style review (accuracy + classification counts).
// Lives in the right-hand panel, mirrors the structure of the Chapters / Sync sections.

const { useState, useMemo, useCallback } = React;

const CLASS_ROWS = [
  { key: 'best', label: 'Best', color: '#3a8' },
  { key: 'excellent', label: 'Excellent', color: '#7bb' },
  { key: 'good', label: 'Good', color: 'var(--ink-2)' },
  { key: 'inaccuracy', label: 'Inaccuracy', color: '#d4a017' },
  { key: 'mistake', label: 'Mistake', color: '#e07a3f' },
  { key: 'blunder', label: 'Blunder', color: '#c44' },
];

function fmtAccuracy(a) {
  if (a == null) return '–';
  return a.toFixed(1);
}

function buildMovesFromTree(tree) {
  // Reconstruct per-move analysis from stored annotations on mainline nodes.
  const mainline = window.MoveTree.walkMainline(tree, tree.rootId);
  const out = [];
  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i];
    const parent = mainline[i - 1];
    if (node.reviewLossCp == null || node.reviewClass == null) continue;
    out.push({
      nodeId: node.id,
      turn: parent.state.turn,
      lossCp: node.reviewLossCp,
      classification: node.reviewClass,
      accuracy: node.reviewAccuracy != null ? node.reviewAccuracy : null,
    });
  }
  return out;
}

// `reviewWorker` is the shared useReviewWorker() instance owned by App — the
// Library panel's batch queue drives the same worker, so both UIs disable
// while either is analyzing.
function GameReviewPanel({ tree, setTree, reviewWorker }) {
  const { ready, engineId, status, progress, analyzePositions, cancel } = reviewWorker;
  const [error, setError] = useState(null);
  const [tier, setTier] = useState(window.ReviewBudgets.DEFAULT_TIER);

  const moves = useMemo(() => buildMovesFromTree(tree), [tree]);
  const summary = useMemo(() => window.GameReviewClassify.summarize(moves), [moves]);
  const hasAnalysis = moves.length > 0;

  const mainlineLength = useMemo(() => {
    return window.MoveTree.walkMainline(tree, tree.rootId).length - 1;
  }, [tree]);

  const handleAnalyze = useCallback(async () => {
    setError(null);
    const mainline = window.MoveTree.walkMainline(tree, tree.rootId);
    if (mainline.length < 2) {
      setError('Play some moves first.');
      return;
    }
    if (!ready) {
      setError('Engine still starting…');
      return;
    }
    const fens = mainline.map(n => window.Chess.stateToFEN(n.state));
    const nodes = window.ReviewBudgets.QUALITY_TIERS[tier].nodes;
    const results = await analyzePositions(fens, { nodes });
    if (results.length < fens.length) {
      // Cancelled — leave existing annotations untouched.
      return;
    }
    const annotations = {};
    for (let i = 1; i < mainline.length; i++) {
      const node = mainline[i];
      const parent = mainline[i - 1];
      const evalBeforeCp = window.GameReviewClassify.evalToCp(results[i - 1].score);
      const evalAfterCp = window.GameReviewClassify.evalToCp(results[i].score);
      const turn = parent.state.turn;
      const lossCp = window.GameReviewClassify.computeLossCp(evalBeforeCp, evalAfterCp, turn);
      const winPctLoss = window.GameReviewClassify.computeWinPctLoss(evalBeforeCp, evalAfterCp, turn);
      const classification = window.GameReviewClassify.classifyByWinPctLoss(winPctLoss);
      const accuracy = window.GameReviewClassify.moveAccuracy(evalBeforeCp, evalAfterCp, turn);
      annotations[node.id] = {
        reviewLossCp: lossCp,
        reviewClass: classification,
        reviewAccuracy: accuracy,
      };
    }
    setTree(t => ({
      ...window.MoveTree.setReviewAnnotations(t, annotations),
      reviewMeta: { engineId, nodesPerPos: nodes, reviewedAt: Date.now() },
    }));
  }, [tree, ready, engineId, tier, analyzePositions, setTree]);

  const handleClear = useCallback(() => {
    setTree(t => {
      const { reviewMeta, ...rest } = window.MoveTree.clearReviewAnnotations(t);
      return rest;
    });
    setError(null);
  }, [setTree]);

  const isRunning = status !== 'idle';

  return (
    <div className="game-review">
        {isRunning ? (
          <div className="gr-progress">
            <div className="gr-progress-text">
              {status === 'cancelling' ? 'Cancelling…' : `Analyzing ${progress.current} / ${progress.total}`}
            </div>
            <div className="gr-progress-bar">
              <div
                className="gr-progress-fill"
                style={{ width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%' }}
              />
            </div>
            <button className="btn btn-ghost" onClick={cancel} disabled={status === 'cancelling'}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="gr-controls">
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={!ready || mainlineLength === 0}
              title={!ready ? 'Engine starting…' : mainlineLength === 0 ? 'Play some moves first' : ''}
            >
              {hasAnalysis ? 'Re-analyze' : 'Analyze game'}
            </button>
            {hasAnalysis ? (
              <button className="btn btn-ghost" onClick={handleClear}>Clear</button>
            ) : null}
            <select
              className="gr-tier-select"
              value={tier}
              onChange={e => setTier(e.target.value)}
              disabled={isRunning}
              title={window.ReviewBudgets.QUALITY_TIERS[tier].hint}
            >
              {Object.entries(window.ReviewBudgets.QUALITY_TIERS).map(([key, t]) => (
                <option key={key} value={key}>{t.label}</option>
              ))}
            </select>
          </div>
        )}

        {error ? <div className="gr-error">{error}</div> : null}

        {hasAnalysis ? (
          <>
            <div className="gr-table">
              <div className="gr-row gr-row-head">
                <div className="gr-label"></div>
                <div className="gr-cell">White</div>
                <div className="gr-cell">Black</div>
              </div>
              <div className="gr-row gr-row-accuracy">
                <div className="gr-label">Accuracy</div>
                <div className="gr-cell gr-accuracy">{fmtAccuracy(summary.white.accuracy)}</div>
                <div className="gr-cell gr-accuracy">{fmtAccuracy(summary.black.accuracy)}</div>
              </div>
              {CLASS_ROWS.map(row => (
                <div key={row.key} className="gr-row">
                  <div className="gr-label" style={{ color: row.color }}>{row.label}</div>
                  <div className="gr-cell">{summary.white.counts[row.key]}</div>
                  <div className="gr-cell">{summary.black.counts[row.key]}</div>
                </div>
              ))}
            </div>
            <div className="gr-footnote">
              {tree.reviewMeta
                ? `${tree.reviewMeta.engineId} · ${Math.round(tree.reviewMeta.nodesPerPos / 1000)}k nodes/move · win-pct accuracy`
                : 'Lichess-style win-pct accuracy'}
            </div>
          </>
        ) : (
          !isRunning ? (
            <div className="gr-empty">
              Click <strong>Analyze game</strong> to grade each move and compute per-side accuracy.
            </div>
          ) : null
        )}
    </div>
  );
}

if (typeof window !== 'undefined') window.GameReviewPanel = GameReviewPanel;
export default GameReviewPanel;
