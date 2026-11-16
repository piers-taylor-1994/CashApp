import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DENOMINATIONS,
  denominationById,
  formatPence,
  nextWholePound,
  changeFor,
  countUpSteps,
  minimalPieces,
  checkPick,
  checkIdentify,
  pieceSum,
  randomIdentifyTarget,
  identifyChoices,
  randomChangeScenario,
  randomPickScenario,
  changeDistractors,
  shuffle,
} from '../js/money.js';

/** Deterministic rng (mulberry32) returning values in [0, 1). */
function seededRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Brute-force minimum number of pieces for every amount up to max (dynamic programming). */
function bruteMinCounts(max) {
  const values = DENOMINATIONS.map((d) => d.pence);
  const best = new Array(max + 1).fill(Infinity);
  best[0] = 0;
  for (let amount = 1; amount <= max; amount++) {
    for (const v of values) {
      if (v <= amount && best[amount - v] + 1 < best[amount]) best[amount] = best[amount - v] + 1;
    }
  }
  return best;
}

describe('DENOMINATIONS', () => {
  test('exactly the UK coins and notes in use, sorted ascending', () => {
    const expected = [
      ['1p', 1, 'coin'],
      ['2p', 2, 'coin'],
      ['5p', 5, 'coin'],
      ['10p', 10, 'coin'],
      ['20p', 20, 'coin'],
      ['50p', 50, 'coin'],
      ['£1', 100, 'coin'],
      ['£2', 200, 'coin'],
      ['£5', 500, 'note'],
      ['£10', 1000, 'note'],
      ['£20', 2000, 'note'],
      ['£50', 5000, 'note'],
    ];
    assert.deepEqual(
      DENOMINATIONS.map((d) => [d.id, d.pence, d.kind]),
      expected,
    );
    for (const d of DENOMINATIONS) {
      assert.equal(typeof d.name, 'string');
      assert.ok(d.name.length > 0);
    }
    const pence = DENOMINATIONS.map((d) => d.pence);
    assert.deepEqual(pence, [...pence].sort((a, b) => a - b));
  });

  test('denominationById finds entries and returns undefined for unknown ids', () => {
    assert.equal(denominationById('£20').pence, 2000);
    assert.equal(denominationById('£3'), undefined);
  });
});

describe('formatPence', () => {
  test('formats pence under £1 as "Np"', () => {
    assert.equal(formatPence(0), '0p');
    assert.equal(formatPence(1), '1p');
    assert.equal(formatPence(5), '5p');
    assert.equal(formatPence(99), '99p');
  });

  test('formats pounds', () => {
    assert.equal(formatPence(100), '£1');
    assert.equal(formatPence(200), '£2');
    assert.equal(formatPence(2000), '£20');
    assert.equal(formatPence(5000), '£50');
  });

  test('formats pounds and pence with two digits', () => {
    assert.equal(formatPence(430), '£4.30');
    assert.equal(formatPence(105), '£1.05');
    assert.equal(formatPence(1001), '£10.01');
  });

  test('rejects non-integer or negative input', () => {
    assert.throws(() => formatPence(-1), RangeError);
    assert.throws(() => formatPence(1.5), RangeError);
    assert.throws(() => formatPence('5'), RangeError);
  });
});

describe('nextWholePound', () => {
  test('is always strictly above the amount', () => {
    assert.equal(nextWholePound(430), 500);
    assert.equal(nextWholePound(400), 500);
    assert.equal(nextWholePound(0), 100);
    assert.equal(nextWholePound(99), 100);
  });
});

describe('changeFor', () => {
  test('exact payment gives zero change and no pieces', () => {
    assert.deepEqual(changeFor(430, 430), { changePence: 0, pieces: [] });
  });

  test('£4.30 paid with £10 gives £5.70 in ascending pieces 20p, 50p, £5', () => {
    assert.deepEqual(changeFor(430, 1000), {
      changePence: 570,
      pieces: ['20p', '50p', '£5'],
    });
  });

  test('pence-only change', () => {
    assert.deepEqual(changeFor(137, 200), {
      changePence: 63,
      pieces: ['1p', '2p', '10p', '50p'],
    });
  });

  test('large change is correct and ascending', () => {
    const { changePence, pieces } = changeFor(1, 5000);
    assert.equal(changePence, 4999);
    assert.equal(pieceSum(pieces), 4999);
    const pence = pieces.map((id) => denominationById(id).pence);
    assert.deepEqual(pence, [...pence].sort((a, b) => a - b));
    assert.equal(pieces.filter((id) => id === '£50').length, 0);
    assert.equal(pieces.filter((id) => id === '£20').length, 2);
  });

  test('9900 pence of change: one £50, then £20s, a £5 and smaller pieces', () => {
    const { changePence, pieces } = changeFor(100, 10000);
    assert.equal(changePence, 9900);
    assert.equal(pieceSum(pieces), 9900);
    assert.equal(pieces.filter((id) => id === '£50').length, 1);
    assert.equal(pieces.filter((id) => id === '£20').length, 2);
    assert.ok(pieces.includes('£5'));
  });

  test('throws RangeError when paid is less than the price', () => {
    assert.throws(() => changeFor(1000, 500), RangeError);
    assert.throws(() => changeFor(1, 0), RangeError);
  });

  test('throws RangeError for non-integer or negative inputs', () => {
    assert.throws(() => changeFor(-1, 5), RangeError);
    assert.throws(() => changeFor(1.5, 5), RangeError);
    assert.throws(() => changeFor(5, -5), RangeError);
    assert.throws(() => changeFor(5, 5.5), RangeError);
    assert.throws(() => changeFor(NaN, 5), RangeError);
  });
});

