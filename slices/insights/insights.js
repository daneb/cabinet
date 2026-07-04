// Insights aggregation — pure functions, no React, no DOM.
//
// Aggregates reviewed library games into the player's error profile: where
// do mistakes cluster (phase, situation), do they convert winning positions,
// which openings leak. Everything is deterministic; the optional Ollama coach
// only verbalizes this output, it never analyzes positions.
//
// Sample-size honesty: cells with fewer than MIN_MOVES_PER_CELL user moves
// carry `lowSample: true` and are excluded from findings. Reviews produced by
// a different engine build (or a mixed bag of node budgets) are excluded
// rather than silently mixed, because eval scales differ between builds.

const MIN_MOVES_PER_CELL = 30;
const MIN_GAMES_PER_OPENING = 3;
const ERROR_CLASSES = ['mistake', 'blunder'];
const PHASES = ['opening', 'middlegame', 'endgame'];
const SITUATIONS = ['winning', 'better', 'equal', 'worse', 'lost'];
const MOTIF_KEYS = ['hungPiece', 'missedWin', 'missedMate', 'collapse'];

// Split records into those usable for insights and per-reason exclusion
// counts. Usable: reviewed on `engineId`, has a userSide, not opted out.
function eligibleRecords(records, engineId) {
  const eligible = [];
  const excluded = { notReviewed: 0, mismatchedEngine: 0, noSide: 0, optedOut: 0 };
  for (const r of records) {
    if (!r.review) { excluded.notReviewed++; continue; }
    if (engineId && r.review.engineId !== engineId) { excluded.mismatchedEngine++; continue; }
    if (r.userSide !== 'w' && r.userSide !== 'b') { excluded.noSide++; continue; }
    if (r.inInsights === false) { excluded.optedOut++; continue; }
    eligible.push(r);
  }
  return { eligible, excluded };
}

function blankCell() {
  return { moves: 0, errors: 0, lossCpSum: 0, errorRate: null, acpl: null, lowSample: true };
}

function finishCell(cell) {
  if (cell.moves > 0) {
    cell.errorRate = (cell.errors / cell.moves) * 100;
    cell.acpl = cell.lossCpSum / cell.moves;
  }
  cell.lowSample = cell.moves < MIN_MOVES_PER_CELL;
  delete cell.lossCpSum;
  return cell;
}

