// Batch review queue — walks selected library games through the review
// worker sequentially. One single-threaded engine means the batch is
// inherently background-friendly: the machine stays usable while it runs.
//
//   useBatchReview(reviewWorker, setLibrary) -> {
//     batch,        // null | { gameIndex, gameCount, name } while running
//     runBatch(records, { nodes, force }),
//     cancelBatch,
//   }
//
// Per-position progress comes from reviewWorker.progress; this hook adds the
// game-level dimension. Records already reviewed with the same engine build
// and node budget are skipped unless `force`.

const { useState, useRef, useCallback } = React;

function reviewOneGame(record, reviewWorker, nodes) {
  const parsed = window.PGN.parse(record.pgn, { allowIllegal: true });
  const mainline = window.MoveTree.walkMainline(parsed.tree, parsed.tree.rootId);
  if (mainline.length < 2) return Promise.resolve(null);
  const fens = mainline.map(n => window.Chess.stateToFEN(n.state));

  return reviewWorker.analyzePositions(fens, { nodes }).then(results => {
    if (results.length < fens.length) return { cancelled: true };
    const moves = window.GameReviewFeatures.tagMoves(mainline, results);
    const summary = window.GameReviewClassify.summarize(
      moves.map(m => ({ turn: m.turn, lossCp: m.lossCp, classification: m.class, accuracy: m.accuracy }))
    );
    return {
      review: {
        engineId: reviewWorker.engineId,
        nodesPerPos: nodes,
        reviewedAt: Date.now(),
        openingKey: window.GameReviewFeatures.openingKey(mainline.slice(1).map(n => n.san)),
        moves,
        bestReplies: results.map(r => r.bestMove),
        summary,
      },
    };
  });
}

function useBatchReview(reviewWorker, setLibrary) {
  const [batch, setBatch] = useState(null);
  const cancelBatchRef = useRef(false);

  const runBatch = useCallback(async (records, opts = {}) => {
    const nodes = opts.nodes;
    const targets = records.filter(r =>
      opts.force ||
      !r.review ||
      r.review.engineId !== reviewWorker.engineId ||
      r.review.nodesPerPos !== nodes
    );
    if (targets.length === 0) return { reviewed: 0, skipped: records.length };

    cancelBatchRef.current = false;
    let reviewed = 0;
    for (let g = 0; g < targets.length; g++) {
      if (cancelBatchRef.current) break;
      const rec = targets[g];
      setBatch({ gameIndex: g + 1, gameCount: targets.length, name: rec.name });
      const out = await reviewOneGame(rec, reviewWorker, nodes);
      if (!out) continue; // empty game
      if (out.cancelled) break;
      reviewed++;
      setLibrary(lib => lib.map(r => (r.id === rec.id ? { ...r, review: out.review } : r)));
    }
    setBatch(null);
    return { reviewed, skipped: records.length - targets.length };
  }, [reviewWorker, setLibrary]);

  const cancelBatch = useCallback(() => {
    cancelBatchRef.current = true;
    reviewWorker.cancel();
  }, [reviewWorker]);

  return { batch, runBatch, cancelBatch };
}

if (typeof window !== 'undefined') window.useBatchReview = useBatchReview;
export default useBatchReview;
