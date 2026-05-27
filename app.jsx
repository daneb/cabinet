// Main app — thin orchestrator wiring all slices together.

import './slices/game-core/chess.js';
import './slices/move-tree/move-tree.js';
import './slices/board/board.jsx';
import './slices/drag/drag.jsx';
import './slices/eval-bar/eval-bar.jsx';
import './slices/engine/engine.jsx';
import './slices/move-list/move-list.jsx';
import './slices/panel/panel.jsx';
import './slices/pgn/pgn.js';
import './slices/drill/drill.jsx';

const { useState, useEffect, useCallback, useMemo, useRef } = React;

const STORAGE_KEY = 'chess_analysis_saves_v2';
const SESSION_KEY = 'chess_analysis_session_v2';
const V1_SAVES_KEY = 'chess_analysis_saves_v1';
const FILE_STORE_URL = '/api/saves';
const MATERIAL_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };

function loadSavesLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function persistSavesLocal(saves) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saves)); } catch {}
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function persistSession(data) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch {}
}

async function loadSavesFromDisk() {
  try {
    const res = await fetch(FILE_STORE_URL);
    if (res.ok) return await res.json();
  } catch {}
  return null;
}
async function persistSavesToDisk(saves) {
  try {
    await fetch(FILE_STORE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saves),
    });
  } catch {}
}

