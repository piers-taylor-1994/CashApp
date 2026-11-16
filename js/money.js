/**
 * Pure money logic for Till Practice.
 *
 * - No DOM access, so this module can be unit tested in Node.
 * - All amounts are INTEGER PENCE internally. Pounds are only produced by formatPence().
 * - Every random function takes an injected rng returning a number in [0, 1).
 *   It defaults to Math.random.
 */

/** UK coins and Bank of England notes in current circulation, sorted ascending by value. */
export const DENOMINATIONS = Object.freeze(
  [
    { id: '1p', pence: 1, kind: 'coin', name: '1 penny coin' },
    { id: '2p', pence: 2, kind: 'coin', name: '2 pence coin' },
    { id: '5p', pence: 5, kind: 'coin', name: '5 pence coin' },
    { id: '10p', pence: 10, kind: 'coin', name: '10 pence coin' },
    { id: '20p', pence: 20, kind: 'coin', name: '20 pence coin' },
    { id: '50p', pence: 50, kind: 'coin', name: '50 pence coin' },
    { id: '£1', pence: 100, kind: 'coin', name: '£1 coin' },
    { id: '£2', pence: 200, kind: 'coin', name: '£2 coin' },
    { id: '£5', pence: 500, kind: 'note', name: '£5 note' },
    { id: '£10', pence: 1000, kind: 'note', name: '£10 note' },
    { id: '£20', pence: 2000, kind: 'note', name: '£20 note' },
    { id: '£50', pence: 5000, kind: 'note', name: '£50 note' },
  ].map((d) => Object.freeze(d)),
);

const BY_ID = new Map(DENOMINATIONS.map((d) => [d.id, d]));

/** Notes that a customer might hand over, ascending. */
const NOTE_VALUES = Object.freeze(DENOMINATIONS.filter((d) => d.kind === 'note').map((d) => d.pence));

/**
 * Rough visual families. Used to pick look-alike distractors for the identify quiz.
 * Copper: 1p, 2p. Silver: 5p, 10p, 20p, 50p. Bimetallic: £1, £2. Notes: all.
 */
const APPEARANCE = Object.freeze({
  '1p': 'copper',
  '2p': 'copper',
  '5p': 'silver',
  '10p': 'silver',
  '20p': 'silver',
  '50p': 'silver',
  '£1': 'bimetal',
  '£2': 'bimetal',
  '£5': 'note',
  '£10': 'note',
  '£20': 'note',
  '£50': 'note',
});

export function denominationById(id) {
  return BY_ID.get(id);
}

export function isNonNegInt(n) {
  return Number.isSafeInteger(n) && n >= 0;
}

function requireNonNegInt(n, label) {
  if (!isNonNegInt(n)) {
    throw new RangeError(`${label} must be a non-negative integer number of pence, got ${String(n)}`);
  }
}

/** Uniform integer in [0, n). Clamped so an rng returning exactly 1 cannot overflow. */
function randomInt(rng, n) {
  const x = Math.floor(rng() * n);
  if (x < 0) return 0;
  if (x >= n) return n - 1;
  return x;
}

/**
 * Format integer pence for display.
 * 0 -> "0p", 5 -> "5p", 100 -> "£1", 430 -> "£4.30", 2000 -> "£20".
 */
export function formatPence(p) {
  requireNonNegInt(p, 'amount');
  if (p === 0) return '0p';
  if (p < 100) return `${p}p`;
  const pounds = Math.floor(p / 100);
  const pence = p % 100;
  if (pence === 0) return `£${pounds}`;
  return `£${pounds}.${String(pence).padStart(2, '0')}`;
}

/** The smallest whole-pound amount strictly greater than p. e.g. 430 -> 500, 400 -> 500. */
export function nextWholePound(p) {
  requireNonNegInt(p, 'amount');
  return (Math.floor(p / 100) + 1) * 100;
}

/**
 * Greedy decomposition, largest to smallest, returned in ASCENDING order.
 * Greedy is optimal for the UK denomination set because it is a canonical system.
 */
function greedyIds(amount) {
  const descending = [];
  let remaining = amount;
  for (let i = DENOMINATIONS.length - 1; i >= 0; i--) {
    const d = DENOMINATIONS[i];
    const count = Math.floor(remaining / d.pence);
    for (let k = 0; k < count; k++) descending.push(d.id);
    remaining -= count * d.pence;
  }
  // 1p is always present, so remaining is 0 here.
  return descending.reverse();
}

/** The fewest pieces that make up targetPence, ascending. */
export function minimalPieces(targetPence) {
  requireNonNegInt(targetPence, 'target');
  return greedyIds(targetPence);
}

/**
 * Change due for a purchase.
 * @returns {{ changePence: number, pieces: string[] }} pieces are denomination ids, ascending.
 * @throws {RangeError} if inputs are not non-negative integers or paid < price.
 */
export function changeFor(pricePence, paidPence) {
  requireNonNegInt(pricePence, 'price');
  requireNonNegInt(paidPence, 'paid');
  if (paidPence < pricePence) {
    throw new RangeError(`amount paid (${paidPence}p) is less than the price (${pricePence}p)`);
  }
  const changePence = paidPence - pricePence;
  return { changePence, pieces: greedyIds(changePence) };
}

/**
 * The count-up sequence: start at the price, add each change piece in ascending order.
 * The final runningTotalPence always equals paidPence.
 */
export function countUpSteps(pricePence, paidPence) {
  const { pieces } = changeFor(pricePence, paidPence);
  let running = pricePence;
  return pieces.map((pieceId) => {
    const d = BY_ID.get(pieceId);
    running += d.pence;
    return { pieceId, pence: d.pence, runningTotalPence: running };
  });
}

