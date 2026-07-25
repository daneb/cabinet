// LibraryPanel — game library UI: import multi-game PGNs, tag which side the
// user played, run batch reviews, open a game on the board.
// Mirrors the structure of the Saved Lines / Game Review panel sections.

const { useState, useRef, useCallback, useMemo } = React;

function sideLabel(side) {
  return side === 'w' ? 'W' : side === 'b' ? 'B' : '–';
}

function nextSide(side) {
  return side === 'w' ? 'b' : side === 'b' ? null : 'w';
}

function recordAccuracy(rec) {
  if (!rec.review) return null;
  const s = rec.review.summary;
  if (rec.userSide === 'w') return s.white.accuracy;
  if (rec.userSide === 'b') return s.black.accuracy;
  return null;
}

function LibraryPanel({
  library, setLibrary, settings, setSettings,
  reviewWorker, batchReview, currentTree, onOpenGame, showToast,
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [namesDraft, setNamesDraft] = useState(settings.playerNames.join(', '));
  const fileInputRef = useRef(null);
  const { batch, runBatch, cancelBatch } = batchReview;
  const { ready, engineId, status, progress } = reviewWorker;
  const isRunning = status !== 'idle';

  const tier = settings.defaultQuality || window.ReviewBudgets.DEFAULT_TIER;
  const tierNodes = window.ReviewBudgets.QUALITY_TIERS[tier].nodes;

  const unreviewedCount = useMemo(
    () => library.filter(r => !r.review || r.review.engineId !== engineId || r.review.nodesPerPos !== tierNodes).length,
    [library, engineId, tierNodes]
  );

  const commitPlayerNames = useCallback(() => {
    const names = namesDraft.split(',').map(s => s.trim()).filter(Boolean);
    setSettings(s => ({ ...s, playerNames: names }));
    // Re-infer sides for records that were never manually resolved.
    setLibrary(lib => lib.map(r => (
      r.userSide == null
        ? { ...r, userSide: window.GameLibrary.inferUserSide(r.headers, names) }
        : r
    )));
  }, [namesDraft, setSettings, setLibrary]);

  const importText = useCallback((text) => {
    const chunks = window.PGN.splitGames(text);
    if (chunks.length === 0) {
      showToast('No games found in PGN');
      return;
    }
    const names = settings.playerNames;
    const records = [];
    let warned = 0;
    for (const chunk of chunks) {
      const parsed = window.PGN.parse(chunk, { allowIllegal: true });
      if (parsed.warnings.length) warned++;
      records.push(window.GameLibrary.makeRecord({
        headers: parsed.headers,
        pgn: chunk,
        userSide: window.GameLibrary.inferUserSide(parsed.headers, names),
      }));
    }
    setLibrary(lib => [...lib, ...records]);
    showToast(`Imported ${records.length} game(s)` + (warned ? ` — ${warned} with warnings` : ''));
  }, [settings.playerNames, setLibrary, showToast]);

  const handleFiles = useCallback((e) => {
    const files = [...e.target.files];
    if (files.length === 0) return;
    Promise.all(files.map(f => f.text())).then(texts => importText(texts.join('\n\n')));
    e.target.value = '';
  }, [importText]);

  const handlePasteImport = useCallback(() => {
    if (pasteText.trim()) importText(pasteText);
    setPasteText('');
    setShowPaste(false);
  }, [pasteText, importText]);

  const handleAddCurrent = useCallback(() => {
    try {
      const pgn = window.PGN.serialize(currentTree);
      const headers = currentTree.headers || {};
      setLibrary(lib => [...lib, window.GameLibrary.makeRecord({
        name: headers.White ? undefined : 'Board game ' + new Date().toLocaleDateString(),
        headers,
        pgn,
        userSide: window.GameLibrary.inferUserSide(headers, settings.playerNames),
      })]);
      showToast('Added current game to library');
    } catch {
      showToast('Could not add current game');
    }
  }, [currentTree, settings.playerNames, setLibrary, showToast]);

  const handleOpen = useCallback((rec) => {
    const parsed = window.PGN.parse(rec.pgn, { allowIllegal: true });
    if (!parsed.tree) { showToast('Could not open game'); return; }
    onOpenGame(parsed.tree, rec.name);
  }, [onOpenGame, showToast]);

  const handleDelete = useCallback((rec) => {
    if (!confirm(`Delete "${rec.name}" from the library?`)) return;
    setLibrary(lib => lib.filter(r => r.id !== rec.id));
  }, [setLibrary]);

  const toggleSide = useCallback((rec) => {
    setLibrary(lib => lib.map(r => (r.id === rec.id ? { ...r, userSide: nextSide(r.userSide) } : r)));
  }, [setLibrary]);

  const toggleInsights = useCallback((rec) => {
    setLibrary(lib => lib.map(r => (r.id === rec.id ? { ...r, inInsights: r.inInsights === false } : r)));
  }, [setLibrary]);

  const handleBatch = useCallback(() => {
    runBatch(library, { nodes: tierNodes }).then(({ reviewed, skipped }) => {
      if (reviewed > 0) showToast(`Reviewed ${reviewed} game(s)`);
      else if (skipped > 0) showToast('All games already reviewed at this quality');
    });
  }, [runBatch, library, tierNodes, showToast]);

  const mainlinePlies = useMemo(() => {
    try { return window.MoveTree.walkMainline(currentTree, currentTree.rootId).length - 1; }
    catch { return 0; }
  }, [currentTree]);

  return (
    <div className="library">
      <div className="rail-label">
        <span>Game Library</span>
        {library.length > 0 ? <span className="count">{library.length}</span> : null}
      </div>

      <div className="lib-settings">
          <input
            type="text"
            placeholder="Your name(s), comma-separated"
            value={namesDraft}
            onChange={e => setNamesDraft(e.target.value)}
            onBlur={commitPlayerNames}
            title="Used to auto-detect which side you played in imported games"
          />
        </div>

        <div className="lib-controls">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pgn,.txt"
            multiple
            style={{ display: 'none' }}
            onChange={handleFiles}
          />
          <button className="btn btn-ghost" onClick={() => fileInputRef.current.click()}>
            Import PGN file
          </button>
          <button className="btn btn-ghost" onClick={() => setShowPaste(v => !v)}>
            Paste PGN
          </button>
          <button
            className="btn btn-ghost"
            onClick={handleAddCurrent}
            disabled={mainlinePlies === 0}
            title={mainlinePlies === 0 ? 'Play or load some moves first' : ''}
          >
            Add current
          </button>
        </div>

        {showPaste ? (
          <div className="lib-paste">
            <textarea
              rows={5}
              placeholder="Paste one or more PGN games…"
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handlePasteImport}>Import</button>
          </div>
        ) : null}

        {batch ? (
          <div className="gr-progress">
            <div className="gr-progress-text">
              Game {batch.gameIndex}/{batch.gameCount} · move {progress.current}/{progress.total}
            </div>
            <div className="gr-progress-bar">
              <div
                className="gr-progress-fill"
                style={{ width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%' }}
              />
            </div>
            <button className="btn btn-ghost" onClick={cancelBatch}>Cancel batch</button>
          </div>
        ) : library.length > 0 ? (
          <div className="lib-controls">
            <select
              value={tier}
              onChange={e => setSettings(s => ({ ...s, defaultQuality: e.target.value }))}
              disabled={isRunning}
              title={window.ReviewBudgets.QUALITY_TIERS[tier].hint}
            >
              {Object.entries(window.ReviewBudgets.QUALITY_TIERS).map(([key, t]) => (
                <option key={key} value={key}>{t.label}</option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              onClick={handleBatch}
              disabled={!ready || isRunning || unreviewedCount === 0}
              title={unreviewedCount === 0 ? 'All games reviewed at this quality' : ''}
            >
              Review {unreviewedCount} game(s)
            </button>
          </div>
        ) : null}

        {library.length === 0 ? (
          <div className="gr-empty">
            Import PGN files of your games, then batch-review them to unlock Insights.
          </div>
        ) : (
          <div className="saves-list lib-list">
            {library.map(rec => {
              const acc = recordAccuracy(rec);
              return (
                <div key={rec.id} className="save-item">
                  <input
                    type="checkbox"
                    checked={rec.inInsights !== false}
                    onChange={() => toggleInsights(rec)}
                    title="Include in Insights"
                    disabled={!rec.review}
                  />
                  <div className="save-main" onClick={() => handleOpen(rec)} style={{ cursor: 'pointer' }}>
                    <div className="save-name">{rec.name}</div>
                    <div className="save-meta">
                      {rec.review
                        ? (acc != null ? `${acc.toFixed(1)}% acc` : 'reviewed')
                        : 'not reviewed'}
                      {rec.headers.Result && rec.headers.Result !== '*' ? ` · ${rec.headers.Result}` : ''}
                    </div>
                  </div>
                  <div className="save-actions">
                    <button
                      className="btn-danger-ghost lib-side-btn"
                      onClick={() => toggleSide(rec)}
                      title="Which side did you play? W / B / unknown"
                    >
                      {sideLabel(rec.userSide)}
                    </button>
                    <button className="btn-danger-ghost" onClick={() => handleDelete(rec)}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
  );
}

if (typeof window !== 'undefined') window.LibraryPanel = LibraryPanel;
export default LibraryPanel;
