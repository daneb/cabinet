// InsightsPanel — cross-game error patterns for the user's side, aggregated
// from reviewed library games. Deterministic stats first; optional Ollama
// coach notes verbalize them (and are hidden when Ollama isn't running).

const { useState, useEffect, useMemo, useCallback } = React;

function fmt(x, digits = 1) {
  return x == null ? '–' : x.toFixed(digits);
}

function CellRow({ label, cell }) {
  return (
    <div className={`gr-row${cell.lowSample ? ' ins-low' : ''}`}>
      <div className="gr-label">{label}</div>
      <div className="gr-cell">{cell.moves > 0 ? fmt(cell.errorRate) : '–'}</div>
      <div className="gr-cell">{cell.moves > 0 ? fmt(cell.acpl, 0) : '–'}</div>
      <div className="gr-cell ins-n">{cell.moves}</div>
    </div>
  );
}

function InsightsPanel({ library, settings, reviewWorker }) {
  const [coach, setCoach] = useState({ available: false, models: [], notes: null, busy: false, error: null });
  const engineId = reviewWorker.engineId;

  const agg = useMemo(() => {
    if (!engineId) return null;
    return window.Insights.aggregate(library, { engineId });
  }, [library, engineId]);

  useEffect(() => {
    let cancelled = false;
    window.InsightsCoach.probeOllama(settings.ollama.url).then(({ available, models }) => {
      if (!cancelled) setCoach(c => ({ ...c, available: available && models.length > 0, models }));
    });
    return () => { cancelled = true; };
  }, [settings.ollama.url]);

  const handleCoach = useCallback(() => {
    // Prefer the configured model, but fall back to whatever is installed.
    const model = coach.models.includes(settings.ollama.model)
      ? settings.ollama.model
      : coach.models[0];
    setCoach(c => ({ ...c, busy: true, error: null }));
    window.InsightsCoach.generateCoachNotes(agg, { url: settings.ollama.url, model })
      .then(notes => setCoach(c => ({ ...c, notes, busy: false })))
      .catch(err => setCoach(c => ({
        ...c,
        busy: false,
        error: `Coach notes failed (${err.message}). If Ollama is running, try: OLLAMA_ORIGINS="http://localhost:*" ollama serve`,
      })));
  }, [agg, settings.ollama, coach.models]);

  const excludedNote = useMemo(() => {
    if (!agg) return null;
    const parts = [];
    if (agg.excluded.notReviewed) parts.push(`${agg.excluded.notReviewed} not reviewed`);
    if (agg.excluded.mismatchedEngine) parts.push(`${agg.excluded.mismatchedEngine} from an older engine (re-review to include)`);
    if (agg.excluded.noSide) parts.push(`${agg.excluded.noSide} without your side set`);
    if (agg.excluded.optedOut) parts.push(`${agg.excluded.optedOut} unchecked`);
    return parts.length ? `Excluded: ${parts.join(', ')}.` : null;
  }, [agg]);

  if (!agg || agg.games === 0) {
    return (
      <div className="insights">
        <div className="rail-label"><span>Insights</span></div>
        <div className="gr-empty">
          Review library games (with your side set) to see cross-game patterns.
          {excludedNote ? <div className="ins-excluded">{excludedNote}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="insights">
      <div className="rail-label">
        <span>Insights</span>
        <span className="count">{agg.games} games · {agg.moves} moves</span>
      </div>

        {agg.elo ? (
          <div className="ins-elo" title="Derived from average centipawn loss; depends on time control and opposition. Not an official rating.">
            Estimated playing strength: <strong>{agg.elo.rating} ± {agg.elo.band}</strong> ({agg.elo.games} games)
            <span className="ins-elo-note"> — engine-consistency estimate, not a rating</span>
          </div>
        ) : null}

        {agg.findings.length > 0 ? (
          <div className="ins-findings">
            {agg.findings.map((f, i) => <div key={i} className="ins-finding">• {f}</div>)}
          </div>
        ) : (
          <div className="ins-finding ins-low">No strong patterns yet — more games sharpen the picture.</div>
        )}

        <div className="gr-table">
          <div className="gr-row gr-row-head">
            <div className="gr-label">By phase</div>
            <div className="gr-cell">err/100</div>
            <div className="gr-cell">acpl</div>
            <div className="gr-cell ins-n">n</div>
          </div>
          <CellRow label="Opening" cell={agg.byPhase.opening} />
          <CellRow label="Middlegame" cell={agg.byPhase.middlegame} />
          <CellRow label="Endgame" cell={agg.byPhase.endgame} />
        </div>

        <div className="gr-table">
          <div className="gr-row gr-row-head">
            <div className="gr-label">By situation</div>
            <div className="gr-cell">err/100</div>
            <div className="gr-cell">acpl</div>
            <div className="gr-cell ins-n">n</div>
          </div>
          <CellRow label="Winning" cell={agg.bySituation.winning} />
          <CellRow label="Better" cell={agg.bySituation.better} />
          <CellRow label="Equal" cell={agg.bySituation.equal} />
          <CellRow label="Worse" cell={agg.bySituation.worse} />
          <CellRow label="Lost" cell={agg.bySituation.lost} />
        </div>

        <div className="ins-lines">
          {agg.conversion.winningGames > 0 ? (
            <div>Converted {agg.conversion.converted}/{agg.conversion.winningGames} winning positions ({fmt(agg.conversion.pct, 0)}%)</div>
          ) : null}
          {agg.defence.lostGames > 0 ? (
            <div>Saved {agg.defence.saved}/{agg.defence.lostGames} lost positions ({fmt(agg.defence.pct, 0)}%)</div>
          ) : null}
          {agg.motifs.hungPiece > 0 ? <div>Hung pieces: {agg.motifs.hungPiece}</div> : null}
          {agg.motifs.missedWin > 0 ? <div>Missed wins: {agg.motifs.missedWin}</div> : null}
          {agg.motifs.missedMate > 0 ? <div>Missed mates: {agg.motifs.missedMate}</div> : null}
        </div>

        {agg.openings.length > 0 ? (
          <div className="gr-table">
            <div className="gr-row gr-row-head">
              <div className="gr-label">Openings</div>
              <div className="gr-cell">games</div>
              <div className="gr-cell">score</div>
              <div className="gr-cell">acc</div>
            </div>
            {agg.openings.slice(0, 5).map(o => (
              <div key={o.key} className={`gr-row${o.lowSample ? ' ins-low' : ''}`} title={o.key}>
                <div className="gr-label ins-opening">{o.label}</div>
                <div className="gr-cell">{o.games}</div>
                <div className="gr-cell">{o.scorePct != null ? fmt(o.scorePct, 0) + '%' : '–'}</div>
                <div className="gr-cell">{o.avgAccuracy != null ? fmt(o.avgAccuracy, 0) : '–'}</div>
              </div>
            ))}
          </div>
        ) : null}

        {excludedNote ? <div className="ins-excluded">{excludedNote}</div> : null}

        {coach.available ? (
          <div className="ins-coach">
            <button className="btn btn-ghost" onClick={handleCoach} disabled={coach.busy}>
              {coach.busy ? 'Thinking…' : coach.notes ? 'Regenerate coach notes' : 'Coach notes (Ollama)'}
            </button>
            {coach.error ? <div className="gr-error">{coach.error}</div> : null}
            {coach.notes ? <div className="ins-notes">{coach.notes}</div> : null}
          </div>
        ) : null}
    </div>
  );
}

if (typeof window !== 'undefined') window.InsightsPanel = InsightsPanel;
export default InsightsPanel;