function aggregate(records, opts = {}) {
  const { eligible, excluded } = eligibleRecords(records, opts.engineId);

  const overall = blankCell();
  const byPhase = {};
  const bySituation = {};
  for (const p of PHASES) byPhase[p] = blankCell();
  for (const s of SITUATIONS) bySituation[s] = blankCell();
  const motifs = {};
  for (const k of MOTIF_KEYS) motifs[k] = 0;

  let winningGames = 0, converted = 0, lostGames = 0, saved = 0;
  const openingMap = new Map();
  const eloGames = [];

  for (const rec of eligible) {
    const side = rec.userSide;
    const moves = rec.review.moves;
    const own = moves.filter(m => m.turn === side);

    for (const m of own) {
      const isError = ERROR_CLASSES.includes(m.class);
      const bump = (cell) => {
        cell.moves++;
        if (isError) cell.errors++;
        if (m.lossCp != null) cell.lossCpSum += m.lossCp;
      };
      bump(overall);
      if (byPhase[m.phase]) bump(byPhase[m.phase]);
      if (bySituation[m.situation]) bump(bySituation[m.situation]);
      for (const motif of m.motifs || []) {
        if (motifs[motif] != null) motifs[motif]++;
      }
    }

    // Conversion / defence per game.
    const result = rec.headers && rec.headers.Result;
    const score = globalThis.GameReviewFeatures.sideScore(result, side);
    if (score != null) {
      const sawWinning = own.some(m => m.situation === 'winning');
      const sawLost = own.some(m => m.situation === 'lost');
      if (sawWinning) { winningGames++; if (score === 1) converted++; }
      if (sawLost) { lostGames++; if (score >= 0.5) saved++; }
    }

    // Opening buckets.
    const key = rec.review.openingKey || '';
    if (key) {
      if (!openingMap.has(key)) {
        openingMap.set(key, {
          key,
          label: (rec.headers && (rec.headers.Opening || rec.headers.ECO)) || key.split(' ').slice(0, 4).join(' '),
          games: 0, scoreSum: 0, scored: 0, accSum: 0, accCount: 0,
        });
      }
      const o = openingMap.get(key);
      o.games++;
      if (score != null) { o.scoreSum += score; o.scored++; }
      const acc = side === 'w' ? rec.review.summary.white.accuracy : rec.review.summary.black.accuracy;
      if (acc != null) { o.accSum += acc; o.accCount++; }
    }

    eloGames.push({ moves, side });
  }

  finishCell(overall);
  for (const p of PHASES) finishCell(byPhase[p]);
  for (const s of SITUATIONS) finishCell(bySituation[s]);

  const openings = [...openingMap.values()]
    .map(o => ({
      key: o.key,
      label: o.label,
      games: o.games,
      scorePct: o.scored > 0 ? (o.scoreSum / o.scored) * 100 : null,
      avgAccuracy: o.accCount > 0 ? o.accSum / o.accCount : null,
      lowSample: o.games < MIN_GAMES_PER_OPENING,
    }))
    .sort((a, b) => b.games - a.games);

  const result = {
    games: eligible.length,
    moves: overall.moves,
    excluded,
    overall,
    byPhase,
    bySituation,
    motifs,
    conversion: {
      winningGames,
      converted,
      pct: winningGames > 0 ? (converted / winningGames) * 100 : null,
    },
    defence: {
      lostGames,
      saved,
      pct: lostGames > 0 ? (saved / lostGames) * 100 : null,
    },
    openings,
    elo: globalThis.GameReviewElo.estimateAggregate(eloGames),
  };
  result.findings = buildFindings(result);
  return result;
}

// Deterministic "top findings": cells whose error rate deviates most from the
// player's own overall baseline, min sample enforced. Returned worst-first.
function buildFindings(agg) {
  if (agg.overall.moves < MIN_MOVES_PER_CELL || agg.overall.errorRate == null) return [];
  const base = agg.overall.errorRate;
  const findings = [];

  const consider = (label, cell) => {
    if (cell.lowSample || cell.errorRate == null) return;
    const delta = cell.errorRate - base;
    // Meaningful: at least +2 errors per 100 moves and 1.5x the baseline.
    if (delta >= 2 && cell.errorRate >= base * 1.5) {
      findings.push({
        text: `${label}: ${cell.errorRate.toFixed(1)} errors/100 moves vs ${base.toFixed(1)} overall (${cell.moves} moves)`,
        delta,
      });
    }
  };

  consider('Opening play', agg.byPhase.opening);
  consider('Middlegame', agg.byPhase.middlegame);
  consider('Endgame', agg.byPhase.endgame);
  consider('When winning', agg.bySituation.winning);
  consider('When better', agg.bySituation.better);
  consider('In equal positions', agg.bySituation.equal);
  consider('When worse', agg.bySituation.worse);
  consider('When lost', agg.bySituation.lost);

  if (agg.conversion.winningGames >= 5 && agg.conversion.pct != null && agg.conversion.pct < 60) {
    findings.push({
      text: `Conversion: won only ${agg.conversion.converted} of ${agg.conversion.winningGames} games where you reached a winning position`,
      delta: 60 - agg.conversion.pct,
    });
  }
  if (agg.motifs.hungPiece >= 3) {
    findings.push({
      text: `Hung pieces: ${agg.motifs.hungPiece} moves left a piece to be captured outright`,
      delta: agg.motifs.hungPiece,
    });
  }

  return findings.sort((a, b) => b.delta - a.delta).slice(0, 3).map(f => f.text);
}

const Insights = {
  MIN_MOVES_PER_CELL,
  MIN_GAMES_PER_OPENING,
  eligibleRecords,
  aggregate,
};

if (typeof window !== 'undefined') window.Insights = Insights;
export default Insights;