function App() {
  const initialTree = window.MoveTree.createTree(window.Chess.START_STATE);

  const [tree, setTree] = useState(initialTree);
  const [currentNodeId, setCurrentNodeId] = useState(initialTree.rootId);
  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [flipped, setFlipped] = useState(false);
  const [saves, setSaves] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeName, setActiveName] = useState('');
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [toast, setToast] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [drillMenu, setDrillMenu] = useState(null); // { nodeId, x, y }

  const toastTimerRef = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  }, []);

  // ---- Drill mode ----

  const {
    drill, startDrill, handleMove: handleDrillMove,
    showAnswer, endDrill, closeDrill, drillMisses,
  } = window.useDrill(tree, setTree, currentNodeId, setCurrentNodeId);

  const handleDrillContext = useCallback((nodeId, x, y) => {
    // Find the root of the variation if this node lives inside one
    let variationRoot = null;
    let id = nodeId;
    while (id && id !== tree.rootId) {
      const node = tree.nodes[id];
      if (!node?.parentId) break;
      const parent = tree.nodes[node.parentId];
      if (!parent) break;
      if (parent.childIds[0] !== id) { variationRoot = id; break; }
      id = node.parentId;
    }
    setDrillMenu({ nodeId, x, y, variationRoot });
  }, [tree]);

  const closeDrillMenu = useCallback(() => setDrillMenu(null), []);

  const handleDeleteFrom = useCallback((nodeId) => {
    if (!nodeId || nodeId === tree.rootId) return;
    const node = tree.nodes[nodeId];
    if (!node) return;
    // If the cursor sits inside the subtree being removed, land on the parent
    const isInSubtree = (cursor, root) => {
      let id = cursor;
      while (id) {
        if (id === root) return true;
        id = tree.nodes[id]?.parentId;
      }
      return false;
    };
    const newTree = window.MoveTree.deleteSubtree(tree, nodeId);
    setTree(newTree);
    if (isInSubtree(currentNodeId, nodeId)) {
      setCurrentNodeId(node.parentId || newTree.rootId);
    }
    setSelected(null);
    setLegalTargets([]);
    setDirty(true);
    closeDrillMenu();
    showToast('Deleted');
  }, [tree, currentNodeId, closeDrillMenu, showToast]);

  // ---- Apply decay on load ----

  useEffect(() => {
    setTree(t => window.MoveTree.applyDecay(t));
  }, []); // once on mount

  // ---- Load saves (disk first, localStorage fallback) ----

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const disk = await loadSavesFromDisk();
      if (cancelled) return;
      if (disk && disk.length) {
        setSaves(disk);
      } else {
        const local = loadSavesLocal();
        if (local.length) {
          setSaves(local);
          // Migrate existing localStorage data to disk
          persistSavesToDisk(local);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- v1 → v2 migration ----

  useEffect(() => {
    const v1Saves = (() => { try { return JSON.parse(localStorage.getItem(V1_SAVES_KEY) || '[]'); } catch { return []; } })();
    if (!v1Saves.length) return;
    const existing = loadSavesLocal();
    if (existing.length) return; // v2 saves already exist, skip migration

    const migrated = window.MoveTree.migrateV1toV2(v1Saves);
    if (migrated.length) {
      persistSavesLocal(migrated);
      persistSavesToDisk(migrated);
      setSaves(migrated);
      console.info('[migration] v1 → v2:', migrated.length, 'lines migrated');
    }
  }, []);

  // ---- Restore last session ----

  useEffect(() => {
    const sess = loadSession();
    if (sess && sess.tree && sess.tree.nodes) {
      setTree(sess.tree);
      setCurrentNodeId(sess.currentNodeId || sess.tree.rootId);
      setFlipped(!!sess.flipped);
      setActiveId(sess.activeId || null);
      setActiveName(sess.activeName || '');
      setDirty(!!sess.dirty);
    }
  }, []);

  // ---- Auto-persist session ----

  useEffect(() => {
    persistSession({ tree, currentNodeId, flipped, activeId, activeName, dirty });
  }, [tree, currentNodeId, flipped, activeId, activeName, dirty]);

  // ---- Derived values ----

  const currentNode = tree.nodes[currentNodeId] || tree.nodes[tree.rootId];
  const currentState = currentNode.state;
  const currentMove = currentNode.san ? currentNode : null;
  const atStart = currentNodeId === tree.rootId;
  const atEnd = currentNode.childIds.length === 0;

  const checkSquare = useMemo(() => {
    if (window.Chess.inCheck(currentState, currentState.turn)) {
      return window.Chess.findKing(currentState.board, currentState.turn);
    }
    return null;
  }, [currentState]);

  // Engine integration
  const fen = useMemo(() => window.Chess.stateToFEN(currentState), [currentState]);
  const { engineReady, evaluation: engineEval, arrows } = window.useEngine(fen);

  // Material count fallback for eval bar when engine isn't ready
  const materialEval = useMemo(() => {
    let score = 0;
    for (const p of currentState.board) {
      if (p === '.') continue;
      const val = MATERIAL_VALUES[p.toLowerCase()] || 0;
      score += window.Chess.isWhite(p) ? val : -val;
    }
    return { type: 'cp', value: score * 100 };
  }, [currentState]);

  const displayEval = engineReady ? engineEval : materialEval;

  // ---- Commit a move ----

  const commitMove = useCallback((from, to, promotion = null) => {
    if (drill.active) {
      handleDrillMove(from, to, promotion);
      setSelected(null);
      setLegalTargets([]);
      return;
    }
    const opts = promotion ? { promotion } : {};
    const res = window.MoveTree.playMove(tree, currentNodeId, from, to, opts);
    if (!res) return;
    setTree(res.tree);
    setCurrentNodeId(res.nodeId);
    setSelected(null);
    setLegalTargets([]);
    setDirty(true);
  }, [tree, currentNodeId, drill.active, drill.phase, handleDrillMove]);

  // ---- Drag-and-drop hook ----

  const { dragFrom, dragTargets, didDragRef, handleDragStart, handleDragEnd, handleDrop } =
    window.useDragPiece({ currentState, commitMove, setSelected, setLegalTargets, setPendingPromotion });

  // ---- Click handling ----

  const handleSquareClick = useCallback((idx) => {
    if (didDragRef && didDragRef.current) return;

    const piece = currentState.board[idx];

    if (selected === null) {
      if (piece !== '.' && window.Chess.colorOf(piece) === currentState.turn) {
        setSelected(idx);
        setLegalTargets(window.Chess.legalTargetsFrom(currentState, idx));
      }
      return;
    }

    if (selected === idx) { setSelected(null); setLegalTargets([]); return; }

    if (piece !== '.' && window.Chess.colorOf(piece) === currentState.turn) {
      setSelected(idx);
      setLegalTargets(window.Chess.legalTargetsFrom(currentState, idx));
      return;
    }

    if (!legalTargets.includes(idx)) { setSelected(null); setLegalTargets([]); return; }

    const selPiece = currentState.board[selected];
    const isPromotion = selPiece.toLowerCase() === 'p' && (Math.floor(idx / 8) === 0 || Math.floor(idx / 8) === 7);
    if (isPromotion) { setPendingPromotion({ from: selected, to: idx }); return; }
    commitMove(selected, idx);
  }, [selected, legalTargets, currentState, commitMove, didDragRef]);

  // ---- Tree navigation ----

  const goToNode = useCallback((nodeId) => {
    if (!nodeId || !tree.nodes[nodeId]) return;
    setTree(t => window.MoveTree.visitNode(t, nodeId));
    setCurrentNodeId(nodeId);
    setSelected(null);
    setLegalTargets([]);
  }, [tree]);

  // ---- Keyboard navigation ----

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const node = tree.nodes[currentNodeId];
      if (!node) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (node.parentId) goToNode(node.parentId);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (node.childIds[0]) goToNode(node.childIds[0]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (node.parentId) {
          const parent = tree.nodes[node.parentId];
          const idx = parent.childIds.indexOf(currentNodeId);
          const prev = idx > 0 ? parent.childIds[idx - 1] : parent.childIds[parent.childIds.length - 1];
          if (prev) goToNode(prev);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (node.parentId) {
          const parent = tree.nodes[node.parentId];
          const idx = parent.childIds.indexOf(currentNodeId);
          const next = idx < parent.childIds.length - 1 ? parent.childIds[idx + 1] : parent.childIds[0];
          if (next) goToNode(next);
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToNode(tree.rootId);
      } else if (e.key === 'End') {
        e.preventDefault();
        const mainline = window.MoveTree.walkMainline(tree, currentNodeId);
        const leaf = mainline[mainline.length - 1];
        if (leaf) goToNode(leaf.id);
      } else if (e.key === 'f' || e.key === 'F') {
        setFlipped(f => !f);
      } else if (e.key === '?' && drill.active) {
        e.preventDefault();
        showAnswer();
      } else if (e.key === 'Escape') {
        if (drill.active) { endDrill(); return; }
        setSelected(null); setLegalTargets([]); setPendingPromotion(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentNodeId, tree, goToNode]);

  // ---- Variation detection ----

  const isInVariation = useMemo(() => {
    let id = currentNodeId;
    while (id && id !== tree.rootId) {
      const node = tree.nodes[id];
      if (!node?.parentId) break;
      const parent = tree.nodes[node.parentId];
      if (!parent) break;
      if (parent.childIds[0] !== id) return true;
      id = node.parentId;
    }
    return false;
  }, [tree, currentNodeId]);

  // The mainline sibling at the branch point — used by "← Main line" button
  const mainlineNodeAtBranch = useMemo(() => {
    if (!isInVariation) return null;
    let id = currentNodeId;
    while (id && id !== tree.rootId) {
      const node = tree.nodes[id];
      if (!node?.parentId) break;
      const parent = tree.nodes[node.parentId];
      if (!parent) break;
      if (parent.childIds[0] !== id) return parent.childIds[0];
      id = node.parentId;
    }
    return null;
  }, [isInVariation, tree, currentNodeId]);

  // ---- Move list display ----

  const mainlinePlyCount = window.MoveTree.mainlineDepth(tree);

  const turnLabel = currentState.turn === 'w' ? 'White to move' : 'Black to move';
  const mateOrStale = useMemo(() => {
    if (window.Chess.allLegalMoves(currentState).length > 0) return null;
    return window.Chess.inCheck(currentState, currentState.turn) ? 'checkmate' : 'stalemate';
  }, [currentState]);

  // ---- Save / Load / Delete ----

  const handleSave = (name) => {
    const id = activeId || window.MoveTree.uuid();
    const payload = { id, name, tree, cursorOn: currentNodeId, updatedAt: Date.now() };
    const existing = saves.find(s => s.id === id);
    let next;
    if (existing) {
      next = saves.map(s => s.id === id ? payload : s);
      showToast(`Updated "${name}"`);
    } else {
      const byName = saves.find(s => s.name.toLowerCase() === name.toLowerCase());
      if (byName) {
        payload.id = byName.id;
        next = saves.map(s => s.id === byName.id ? payload : s);
        showToast(`Overwrote "${name}"`);
      } else {
        next = [payload, ...saves];
        showToast(`Saved as "${name}"`);
      }
    }
    next.sort((a, b) => b.updatedAt - a.updatedAt);
    setSaves(next);
    persistSavesLocal(next);
    persistSavesToDisk(next);
    setActiveId(payload.id);
    setActiveName(name);
    setDirty(false);
  };

  const handleLoad = (id) => {
    const s = saves.find(x => x.id === id);
    if (!s) return;
    setTree(s.tree);
    setCurrentNodeId(s.cursorOn || s.tree.rootId);
    setActiveId(s.id);
    setActiveName(s.name);
    setSelected(null);
    setLegalTargets([]);
    setDirty(false);
    showToast(`Loaded "${s.name}"`);
  };

  const handleDelete = (id) => {
    const s = saves.find(x => x.id === id);
    if (!s) return;
    if (!confirm(`Delete "${s.name}"?`)) return;
    const next = saves.filter(x => x.id !== id);
    setSaves(next);
    persistSavesLocal(next);
    persistSavesToDisk(next);
    if (activeId === id) { setActiveId(null); setActiveName(''); }
    showToast(`Deleted "${s.name}"`);
  };

  const handleNew = () => {
    if (dirty && !confirm('Discard current line?')) return;
    const fresh = window.MoveTree.createTree(window.Chess.START_STATE);
    setTree(fresh);
    setCurrentNodeId(fresh.rootId);
    setActiveId(null);
    setActiveName('');
    setSelected(null);
    setLegalTargets([]);
    setDirty(false);
    showToast('New analysis');
  };

  const handleImport = () => {
    if (dirty && !confirm('Discard current line?')) return;
    setImportText('');
    setShowImport(true);
  };

  const doImport = () => {
    const text = importText.trim();
    if (!text) return;
    const result = window.PGN.parse(text, { allowIllegal: true });
    if (result.error && !result.tree) {
      showToast(`Import failed: ${result.error}`);
      return;
    }
    setTree(result.tree);
    setCurrentNodeId(result.tree.rootId);
    setActiveId(null);
    setActiveName('');
    setSelected(null);
    setLegalTargets([]);
    setDirty(false);
    setShowImport(false);
    const msg = result.warnings.length
      ? `Imported with ${result.warnings.length} warning(s) — see console`
      : 'Imported successfully';
    showToast(msg);
    if (result.warnings.length) console.warn('PGN import warnings:', result.warnings);
  };

  const handleExport = () => {
    try {
      const text = window.PGN.serialize(tree, { headers: { ...tree.headers, Result: '*' } });
      navigator.clipboard.writeText(text).then(
        () => showToast('PGN copied to clipboard'),
        () => showToast('Export failed')
      );
    } catch (e) {
      showToast('Export failed');
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Cabinet</span>
          <span className="brand-sub">Opening Analysis Board</span>
        </div>
        <div className="topbar-right">
          <div className="engine-status">
            <div className={`engine-dot ${engineReady ? 'ready' : ''}`}></div>
            {engineReady ? 'engine on' : 'engine…'}
          </div>
          <button className="btn btn-ghost" onClick={handleImport}>Import PGN</button>
          <button className="btn btn-ghost" onClick={handleExport}>Export PGN</button>
          {drill.active ? (
            <button className="btn btn-ghost" onClick={endDrill}>End drill</button>
          ) : (
            <button className="btn btn-primary" onClick={() => startDrill(currentNodeId, 'w', 'any')}>
              Start Drill
            </button>
          )}
          <button className="btn btn-ghost" onClick={handleNew}>New line</button>
          <button className="btn btn-ghost" onClick={() => setFlipped(f => !f)}>Flip</button>
        </div>
      </header>

      <div className="main">
        <div className="board-col">
          <div className="position-meta">
            <div className="position-title">
              {activeName ? activeName : <span className="untitled">Untitled line</span>}
              {dirty && activeName ? <span style={{ color: 'var(--accent)', marginLeft: 8 }}>•</span> : null}
            </div>
            <div className="position-status">
              {mateOrStale ? (
                <span style={{ color: 'var(--accent)' }}>{mateOrStale}</span>
              ) : (
                <>
                  <span className={`turn-dot ${currentState.turn === 'w' ? 'white' : 'black'}`}></span>
                  <span>{turnLabel}</span>
                </>
              )}
              <span style={{ marginLeft: 14, color: 'var(--ink-3)' }}>
                {window.MoveTree.nodeCount(tree)} nodes / {window.MoveTree.mainlineDepth(tree)} plies
              </span>
            </div>
          </div>

          <div className="board-with-eval">
            <window.EvalBar evaluation={displayEval} />
            <window.ChessBoard
              state={currentState}
              selected={selected}
              legalTargets={legalTargets}
              lastMove={currentMove}
              onSquareClick={handleSquareClick}
              checkSquare={checkSquare}
              flipped={flipped}
              dragFrom={dragFrom}
              dragTargets={dragTargets}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              arrows={drill.active ? [] : arrows}
            />
          </div>

          <p className="footnote">
            {drill.active
              ? 'Drill mode — play from memory. Press ? for hint.'
              : 'Click or drag a piece. ←/→ to step, ↑/↓ for variations, F to flip.'}
          </p>
        </div>

        <aside className="panel">
          <div className="panel-section moves-section">
            {drill.active ? (
              <>
                <window.DrillStatusBar
                  phase={drill.phase}
                  successCount={drill.successCount}
                  totalNodes={drill.totalNodes}
                  misses={drill.misses}
                  side={drill.side}
                  strictness={drill.strictness}
                  onEnd={endDrill}
                />
                <window.DrillBanner
                  miss={drill.lastMiss}
                  onShowAnswer={showAnswer}
                />
              </>
            ) : (
              <>
                <div className="section-label">
                  <span>{isInVariation ? 'Variation' : 'Move Record'}</span>
                  <span className="count">{mainlinePlyCount} {mainlinePlyCount === 1 ? 'ply' : 'plies'}</span>
                </div>
                {isInVariation && (
                  <div className="variation-banner">
                    <span>Side line</span>
                    {mainlineNodeAtBranch && (
                      <button className="variation-banner-back" onClick={() => goToNode(mainlineNodeAtBranch)}>
                        ← Main line
                      </button>
                    )}
                  </div>
                )}
                <div className="moves-scroll">
                  <window.MoveList
                    tree={tree}
                    currentNodeId={currentNodeId}
                    onSelect={(nodeId) => goToNode(nodeId)}
                    onContextMenu={handleDrillContext}
                  />
                </div>
                <window.NavControls
                  atStart={atStart}
                  atEnd={atEnd}
                  onStart={() => goToNode(tree.rootId)}
                  onBack={() => goToNode(currentNode.parentId)}
                  onForward={() => goToNode(currentNode.childIds[0])}
                  onEnd={() => {
                    const ml = window.MoveTree.walkMainline(tree, currentNodeId);
                    goToNode(ml[ml.length - 1].id);
                  }}
                  onFlip={() => setFlipped(f => !f)}
                />
              </>
            )}
          </div>

          <div className="panel-section">
            <div className="section-label">
              <span>Saved Lines</span>
              <span className="count">{saves.length}</span>
            </div>
            <window.SavePanel
              saves={saves}
              activeId={activeId}
              onSave={handleSave}
              onLoad={handleLoad}
              onDelete={handleDelete}
              currentName={activeName}
            />
          </div>

          <ChapterPanel tree={tree} onSelectChapter={(nodeId) => goToNode(nodeId)} onDrillChapter={(nodeId) => startDrill(nodeId, 'w', 'any')} />
        </aside>
      </div>

      {pendingPromotion ? (
        <PromotionDialog
          white={currentState.turn === 'w'}
          onChoose={(piece) => {
            commitMove(pendingPromotion.from, pendingPromotion.to, piece);
            setPendingPromotion(null);
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      ) : null}

      {showImport ? (
        <div className="promotion-overlay" onClick={() => setShowImport(false)}>
          <div className="promotion-dialog" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <h3>Import PGN</h3>
            <textarea
              style={{ width: '100%', height: '200px', marginTop: 8, fontFamily: 'monospace', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--ink-4)', borderRadius: 4, padding: 8, resize: 'vertical' }}
              placeholder="Paste PGN here..."
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowImport(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={doImport}>Import</button>
            </div>
          </div>
        </div>
      ) : null}

      {drill.phase === 'COMPLETE' ? (
        <window.DrillSummary
          successCount={drill.successCount}
          totalNodes={drill.totalNodes}
          misses={drill.misses}
          onDrillMisses={drillMisses}
          onClose={closeDrill}
        />
      ) : null}

      {drillMenu ? (
        <div
          className="promotion-overlay"
          style={{ background: 'transparent' }}
          onClick={closeDrillMenu}
          onContextMenu={(e) => { e.preventDefault(); closeDrillMenu(); }}
        >
          <div
            style={{
              position: 'fixed',
              left: drillMenu.x,
              top: drillMenu.y,
              background: 'var(--surface)',
              border: '1px solid var(--ink-4)',
              borderRadius: 4,
              padding: '4px 0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: 180,
            }}
          >
            <button
              className="btn btn-ghost"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 13 }}
              onClick={() => { startDrill(drillMenu.nodeId, 'w', 'any'); closeDrillMenu(); }}
            >
              Drill from here (any book)
            </button>
            <button
              className="btn btn-ghost"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 13 }}
              onClick={() => { startDrill(drillMenu.nodeId, 'w', 'mainline'); closeDrillMenu(); }}
            >
              Drill from here (mainline only)
            </button>
            <div style={{ margin: '4px 0', borderTop: '1px solid var(--rule)' }} />
            {drillMenu.variationRoot && (
              <button
                className="btn btn-ghost"
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 13, color: 'var(--accent)' }}
                onClick={() => handleDeleteFrom(drillMenu.variationRoot)}
              >
                Delete variation
              </button>
            )}
            <button
              className="btn btn-ghost"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 13, color: 'var(--accent)' }}
              onClick={() => handleDeleteFrom(drillMenu.nodeId)}
            >
              Delete from here
            </button>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

const PROMOTION_GLYPHS = { q: '♛', r: '♜', b: '♝', n: '♞' };

function PromotionDialog({ white, onChoose, onCancel }) {
  return (
    <div className="promotion-overlay" onClick={onCancel}>
      <div className="promotion-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Promote pawn to…</h3>
        <div className="promotion-choices">
          {['q', 'r', 'b', 'n'].map(p => (
            <button
              key={p}
              className={`promo-choice piece ${white ? 'white' : 'black'}`}
              onClick={() => onChoose(p)}
            >
              {PROMOTION_GLYPHS[p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChapterPanel({ tree, onSelectChapter, onDrillChapter }) {
  const chapters = React.useMemo(() => {
    return window.MoveTree.chapterStats(tree);
  }, [tree]);

  if (chapters.length === 0) return null;

  return (
    <div className="panel-section">
      <div className="section-label">
        <span>Chapters</span>
        <span className="count">{chapters.length}</span>
      </div>
      <div className="saves-list">
        {chapters.map(ch => (
          <div
            key={ch.nodeId}
            className="save-item"
            onClick={() => onSelectChapter(ch.nodeId)}
          >
            <div style={{ flex: 1 }}>
              <div className="save-name">{ch.name}</div>
              <div className="save-meta">
                <span>{ch.total} nodes</span>
                <span>·</span>
                {ch.known > 0 ? <span style={{ color: '#3a8' }}>✓{ch.known} </span> : null}
                {ch.reviewing > 0 ? <span style={{ color: '#d4a017' }}>●{ch.reviewing} </span> : null}
                {ch.unseen > 0 ? <span style={{ color: 'var(--ink-3)' }}>{ch.unseen} unseen</span> : null}
              </div>
            </div>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); onDrillChapter(ch.nodeId); }}
            >
              Drill
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
