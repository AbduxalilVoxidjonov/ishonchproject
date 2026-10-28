'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { plan } = require('./receipt-pair.js');

const item = (name, price, stock = 2) => ({ name, price, stock });

function expectedPlan(items, target, percent = 0) {
  const math = require('./receipt-math.js');
  const targetCents = Math.round(math.unitPrice(target, 0) * 100);
  const candidates = items.flatMap((row, index) => {
    if (!row || typeof row.name !== 'string' || !row.name.trim() || typeof row.price !== 'number' || !Number.isFinite(row.price) || row.price <= 0 ||
        typeof row.stock !== 'number' || !Number.isFinite(row.stock) || row.stock < 1) return [];
    const cents = Math.round(math.unitPrice(row.price, percent) * 100);
    return cents > 0 && Number.isSafeInteger(cents) ? [{ index, key: row.name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase(), weight: Math.min(2, Math.floor(row.stock)) * cents }] : [];
  });
  const groups = new Map();
  candidates.forEach(candidate => groups.set(candidate.key, [...(groups.get(candidate.key) || []), candidate]));
  let best = null;
  function compare(a, b) {
    const ad = Math.abs(a.total - targetCents);
    const bd = Math.abs(b.total - targetCents);
    return ad - bd || Number(a.total > targetCents) - Number(b.total > targetCents) ||
      a.indices.join(',').localeCompare(b.indices.join(','), 'en', { numeric: true });
  }
  function visit(groupIndex, total, indices) {
    if (groupIndex === [...groups.values()].length) {
      if (!indices.length) return;
      const candidate = { total, indices };
      if (!best || compare(candidate, best) < 0) best = candidate;
      return;
    }
    const group = [...groups.values()][groupIndex];
    visit(groupIndex + 1, total, indices);
    for (const candidate of group) visit(groupIndex + 1, total + candidate.weight, [...indices, candidate.index].sort((a, b) => a - b));
  }
  visit(0, 0, []);
  return best;
}

test('selects any number of products and leaves inputs unchanged', () => {
  const items = [item('A', 10), item('B', 20), item('C', 40)];
  const before = structuredClone(items);
  items.forEach(Object.freeze);
  Object.freeze(items);
  assert.deepEqual(plan(items, 60, 0), {
    qty: [2, 2, 0], total: 60, target: 60, difference: 0, indices: [0, 1],
    minFeasibleTotal: 20, maxFeasibleTotal: 140,
  });
  assert.deepEqual(items, before);
});

test('one product is a valid subset and stock controls its fixed quantity', () => {
  assert.deepEqual(plan([item('A', 10, 1), item('B', 100, 9)], 10, 0), {
    qty: [1, 0], total: 10, target: 10, difference: 0, indices: [0],
    minFeasibleTotal: 10, maxFeasibleTotal: 210,
  });
  assert.deepEqual(plan([item('A', 1, 1.999), item('B', 2, 9)], 5, 0).qty, [1, 2]);
});

test('normalized duplicate names can contribute at most one product', () => {
  const items = [item('  Apple  JUICE ', 1), item('apple juice', 100), item('Ｂ', 3), item('B', 3)];
  assert.deepEqual(plan(items, 8, 0).indices, [0, 2]);
  assert.equal(plan(items, 206, 0).indices.join(','), '1,2');
});

test('skips unavailable, malformed and cent-zero candidates', () => {
  const items = [item('Low', 1, 0.9999), item('Missing'), item('NaN', NaN), item('Zero', 0), item('Tiny', 0.001), item('A', 2), item('B', 3)];
  assert.deepEqual(plan(items, 4, 0).indices, [5]);
  assert.throws(() => plan([item('Tiny', 0.001)], 0, 0), /No feasible receipt plan/);
});

test('preserves rounded marked-up unit cents and quantity caps', () => {
  const result = plan([item('A', 1.01, 1.9999), item('B', 2.03, 9)], 5.57, 10);
  assert.equal(result.total, 5.57); // 1 * 1.11 + 2 * 2.23
  assert.equal(result.difference, 0);
  assert.equal(plan([item('A', 0.105), item('B', 0.205)], 0.645, 0).target, 0.65);
  assert.equal(plan([item('A', 0.105), item('B', 0.205)], 0.645, 0).total, 0.64);
});

