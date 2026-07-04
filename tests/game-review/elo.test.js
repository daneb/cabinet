import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Elo from '../../slices/game-review/elo.js';

const { acplToRating, estimateGame, estimateAggregate, formatEstimate } = Elo;

function movesWithLoss(side, lossCp, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ turn: side, lossCp });
    out.push({ turn: side === 'w' ? 'b' : 'w', lossCp: 30 });
  }
  return out;
}

describe('acplToRating', () => {
  it('is monotone decreasing over the table', () => {
    let prev = Infinity;
    for (const acpl of [5, 10, 25, 40, 60, 80, 100, 130, 200]) {
      const r = acplToRating(acpl);
      assert.ok(r <= prev, `rating should not rise as ACPL grows (acpl=${acpl})`);
      prev = r;
    }
  });

  it('clamps at both ends', () => {
    assert.equal(acplToRating(1), 2700);
    assert.equal(acplToRating(500), 1000);
  });

  it('interpolates between anchors', () => {
    const mid = acplToRating(50); // between 40→2000 and 60→1700
    assert.ok(mid < 2000 && mid > 1700);
    assert.equal(acplToRating(null), null);
  });
});

describe('estimateGame', () => {
  it('returns null with fewer than 20 scored moves', () => {
    assert.equal(estimateGame(movesWithLoss('w', 40, 10), 'w'), null);
  });

  it('estimates from the side\'s own moves only', () => {
    const est = estimateGame(movesWithLoss('w', 60, 25), 'w');
    assert.ok(est);
    assert.equal(est.acpl, 60);
    assert.equal(est.rating, 1700);
    assert.equal(est.band, 300);
  });
});

describe('estimateAggregate', () => {
  it('narrows the band with more games but floors at 150', () => {
    const game = { moves: movesWithLoss('w', 60, 25), side: 'w' };
    const one = estimateAggregate([game]);
    const four = estimateAggregate([game, game, game, game]);
    const nine = estimateAggregate(Array(9).fill(game));
    assert.equal(one.band, 300);
    assert.equal(four.band, 150); // 300/√4
    assert.equal(nine.band, 150); // floored, not 100
  });

  it('excludes games with too few moves', () => {
    const short = { moves: movesWithLoss('w', 10, 5), side: 'w' };
    const ok = { moves: movesWithLoss('w', 80, 25), side: 'w' };
    const est = estimateAggregate([short, ok]);
    assert.equal(est.games, 1);
    assert.equal(est.rating, 1450);
  });

  it('returns null when nothing qualifies', () => {
    assert.equal(estimateAggregate([{ moves: [], side: 'w' }]), null);
  });

  it('formats with band and game count', () => {
    const est = estimateAggregate([{ moves: movesWithLoss('b', 60, 25), side: 'b' }]);
    assert.equal(formatEstimate(est), '1700 ± 300 (1 game)');
  });
});
