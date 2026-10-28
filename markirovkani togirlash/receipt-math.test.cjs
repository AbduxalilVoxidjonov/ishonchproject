const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const math = require('./receipt-math.js');

test('CommonJS and standalone browser global expose the same API', () => {
  assert.equal(globalThis.ReceiptMath, math);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('./receipt-math.js'), 'utf8'), context);
  assert.equal(context.ReceiptMath.unitPrice(100, 12), 112);
  assert.deepEqual(Object.keys(context.ReceiptMath), ['parseNumber', 'parseLoose', 'normalizeNumberText', 'detectDecimal', 'unitPrice', 'lineTotals']);
});

test('numbers printed with other browsers\' Unicode are read like the plain ones', () => {
  for (const [raw, expected] of [
    ['1 456 831,68', 1456831.68], ['1 234', 1234], ['‎5‏', 5],
    ['1’234’567.5', 1234567.5], ['−5', -5], ['１２,５', 12.5], ['٥', 5], ['﻿7', 7],
  ]) assert.equal(math.parseNumber(raw), expected, JSON.stringify(raw));
  assert.equal(math.detectDecimal(['1 234,5', '2,50']), ',');
});

test('parseLoose reads the number of a cell that also carries a unit, strict parsing does not', () => {
  assert.equal(math.parseLoose('5 шт'), 5);
  assert.equal(math.parseLoose('12 500,50 so‘m', ','), 12500.5);
  assert.equal(math.parseLoose('7'), 7);
  assert.ok(Number.isNaN(math.parseLoose('шт')));
  assert.ok(Number.isNaN(math.parseLoose('')));
  assert.ok(Number.isNaN(math.parseNumber('5 шт')));
});

test('parses US, Russian, nonbreaking spaces, and decimal quantities', () => {
  for (const [raw, expected] of [
    ['1,456,831.68', 1456831.68], ['1.456.831,68', 1456831.68],
    ['1.234,567', 1234.567], ['-12.345,67', -12345.67], ['1 456 831,68', 1456831.68],
    ['1\u00a0456\u202f831,68', 1456831.68], ['101.0000', 101],
    ['12,50', 12.5], ['1,234,567', 1234567], ['  +12.25  ', 12.25],
    ['-12,50', -12.5], [0, 0], [1e-7, 1e-7],
  ]) assert.equal(math.parseNumber(raw), expected, String(raw));
});

test('rejects ambiguous, malformed, nonnumeric and nonfinite inputs', () => {
  for (const raw of ['1,000', '1,234', '12,345', '1,23,456', '1.45.831,68',
    '1234.567,89', '1.234,5,6', '1.234,', '1,234.567,89', '1 23 456',
    '1  234', '1,234.5.6', '', ' ', '1e3', '0x10', '12som', '.5', '1.',
    '--1', 'NaN', 'Infinity', '9'.repeat(400), NaN, Infinity, -Infinity,
    null, undefined, true, {}, [], 1n]) {
    assert.ok(Number.isNaN(math.parseNumber(raw)), String(raw));
  }
});

test('a known decimal separator resolves the lone "d,ddd" form', () => {
  assert.equal(math.parseNumber('5,000', ','), 5);
  assert.equal(math.parseNumber('1234,000', ','), 1234);
  assert.equal(math.parseNumber('1,000', '.'), 1000);
  assert.equal(math.parseNumber('1.000', ','), 1000);
  assert.equal(math.parseNumber('1.000.000', ','), 1000000);
  assert.equal(math.parseNumber('12,50', '.'), 12.5);
  assert.ok(Number.isNaN(math.parseNumber('1234,000', '.')));
  assert.ok(Number.isNaN(math.parseNumber('1,000')));
});

test('detects the decimal separator of a 1C column', () => {
  for (const [values, expected] of [
    [['5,000', '12,000', '1 200,000'], ','], [['5,000', '2,000'], ','], [['0,500'], ','],
    [['5', '12', '1,000'], '.'], [['5.000', '1,200.000'], '.'], [['12,50', '1,000'], ','],
    [['100.25'], '.'], [['5', '7'], ''], [[], ''],
  ]) assert.equal(math.detectDecimal(values), expected, values.join(' | '));
});

