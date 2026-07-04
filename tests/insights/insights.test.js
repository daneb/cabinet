import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Features from '../../slices/game-review/features.js';
import Elo from '../../slices/game-review/elo.js';
import Insights from '../../slices/insights/insights.js';
globalThis.GameReviewFeatures = Features;
globalThis.GameReviewElo = Elo;

const { aggregate, eligibleRecords } = Insights;

// Build a synthetic reviewed record. `moveSpec` is an array of partial move
// entries for the user's side; opponent filler moves are interleaved.
function makeRecord({ side = 'w', result = '1-0', engineId = 'sf18-lite-single', moveSpec, openingKey = 'e4 e5', inInsights }) {
  const moves = [];
  let ply = 1;
  for (const spec of moveSpec) {
    const userMove = {
      ply, san: 'x', turn: side,
      lossCp: 20, winPctLoss: 0.5, class: 'good', accuracy: 95,
      phase: 'middlegame', situation: 'equal', piece: 'n', features: [], motifs: [],
      ...spec,
    };
    const oppMove = {
      ply: ply + 1, san: 'y', turn: side === 'w' ? 'b' : 'w',
      lossCp: 20, winPctLoss: 0.5, class: 'good', accuracy: 95,
      phase: 'middlegame', situation: 'equal', piece: 'n', features: [], motifs: [],
    };
    moves.push(side === 'w' ? userMove : oppMove, side === 'w' ? oppMove : userMove);
    ply += 2;
  }
  return {
    id: 'r' + Math.random(),
    name: 'test',
    headers: { Result: result },
    pgn: '',
    userSide: side,
    inInsights,
    review: {
      engineId,
      nodesPerPos: 600000,
      openingKey,
      moves,
      summary: {
        white: { accuracy: 90, counts: {}, moveCount: moves.length / 2 },
        black: { accuracy: 88, counts: {}, moveCount: moves.length / 2 },
      },
    },
  };
}

const quiet = (n, extra = {}) => Array.from({ length: n }, () => ({ ...extra }));

describe('eligibleRecords', () => {
  it('excludes unreviewed, mismatched-engine, no-side, and opted-out records', () => {
    const records = [
      makeRecord({ moveSpec: quiet(25) }),
      { id: 'x', review: null },
      makeRecord({ moveSpec: quiet(25), engineId: 'sf-legacy' }),
      { ...makeRecord({ moveSpec: quiet(25) }), userSide: null },
      makeRecord({ moveSpec: quiet(25), inInsights: false }),
    ];
    const { eligible, excluded } = eligibleRecords(records, 'sf18-lite-single');
    assert.equal(eligible.length, 1);
    assert.equal(excluded.notReviewed, 1);
    assert.equal(excluded.mismatchedEngine, 1);
    assert.equal(excluded.noSide, 1);
    assert.equal(excluded.optedOut, 1);
  });
});

describe('aggregate', () => {
  it('computes per-phase error rates from user moves only', () => {
    // 40 user moves: 30 quiet middlegame + 10 endgame of which 5 blunders.
    const rec = makeRecord({
      moveSpec: [
        ...quiet(30),
        ...quiet(5, { phase: 'endgame' }),
        ...quiet(5, { phase: 'endgame', class: 'blunder', lossCp: 400 }),
      ],
    });
    const agg = aggregate([rec], { engineId: 'sf18-lite-single' });
    assert.equal(agg.games, 1);
    assert.equal(agg.moves, 40);
    assert.equal(agg.byPhase.endgame.moves, 10);
    assert.equal(agg.byPhase.endgame.errors, 5);
    assert.equal(agg.byPhase.endgame.errorRate, 50);
    assert.equal(agg.byPhase.middlegame.errors, 0);
  });

  it('marks small cells lowSample and keeps them out of findings', () => {
    const rec = makeRecord({
      moveSpec: [
        ...quiet(35),
        // Only 5 endgame moves, all blunders — dramatic but tiny sample.
        ...quiet(5, { phase: 'endgame', class: 'blunder', lossCp: 500 }),
      ],
    });
    const agg = aggregate([rec], { engineId: 'sf18-lite-single' });
    assert.equal(agg.byPhase.endgame.lowSample, true);
    assert.ok(!agg.findings.some(f => f.includes('Endgame')));
  });

  it('surfaces a large-sample deviation as a finding', () => {
    const recs = Array.from({ length: 3 }, () => makeRecord({
      moveSpec: [
        ...quiet(20),
        ...quiet(8, { phase: 'endgame', class: 'blunder', lossCp: 400 }),
        ...quiet(4, { phase: 'endgame' }),
      ],
    }));
    const agg = aggregate(recs, { engineId: 'sf18-lite-single' });
    assert.equal(agg.byPhase.endgame.moves, 36);
    assert.ok(agg.findings.some(f => f.startsWith('Endgame')), JSON.stringify(agg.findings));
  });

  it('tracks conversion and defence per game', () => {
    const blown = makeRecord({
      result: '0-1',
      moveSpec: quiet(25, { situation: 'winning' }),
    });
    const held = makeRecord({
      result: '1/2-1/2',
      moveSpec: quiet(25, { situation: 'lost' }),
    });
    const agg = aggregate([blown, held], { engineId: 'sf18-lite-single' });
    assert.equal(agg.conversion.winningGames, 1);
    assert.equal(agg.conversion.converted, 0);
    assert.equal(agg.defence.lostGames, 1);
    assert.equal(agg.defence.saved, 1);
  });

  it('groups openings and computes score/accuracy per bucket', () => {
    const a1 = makeRecord({ moveSpec: quiet(25), openingKey: 'e4 e5', result: '1-0' });
    const a2 = makeRecord({ moveSpec: quiet(25), openingKey: 'e4 e5', result: '0-1' });
    const b = makeRecord({ moveSpec: quiet(25), openingKey: 'd4 d5', result: '1-0' });
    const agg = aggregate([a1, a2, b], { engineId: 'sf18-lite-single' });
    assert.equal(agg.openings.length, 2);
    const e4 = agg.openings.find(o => o.key === 'e4 e5');
    assert.equal(e4.games, 2);
    assert.equal(e4.scorePct, 50);
    assert.equal(e4.lowSample, true); // < 3 games
  });

  it('includes an aggregate Elo estimate', () => {
    const recs = [makeRecord({ moveSpec: quiet(25, { lossCp: 60 }) })];
    const agg = aggregate(recs, { engineId: 'sf18-lite-single' });
    assert.ok(agg.elo);
    assert.equal(agg.elo.games, 1);
    assert.ok(agg.elo.rating > 1000 && agg.elo.rating < 2700);
  });

  it('counts motifs across games', () => {
    const rec = makeRecord({
      moveSpec: [
        ...quiet(30),
        ...quiet(3, { class: 'blunder', lossCp: 350, motifs: ['hungPiece'] }),
      ],
    });
    const agg = aggregate([rec], { engineId: 'sf18-lite-single' });
    assert.equal(agg.motifs.hungPiece, 3);
    assert.ok(agg.findings.some(f => f.startsWith('Hung pieces')));
  });
});