describe('countUpSteps', () => {
  test('£4.30 to £10 counts up 4.50, 5.00, 10.00', () => {
    const steps = countUpSteps(430, 1000);
    assert.deepEqual(
      steps.map((s) => [s.pieceId, s.pence, s.runningTotalPence]),
      [
        ['20p', 20, 450],
        ['50p', 50, 500],
        ['£5', 500, 1000],
      ],
    );
  });

  test('exact payment has no steps', () => {
    assert.deepEqual(countUpSteps(430, 430), []);
  });

  test('final running total always equals paidPence and totals are strictly increasing', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 2000; i++) {
      const price = Math.floor(rng() * 20000);
      const paid = price + Math.floor(rng() * 10000);
      const steps = countUpSteps(price, paid);
      if (steps.length === 0) {
        assert.equal(paid, price);
        continue;
      }
      assert.equal(steps[steps.length - 1].runningTotalPence, paid, `price ${price} paid ${paid}`);
      let prev = price;
      for (const s of steps) {
        assert.ok(s.runningTotalPence > prev, 'running total must strictly increase');
        assert.equal(s.runningTotalPence - prev, s.pence);
        prev = s.runningTotalPence;
      }
    }
  });

  test('throws RangeError when paid < price', () => {
    assert.throws(() => countUpSteps(1000, 999), RangeError);
  });
});

describe('minimalPieces', () => {
  test('0 has no pieces', () => {
    assert.deepEqual(minimalPieces(0), []);
  });

  test('£3.47 uses £2, £1, 20p, 20p, 5p, 2p (ascending)', () => {
    assert.deepEqual(minimalPieces(347), ['2p', '5p', '20p', '20p', '£1', '£2']);
  });

  test('pieces always sum to the target', () => {
    for (let t = 0; t <= 3000; t++) {
      assert.equal(pieceSum(minimalPieces(t)), t);
    }
  });

  test('greedy count is the true minimum for every amount up to £30 (dynamic programming check)', () => {
    const best = bruteMinCounts(3000);
    for (let t = 0; t <= 3000; t++) {
      assert.equal(minimalPieces(t).length, best[t], `amount ${t}p`);
    }
  });

  test('throws RangeError for invalid input', () => {
    assert.throws(() => minimalPieces(-5), RangeError);
    assert.throws(() => minimalPieces(2.5), RangeError);
  });
});

describe('checkPick', () => {
  test('accepts an exact selection with the fewest pieces, in any order', () => {
    assert.equal(checkPick(['2p', '5p', '20p', '20p', '£1', '£2'], 347), true);
    assert.equal(checkPick(['£2', '£1', '20p', '5p', '20p', '2p'], 347), true);
    assert.equal(checkPick(['20p', '20p'], 40), true);
  });

  test('rejects an exact selection that is not the fewest pieces', () => {
    assert.equal(checkPick(['10p', '10p', '10p', '10p'], 40), false);
    assert.equal(checkPick(['20p', '10p', '10p'], 40), false);
  });

  test('rejects an inexact selection', () => {
    assert.equal(checkPick(['20p'], 40), false);
    assert.equal(checkPick(['£1', '50p'], 140), false);
  });

  test('rejects unknown ids and bad input', () => {
    assert.equal(checkPick(['bogus'], 5), false);
    assert.equal(checkPick(['5p'], -5), false);
    assert.equal(checkPick('5p', 5), false);
  });

  test('empty selection is correct only for a zero target', () => {
    assert.equal(checkPick([], 0), true);
    assert.equal(checkPick([], 5), false);
  });
});

describe('checkIdentify', () => {
  test('accepts the matching id', () => {
    assert.equal(checkIdentify('20p', '20p'), true);
    assert.equal(checkIdentify('20p', denominationById('20p')), true);
  });

  test('rejects look-alikes and wrong ids', () => {
    assert.equal(checkIdentify('10p', '20p'), false);
    assert.equal(checkIdentify('£1', '£2'), false);
    assert.equal(checkIdentify(undefined, '20p'), false);
    assert.equal(checkIdentify('20p', 'nope'), false);
  });
});