/** Total pence of a list of denomination ids. Throws on unknown ids. */
export function pieceSum(pieceIds) {
  let total = 0;
  for (const id of pieceIds) {
    const d = BY_ID.get(id);
    if (!d) throw new RangeError(`unknown denomination id: ${String(id)}`);
    total += d.pence;
  }
  return total;
}

/** True only if the selection is exact AND uses the fewest possible pieces. */
export function checkPick(selectedPieceIds, targetPence) {
  if (!Array.isArray(selectedPieceIds) || !isNonNegInt(targetPence)) return false;
  if (!selectedPieceIds.every((id) => BY_ID.has(id))) return false;
  if (pieceSum(selectedPieceIds) !== targetPence) return false;
  return selectedPieceIds.length === greedyIds(targetPence).length;
}

/** target may be a denomination id or a denomination object. */
export function checkIdentify(answerId, target) {
  const targetId = typeof target === 'string' ? target : target && target.id;
  return typeof answerId === 'string' && BY_ID.has(targetId) && answerId === targetId;
}

/** Fisher-Yates shuffle using the injected rng. Returns a new array. */
export function shuffle(items, rng = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A random denomination. With coinsOnly, only coins are eligible. */
export function randomIdentifyTarget(rng = Math.random, { coinsOnly = false } = {}) {
  const pool = coinsOnly ? DENOMINATIONS.filter((d) => d.kind === 'coin') : DENOMINATIONS;
  return pool[randomInt(rng, pool.length)];
}

/**
 * Answer choices for the identify quiz: the target plus (count - 1) distractors.
 * Look-alikes (same metal or note family) are used first, then anything else.
 * @returns {string[]} denomination ids in random order.
 */
export function identifyChoices(targetId, rng = Math.random, { coinsOnly = false, count = 4 } = {}) {
  if (!BY_ID.has(targetId)) throw new RangeError(`unknown denomination id: ${String(targetId)}`);
  const pool = DENOMINATIONS.filter((d) => d.id !== targetId && (!coinsOnly || d.kind === 'coin'));
  if (count < 2 || count - 1 > pool.length) {
    throw new RangeError(`cannot build ${count} choices for ${targetId}`);
  }
  const family = APPEARANCE[targetId];
  const similar = pool.filter((d) => APPEARANCE[d.id] === family);
  const others = pool.filter((d) => APPEARANCE[d.id] !== family);
  const picked = shuffle(similar, rng).slice(0, count - 1);
  if (picked.length < count - 1) {
    picked.push(...shuffle(others, rng).slice(0, count - 1 - picked.length));
  }
  return shuffle([targetId, ...picked.map((d) => d.id)], rng);
}

/**
 * Price generator. Weighted towards 5p and 10p multiples, with some 50p and full-pence amounts.
 * Rounds DOWN only, so the result stays within [min, max] when min is a multiple of 5.
 */
function randomPrice(rng, min, max) {
  let p = min + randomInt(rng, max - min + 1);
  const r = rng();
  if (r < 0.5) {
    p -= p % 5;
  } else if (r < 0.7) {
    p -= p % 10;
  } else if (r < 0.8) {
    const q = p - (p % 50);
    p = q >= min ? q : p - (p % 10);
  }
  if (p < min) p = min;
  return p;
}

/**
 * A change scenario.
 * Easy: prices £0.20 to £30. Hard: prices 5p to £80.
 * paid is always >= price and always an integer.
 *   ~10%: exact payment (change 0).
 *   ~20%: the next whole pound (always strictly above the price, so change has pence or is £1 to £x).
 *   ~70%: the smallest note that covers the price, sometimes the next note up.
 *         Prices above £50 have no single note, so they are paid in whole £50 notes
 *         (the amount is the smallest multiple of £50 that covers the price, e.g. £60 is paid as £100).
 */
export function randomChangeScenario(rng = Math.random, { difficulty = 'easy' } = {}) {
  const hard = difficulty === 'hard';
  const pricePence = randomPrice(rng, hard ? 5 : 20, hard ? 8000 : 3000);
  const u = rng();
  let paidPence;
  if (u < 0.1) {
    paidPence = pricePence;
  } else if (u < 0.3) {
    paidPence = nextWholePound(pricePence);
  } else {
    const note = NOTE_VALUES.find((n) => n >= pricePence);
    if (note === undefined) {
      paidPence = Math.ceil(pricePence / 5000) * 5000;
    } else {
      let chosen = note;
      if (rng() < 0.25) {
        const bigger = NOTE_VALUES.find((n) => n > note);
        if (bigger !== undefined) chosen = bigger;
      }
      paidPence = chosen;
    }
  }
  return { pricePence, paidPence, changePence: paidPence - pricePence };
}

/** A target amount for the pick quiz, from 5p to £25. */
export function randomPickScenario(rng = Math.random) {
  return randomPrice(rng, 5, 2500);
}

/**
 * Wrong change amounts for the "choose the total" mode.
 * Returns `count` distinct non-negative integers, none equal to changePence.
 */
export function changeDistractors(changePence, rng = Math.random, count = 3) {
  requireNonNegInt(changePence, 'change');
  const offsets = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  const out = new Set();
  let guard = 0;
  while (out.size < count && guard < 1000) {
    guard++;
    const off = offsets[randomInt(rng, offsets.length)];
    const subtract = rng() < 0.5;
    let candidate = subtract ? changePence - off : changePence + off;
    if (candidate < 0) candidate = changePence + off;
    if (candidate !== changePence && candidate >= 0) out.add(candidate);
  }
  // Fallback that always terminates: step upwards from the change.
  for (let k = 1; out.size < count; k++) out.add(changePence + k);
  return [...out];
}