test('equal distances prefer below target, then earlier original indices', () => {
  assert.deepEqual(plan([item('A', 2), item('B', 3), item('C', 1)], 9, 0).indices, [1, 2]);
  assert.deepEqual(plan([item('A', 1), item('B', 1), item('C', 2)], 2, 0).indices, [0]);
});

test('target changes select different subsets across twelve products', () => {
  const items = [10000, 20000, 40000, 80000, 110000, 130000, 150000, 170000, 190000, 210000, 230000, 250000]
    .map((price, index) => item(String.fromCharCode(65 + index), price));
  for (const [target, indices, total] of [[60000, [0, 1], 60000], [100000, [0, 2], 100000], [180000, [0, 3], 180000], [240000, [0, 4], 240000]]) {
    const result = plan(items, target, 0);
    assert.deepEqual(result.indices, indices);
    assert.equal(result.total, total);
    assert.deepEqual(result.qty, items.map((_, index) => indices.includes(index) ? 2 : 0));
  }
});

test('matches an independent exhaustive subset oracle on small fixtures', () => {
  let seed = 137;
  const next = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let fixture = 0; fixture < 30; fixture++) {
    const items = Array.from({ length: 10 }, (_, index) => item(String.fromCharCode(65 + index), 1 + next(100), [1, 2, 9][next(3)]));
    for (let target = 0; target <= 500; target += 13) {
      const expected = expectedPlan(items, target / 100);
      const actual = plan(items, target / 100, 0);
      assert.equal(actual.total, expected.total / 100, `fixture=${fixture}, target=${target}`);
      assert.deepEqual(actual.indices, expected.indices, `fixture=${fixture}, target=${target}`);
    }
  }
});

test('ineligible input and unsafe targets fail without mutation', () => {
  for (const items of [[], [item('A', 1, 0)], [item('', 1)], [item('A', 0.001)]]) {
    const before = structuredClone(items);
    assert.throws(() => plan(items, 10, 0), /No feasible receipt plan/);
    assert.deepEqual(items, before);
  }
  const items = [item('A', 1), item('B', 2)];
  for (const bad of [NaN, Infinity, -1, '10', null, undefined]) {
    assert.throws(() => plan(items, bad, 0), /target and percent/);
    assert.throws(() => plan(items, 10, bad), /target and percent/);
  }
  assert.throws(() => plan(items, Number.MAX_VALUE, 0), /safe currency/);
  assert.throws(() => plan([item('Too large at fixed quantity', 5e13)], 1, 0), /No feasible receipt plan/);
});

test('browser global works with ReceiptMath and CommonJS fallback', () => {
  const context = vm.createContext({});
  for (const file of ['./receipt-math.js', './receipt-pair.js']) vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8'), context);
  assert.equal(context.ReceiptPair.plan([item('A', 1), item('B', 2)], 6, 0).total, 6);
  const common = vm.createContext({ module: { exports: {} }, require });
  vm.runInContext(fs.readFileSync(require.resolve('./receipt-pair.js'), 'utf8'), common);
  assert.equal(common.module.exports.plan([item('A', 1), item('B', 2)], 6, 0).total, 6);
});

test('range uses every eligible subset and rounded stock-limited weights', () => {
  const result = plan([item('A', 0.105, 1), item('B', 0.205, 2), item('C', 0.305, 9)], 1, 10);
  assert.equal(result.minFeasibleTotal, 0.12);
  assert.equal(result.maxFeasibleTotal, 1.26);
  assert.equal(result.total, 1.14);
});


test('per-item limit takes up to N units, the whole smaller stock, or everything', () => {
  const items = [item('A', 10, 7), item('B', 1, 3), item('C', 100, 1)];
  assert.deepEqual(plan(items, 1000, 0, 5).qty, [5, 3, 1]);
  assert.equal(plan(items, 1000, 0, 5).maxFeasibleTotal, 153);
  assert.deepEqual(plan(items, 1000, 0, Infinity).qty, [7, 3, 1]);
  assert.equal(plan(items, 1000, 0, Infinity).total, 173);
  assert.deepEqual(plan(items, 30, 0, 3).qty, [3, 0, 0]);
  assert.deepEqual(plan(items, 1000, 0).qty, [2, 2, 1]); // default stays 2
  for (const bad of [0, -1, 1.5, NaN, '2', null]) assert.throws(() => plan(items, 10, 0, bad), /perItem/);
});