describe('randomIdentifyTarget and identifyChoices', () => {
  test('coinsOnly never produces a note', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 500; i++) {
      assert.equal(randomIdentifyTarget(rng, { coinsOnly: true }).kind, 'coin');
    }
  });

  test('every denomination can be drawn', () => {
    const rng = seededRng(9);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(randomIdentifyTarget(rng).id);
    assert.equal(seen.size, DENOMINATIONS.length);
  });

  test('choices are four distinct ids including the target', () => {
    const rng = seededRng(11);
    for (const d of DENOMINATIONS) {
      for (let i = 0; i < 20; i++) {
        const choices = identifyChoices(d.id, rng);
        assert.equal(choices.length, 4);
        assert.equal(new Set(choices).size, 4);
        assert.ok(choices.includes(d.id));
      }
    }
  });

  test('coinsOnly choices contain only coins', () => {
    const rng = seededRng(13);
    for (const d of DENOMINATIONS.filter((x) => x.kind === 'coin')) {
      for (let i = 0; i < 20; i++) {
        const choices = identifyChoices(d.id, rng, { coinsOnly: true });
        assert.ok(choices.every((id) => denominationById(id).kind === 'coin'));
      }
    }
  });

  test('look-alike distractors are used first (10p offers 5p, 20p and 50p)', () => {
    const choices = identifyChoices('10p', seededRng(1));
    assert.deepEqual([...choices].sort(), ['10p', '20p', '5p', '50p'].sort());
  });
});

describe('randomChangeScenario', () => {
  test('paid is always >= price and every value is an integer (seeded, 2000 draws per difficulty)', () => {
    for (const difficulty of ['easy', 'hard']) {
      const rng = seededRng(2024 + (difficulty === 'hard' ? 1 : 0));
      for (let i = 0; i < 2000; i++) {
        const s = randomChangeScenario(rng, { difficulty });
        assert.ok(Number.isSafeInteger(s.pricePence), `price integer ${JSON.stringify(s)}`);
        assert.ok(Number.isSafeInteger(s.paidPence), `paid integer ${JSON.stringify(s)}`);
        assert.ok(Number.isSafeInteger(s.changePence), `change integer ${JSON.stringify(s)}`);
        assert.ok(s.paidPence >= s.pricePence, `paid >= price ${JSON.stringify(s)}`);
        assert.equal(s.changePence, s.paidPence - s.pricePence, JSON.stringify(s));
        assert.ok(s.changePence >= 0);
        // changeFor must accept it and agree with the scenario.
        assert.equal(changeFor(s.pricePence, s.paidPence).changePence, s.changePence);
        assert.equal(s.pricePence % 1, 0);
      }
    }
  });

  test('easy prices stay within £0.20 to £30, and hard prices within 5p to £80', () => {
    const rng = seededRng(5);
    for (let i = 0; i < 2000; i++) {
      const easy = randomChangeScenario(rng, { difficulty: 'easy' });
      assert.ok(easy.pricePence >= 20 && easy.pricePence <= 3000, `easy price ${easy.pricePence}`);
      const hard = randomChangeScenario(rng, { difficulty: 'hard' });
      assert.ok(hard.pricePence >= 5 && hard.pricePence <= 8000, `hard price ${hard.pricePence}`);
    }
  });

  test('includes exact payments and pence-only change under £1', () => {
    const rng = seededRng(99);
    let exact = 0;
    let penceOnly = 0;
    for (let i = 0; i < 2000; i++) {
      const s = randomChangeScenario(rng, { difficulty: 'easy' });
      if (s.changePence === 0) exact++;
      if (s.changePence > 0 && s.changePence < 100) penceOnly++;
    }
    assert.ok(exact > 100, `exact payments: ${exact}`);
    assert.ok(penceOnly > 100, `pence-only change: ${penceOnly}`);
  });

  test('is deterministic for a given seed', () => {
    const a = [];
    const b = [];
    const rngA = seededRng(123);
    const rngB = seededRng(123);
    for (let i = 0; i < 50; i++) {
      a.push(randomChangeScenario(rngA));
      b.push(randomChangeScenario(rngB));
    }
    assert.deepEqual(a, b);
  });
});

describe('randomPickScenario and changeDistractors', () => {
  test('pick targets are positive integers in a sensible range', () => {
    const rng = seededRng(17);
    for (let i = 0; i < 1000; i++) {
      const t = randomPickScenario(rng);
      assert.ok(Number.isSafeInteger(t));
      assert.ok(t >= 5 && t <= 2500);
    }
  });

  test('change distractors are distinct, non-negative, and never the correct change', () => {
    const rng = seededRng(21);
    for (const change of [0, 1, 4, 5, 63, 570, 4999]) {
      for (let i = 0; i < 50; i++) {
        const ds = changeDistractors(change, rng);
        assert.equal(ds.length, 3);
        assert.equal(new Set(ds).size, 3);
        assert.ok(ds.every((d) => Number.isSafeInteger(d) && d >= 0 && d !== change));
      }
    }
  });

  test('shuffle keeps the same items', () => {
    const items = [1, 2, 3, 4, 5];
    const out = shuffle(items, seededRng(3));
    assert.deepEqual([...out].sort(), items);
    assert.deepEqual(items, [1, 2, 3, 4, 5]);
  });
});
