// Drill mode — test repertoire recall from memory.
// Hook: useDrill — state machine for USER_TURN, OPPONENT_TURN, MISS, SHOW_ANSWER, COMPLETE.
// Components: DrillStatusBar, DrillBanner, DrillSummary.

const { useState, useEffect, useCallback, useRef } = React;

// ---- useDrill hook ----

function useDrill(tree, setTree, baseCurrentNodeId, onSetCurrentNode) {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState('USER_TURN'); // USER_TURN | OPPONENT_TURN | MISS_PAUSE | SHOW_ANSWER | COMPLETE
  const [rootId, setRootId] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [side, setSide] = useState('w');
  const [strictness, setStrictness] = useState('any');
  const [misses, setMisses] = useState([]);
  const [successCount, setSuccessCount] = useState(0);
  const [totalNodes, setTotalNodes] = useState(0);
  const [lastMiss, setLastMiss] = useState(null);
  const answerTimerRef = useRef(null);

  // Count nodes in drill subtree
  const countUserNodes = useCallback((startId) => {
    let count = 0;
    function walk(id) {
      const node = tree.nodes[id];
      if (!node) return;
      for (const cid of node.childIds) {
        const child = tree.nodes[cid];
        // Count nodes where it's the user's turn to play (one ply ahead)
        if (child && tree.nodes[id].state.turn === side) {
          count++;
        }
        walk(cid);
      }
    }
    walk(startId);
    return count;
  }, [tree, side]);

  const startDrill = useCallback((startId, userSide, mode) => {
    const s = userSide || 'w';
    setSide(s);
    setStrictness(mode || 'any');
    setRootId(startId);
    setCurrentId(startId);
    setTotalNodes(countUserNodes(startId));
    setSuccessCount(0);
    setMisses([]);
    setLastMiss(null);
    setPhase('USER_TURN');
    setActive(true);
    onSetCurrentNode(startId);
  }, [countUserNodes, onSetCurrentNode]);

  const endDrill = useCallback(() => {
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
    setPhase('COMPLETE');
  }, []);

  const closeDrill = useCallback(() => {
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
    setActive(false);
    setPhase('USER_TURN');
    setRootId(null);
    setCurrentId(null);
    setMisses([]);
    setLastMiss(null);
  }, []);

  // Auto-play opponent moves
  useEffect(() => {
    if (!active || phase !== 'OPPONENT_TURN') return;
    const node = tree.nodes[currentId];
    if (!node || node.childIds.length === 0) {
      setPhase('COMPLETE');
      return;
    }

    const timer = setTimeout(() => {
      // Play mainline child
      const childId = node.childIds[0];
      const child = tree.nodes[childId];
      if (!child) return;

      // Update study state for the opponent move (passive visit)
      let t = window.MoveTree.visitNode(tree, childId);
      setTree(t);

      setCurrentId(childId);
      onSetCurrentNode(childId);

      // Check next phase
      const nextNode = tree.nodes[childId];
      if (!nextNode || nextNode.childIds.length === 0) {
        setPhase('COMPLETE');
      } else {
        setPhase('USER_TURN');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [active, phase, currentId]);

  // Handle user move
  const handleMove = useCallback((from, to, promotion) => {
    if (!active || phase !== 'USER_TURN') return null;

    const node = tree.nodes[currentId];
    if (!node || node.childIds.length === 0) return null;

    const opts = promotion ? { promotion } : {};
    const san = window.Chess.toSAN(node.state, from, to, opts);
    if (!san) return null;

    // Find matching child
    let matchedId = null;
    for (const cid of node.childIds) {
      if (tree.nodes[cid].san === san) {
        if (strictness === 'any' || cid === node.childIds[0]) {
          matchedId = cid;
          break;
        }
      }
    }

    if (matchedId) {
      // Correct!
      const updatedTree = window.MoveTree.recordDrillResult(tree, matchedId, true);
      setTree(updatedTree);
      setSuccessCount(c => c + 1);
      setCurrentId(matchedId);
      onSetCurrentNode(matchedId);

      // Check next phase
      const nextNode = updatedTree.nodes[matchedId];
      if (!nextNode || nextNode.childIds.length === 0) {
        setPhase('COMPLETE');
      } else if (nextNode.state.turn === side) {
        setPhase('USER_TURN');
      } else {
        setPhase('OPPONENT_TURN');
      }

      return { correct: true, expected: null };
    } else {
      // Wrong!
      const expectedId = node.childIds[0];
      const expectedSan = tree.nodes[expectedId].san;
      const miss = { nodeId: currentId, expected: expectedSan, played: san };

      // Mark failure on mainline child
      let updatedTree = window.MoveTree.recordDrillResult(tree, expectedId, false);
      setTree(updatedTree);

      setMisses(m => [...m, miss]);
      setLastMiss(miss);
      setPhase('SHOW_ANSWER');

      // Auto-reveal answer after 5 seconds
      if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
      answerTimerRef.current = setTimeout(() => {
        setLastMiss(null);
        // Advance by auto-playing the correct move
        setCurrentId(expectedId);
        onSetCurrentNode(expectedId);
        const nextNode = updatedTree.nodes[expectedId];
        if (!nextNode || nextNode.childIds.length === 0) {
          setPhase('COMPLETE');
        } else if (nextNode.state.turn === side) {
          setPhase('USER_TURN');
        } else {
          setPhase('OPPONENT_TURN');
        }
      }, 5000);

      return { correct: false, expected: expectedSan };
    }
  }, [active, phase, currentId, tree, side, strictness, setTree, onSetCurrentNode]);

  // User hits ? to show answer immediately
  const showAnswer = useCallback(() => {
    if (phase !== 'SHOW_ANSWER' || !lastMiss) return;
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current);

    const node = tree.nodes[currentId];
    const expectedId = node.childIds[0];
    setLastMiss(null);
    setCurrentId(expectedId);
    onSetCurrentNode(expectedId);

    const nextNode = tree.nodes[expectedId];
    if (!nextNode || nextNode.childIds.length === 0) {
      setPhase('COMPLETE');
    } else if (nextNode.state.turn === side) {
      setPhase('USER_TURN');
    } else {
      setPhase('OPPONENT_TURN');
    }
  }, [phase, lastMiss, currentId, tree, side, onSetCurrentNode]);

  // Drill misses again
  const drillMisses = useCallback(() => {
    if (misses.length === 0) return;
    // Restart from root, but only with missed nodes? That's complex.
    // For v1: just restart from root.
    startDrill(rootId, side, strictness);
  }, [misses, rootId, side, strictness, startDrill]);

  return {
    drill: { active, phase, rootId, currentId, side, strictness, misses, successCount, totalNodes, lastMiss },
    startDrill,
    handleMove,
    showAnswer,
    endDrill,
    closeDrill,
    drillMisses,
  };
}

// ---- Drill UI components ----

function DrillStatusBar({ phase, successCount, totalNodes, misses, side, strictness, onEnd }) {
  const pct = totalNodes > 0 ? Math.round((successCount / totalNodes) * 100) : 0;
  const phaseLabel =
    phase === 'USER_TURN' ? 'Your turn' :
    phase === 'OPPONENT_TURN' ? 'Opponent thinking…' :
    phase === 'SHOW_ANSWER' ? 'Wrong — try again or press ?' :
    '';
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ padding: '8px 12px', background: 'var(--surface)', borderRadius: '4px 4px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          {phaseLabel}
          {misses.length > 0 ? <span style={{ color: 'var(--accent)', marginLeft: 8 }}>{misses.length} miss{misses.length !== 1 ? 'es' : ''}</span> : null}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {side === 'w' ? 'White' : 'Black'} · {strictness === 'any' ? 'Any book' : 'Mainline only'}
        </span>
      </div>
      <div style={{ height: 3, background: 'var(--ink-4)', borderRadius: '0 0 4px 4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: misses.length > 0 ? 'var(--accent)' : '#3a8', transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 12px 0', fontSize: 11, color: 'var(--ink-3)' }}>
        <span>{successCount}/{totalNodes} nodes</span>
        <span>? hint · Esc end</span>
      </div>
    </div>
  );
}

function DrillBanner({ miss, onShowAnswer }) {
  if (!miss) return null;
  return (
    <div style={{ padding: '8px 12px', background: 'rgba(212, 80, 80, 0.12)', border: '1px solid rgba(212, 80, 80, 0.3)', borderRadius: 4, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--accent)' }}>
            Expected: <strong>{miss.expected}</strong>.
          </span>
          <span style={{ color: 'var(--ink-2)', marginLeft: 8 }}>
            You played: {miss.played}.
          </span>
        </span>
        <button className="btn btn-ghost" onClick={onShowAnswer} style={{ fontSize: 12 }}>
          Next / ?
        </button>
      </div>
    </div>
  );
}

function DrillSummary({ successCount, totalNodes, misses, onDrillMisses, onClose }) {
  const pct = totalNodes > 0 ? Math.round((successCount / totalNodes) * 100) : 0;
  return (
    <div className="promotion-overlay" onClick={onClose}>
      <div className="promotion-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3>Drill complete</h3>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 600, color: pct === 100 ? '#3a8' : 'var(--ink)' }}>
              {pct}%
            </span>
            <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              {successCount}/{totalNodes} correct
            </span>
          </div>
          {misses.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Misses:</p>
              {misses.map((m, i) => (
                <div key={i} style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}>
                  <span style={{ color: 'var(--accent)' }}>{m.played}</span>
                  <span style={{ color: 'var(--ink-3)' }}> → </span>
                  <span style={{ color: '#3a8' }}>{m.expected}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 14, color: '#3a8', marginTop: 8 }}>
              Perfect — every move correct.
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          {misses.length > 0 ? (
            <button className="btn btn-primary" onClick={onDrillMisses}>Drill misses again</button>
          ) : null}
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

window.useDrill = useDrill;
window.DrillStatusBar = DrillStatusBar;
window.DrillBanner = DrillBanner;
window.DrillSummary = DrillSummary;
