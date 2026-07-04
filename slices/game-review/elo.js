// Elo band estimate from average centipawn loss — pure functions, no React.
//
// This is an ENGINE-CONSISTENCY estimate, not a rating. A single game says
// very little (±300 is honest); averaging over many games narrows the band,
// but systematic error (time control, opposition, eval scale) never goes
// away, so the band is floored at ±150 no matter how many games are fed in.
// Callers must always display the band and the game count, never a bare
// point estimate.
//
// The ACPL→rating table is in the style of published fits on Lichess data:
// monotone, anchored at plausible ACPL levels for each rating band.

const ACPL_RATING_TABLE = [
  [10, 2700],
  [25, 2350],
  [40, 2000],
  [60, 1700],
  [80, 1450],
  [100, 1250],
  [130, 1000],
];

const PER_GAME_BAND = 300;
const BAND_FLOOR = 150;
const MIN_MOVES_PER_GAME = 20;

// Monotone piecewise-linear interpolation over the table; clamped at ends.
function acplToRating(acpl) {
  if (acpl == null || Number.isNaN(acpl)) return null;
  const t = ACPL_RATING_TABLE;
  if (acpl <= t[0][0]) return t[0][1];
  if (acpl >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 1; i < t.length; i++) {
    if (acpl <= t[i][0]) {
      const [x0, y0] = t[i - 1];
      const [x1, y1] = t[i];
      return Math.round(y0 + (y1 - y0) * ((acpl - x0) / (x1 - x0)));
    }
  }
  return t[t.length - 1][1];
}

// Mean loss in cp for one side's moves of one reviewed game.
// `moves` are review move entries ({ turn, lossCp }); lossCp is already
// mate-clamped by classify.js at review time.
function gameAcpl(moves, side) {
  const own = moves.filter(m => m.turn === side && m.lossCp != null);
  if (own.length === 0) return null;
  return own.reduce((a, m) => a + m.lossCp, 0) / own.length;
}

// Per-game estimate for one side: { rating, band, acpl, moveCount } or null
// if the side has too few scored moves for even a rough read.
function estimateGame(moves, side) {
  const own = moves.filter(m => m.turn === side && m.lossCp != null);
  if (own.length < MIN_MOVES_PER_GAME) return null;
  const acpl = own.reduce((a, m) => a + m.lossCp, 0) / own.length;
  return { rating: acplToRating(acpl), band: PER_GAME_BAND, acpl, moveCount: own.length };
}

// Aggregate estimate over many reviewed games for one player.
// `games` is an array of { moves, side } — each game's review moves plus the
// side that player held in that game. Games with too few moves are excluded.
// Returns { rating, band, games, acpl } or null if nothing qualifies.
function estimateAggregate(games) {
  const perGame = [];
  for (const g of games) {
    const est = estimateGame(g.moves, g.side);
    if (est) perGame.push(est);
  }
  if (perGame.length === 0) return null;
  const totalMoves = perGame.reduce((a, e) => a + e.moveCount, 0);
  // Move-weighted mean ACPL so long games count for more than short ones.
  const acpl = perGame.reduce((a, e) => a + e.acpl * e.moveCount, 0) / totalMoves;
  const band = Math.max(BAND_FLOOR, Math.round(PER_GAME_BAND / Math.sqrt(perGame.length)));
  return { rating: acplToRating(acpl), band, games: perGame.length, acpl };
}

function formatEstimate(est) {
  if (!est) return null;
  return `${est.rating} ± ${est.band} (${est.games} game${est.games === 1 ? '' : 's'})`;
}

const GameReviewElo = {
  ACPL_RATING_TABLE,
  MIN_MOVES_PER_GAME,
  acplToRating,
  gameAcpl,
  estimateGame,
  estimateAggregate,
  formatEstimate,
};

if (typeof window !== 'undefined') window.GameReviewElo = GameReviewElo;
export default GameReviewElo;