test('unit price rounds decimal half cents correctly including zero markup', () => {
  for (const [base, percent, expected] of [
    [1.005, 0, 1.01], [2.675, 0, 2.68], [0.1, 5, 0.11],
    [100, 12.5, 112.5], ['1 000,50', '10', 1100.55], [0, 100, 0],
    [1e-7, 0, 0],
  ]) assert.equal(math.unitPrice(base, percent), expected);
});

test('invalid prices and percentages are rejected, including negatives and overflow', () => {
  for (const [base, percent] of [[-1, 0], [1, -1], [NaN, 0], [1, Infinity],
    ['bad', 10], [10, undefined], [Number.MAX_VALUE, 100]]) {
    assert.ok(Number.isNaN(math.unitPrice(base, percent)));
  }
});

test('line totals preserve cent arithmetic and derive markup from final totals', () => {
  assert.deepEqual(math.lineTotals({ price: '0.10', qty: '101.0000' }, 5), {
    baseUnitPrice: 0.1, saleUnitPrice: 0.11, qty: 101,
    costTotal: 10.1, markupTotal: 1.01, total: 11.11,
  });
  assert.deepEqual(math.lineTotals({ price: 1.005, qty: 3 }, 0), {
    baseUnitPrice: 1.01, saleUnitPrice: 1.01, qty: 3,
    costTotal: 3.03, markupTotal: 0, total: 3.03,
  });
});

test('fractional and zero quantities round totals half up', () => {
  assert.deepEqual(math.lineTotals({ price: 0.05, qty: 0.5 }, 100), {
    baseUnitPrice: 0.05, saleUnitPrice: 0.1, qty: 0.5,
    costTotal: 0.03, markupTotal: 0.02, total: 0.05,
  });
  const zero = math.lineTotals({ price: 120, qty: 0 }, 20);
  assert.equal(zero.total, 0);
  assert.equal(zero.costTotal, 0);
  assert.equal(zero.markupTotal, 0);
});

test('invalid lines never produce usable monetary totals', () => {
  for (const line of [null, undefined, {}, { price: -1, qty: 1 },
    { price: 1, qty: -1 }, { price: 1, qty: 'bad' },
    { price: Number.MAX_VALUE, qty: 1 }, { price: 100, qty: Number.MAX_VALUE }]) {
    const result = math.lineTotals(line, 10);
    for (const key of ['baseUnitPrice', 'saleUnitPrice', 'costTotal', 'markupTotal', 'total'])
      assert.ok(Number.isNaN(result[key]), key);
  }
  assert.ok(Number.isNaN(math.lineTotals({ price: 1, qty: 1 }, -1).total));
});

// The locale-free parser intentionally keeps single-comma grouping ambiguous.
test('extreme finite numbers keep decimal BigInt arithmetic bounded', { timeout: 1000 }, () => {
  const tiny = Number.MIN_VALUE;
  const huge = Number.MAX_VALUE;
  assert.equal(math.parseNumber(tiny), tiny);
  assert.equal(math.parseNumber(huge), huge);
  assert.equal(math.unitPrice(tiny, huge), 0);
  assert.equal(math.unitPrice(0, huge), 0);
  assert.equal(math.unitPrice(1, tiny), 1);
  assert.ok(Number.isNaN(math.unitPrice(huge, huge)));
  assert.equal(math.lineTotals({ price: tiny, qty: huge }, huge).total, 0);
  assert.equal(math.lineTotals({ price: 1, qty: tiny }, tiny).total, 0);
  assert.equal(math.lineTotals({ price: 0, qty: huge }, huge).total, 0);
  assert.ok(Number.isNaN(math.lineTotals({ price: huge, qty: tiny }, huge).total));
  assert.ok(Number.isNaN(math.lineTotals({ price: 1, qty: huge }, tiny).total));
});
