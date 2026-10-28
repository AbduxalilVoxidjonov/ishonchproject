'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ledger = require('./stock-ledger.js');

function rejectsUnchanged(item, operation) {
  const before = structuredClone(item);
  assert.throws(operation);
  assert.deepEqual(item, before);
}

test('partial commit and repeat deduct only incremental quantities', () => {
  const item = { stock: 10, qty: 8 };
  assert.equal(ledger.commit(item, 3).delta, 3);
  assert.equal(item.stock, 7);
  assert.equal(ledger.commit(item, 3).delta, 0);
  assert.equal(ledger.commit(item, 8).delta, 5);
  assert.deepEqual([item.initialStock, item.stock, item.totalUsed, item.deducted], [10, 2, 8, 8]);
});

test('legacy placed is deducted once, including after JSON reload', () => {
  let item = { stock: 10, qty: 8, placed: 3 };
  assert.equal(ledger.normalizeItem(item), item);
  assert.deepEqual([item.stock, item.deducted, item.totalUsed, item.initialStock], [7, 3, 3, 10]);
  item = JSON.parse(JSON.stringify(item));
  ledger.normalizeItem(item);
  assert.equal(ledger.commit(item, 3).delta, 0);
  assert.equal(ledger.commit(item, 5).delta, 2);
  assert.equal(item.stock, 5);
});

test('multiple receipts preserve original stock and lifetime use', () => {
  let item = { stock: 10, qty: 6, status: 'ok', note: 'old' };
  ledger.commit(item, 6);
  assert.equal(ledger.next(item), item);
  assert.deepEqual([item.qty, item.placed, item.deducted, item.status, item.note], [4, 0, 0, 'pending', '']);
  item = JSON.parse(JSON.stringify(item));
  ledger.commit(item, 4);
  ledger.next(item);
  assert.deepEqual([item.initialStock, item.totalUsed, item.stock, item.qty, item.status], [10, 10, 0, 0, 'skip']);
});

test('prepare caps outstanding plan rather than entire receipt', () => {
  const item = { stock: 10, qty: 8 };
  ledger.commit(item, 6);
  assert.equal(ledger.prepare(item, 10).qty, 10);
  rejectsUnchanged(item, () => ledger.prepare(item, 11));
  rejectsUnchanged(item, () => ledger.prepare(item, 5));
});

test('invalid confirmations roll back even normalization', () => {
  for (const value of [NaN, Infinity, -Infinity, -1, '2', null, undefined, 11]) {
    const item = { stock: 10, qty: 10 };
    rejectsUnchanged(item, () => ledger.commit(item, value));
  }
  const item = { stock: 10, qty: 10 };
  ledger.commit(item, 4);
  rejectsUnchanged(item, () => ledger.commit(item, 3));
  item.qty = 20;
  rejectsUnchanged(item, () => ledger.commit(item, 11));
});

test('invalid ledger fields and uncommitted reset never mutate', () => {
  for (const item of [
    { stock: -1 }, { stock: Infinity }, { stock: 2, qty: NaN },
    { stock: 2, qty: 1, placed: 2 }, { stock: 1, qty: 2, placed: 2 },
    { stock: 2, deducted: -1 },
    { stock: 2, qty: 3, placed: 2, deducted: 1, totalUsed: 0 },
    { stock: 2, initialStock: 9 },
  ]) rejectsUnchanged(item, () => ledger.normalizeItem(item));
  const item = { stock: 8, qty: 5, placed: 2, deducted: 1, totalUsed: 1, initialStock: 9 };
  rejectsUnchanged(item, () => ledger.next(item));
});

test('fractional quantities and browser global work without DOM or CommonJS', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('./stock-ledger.js'), 'utf8'), context);
  const item = { stock: 1.5, qty: 1.5 };
  context.ReceiptLedger.commit(item, 0.5);
  context.ReceiptLedger.commit(item, 1.5);
  assert.equal(item.stock, 0);
  assert.equal(item.totalUsed, 1.5);
  assert.equal(globalThis.ReceiptLedger, ledger);
});

test('decimal stock survives partial commit, repeat, next receipt and JSON', () => {
  let item = { stock: 0.3, qty: 0.3 };
  assert.equal(ledger.commit(item, 0.1).delta, 0.1);
  assert.equal(item.stock, 0.2);
  assert.equal(ledger.prepare(item, 0.3).qty, 0.3);
  assert.equal(ledger.commit(item, 0.1).delta, 0);
  assert.equal(Math.round((item.stock + item.totalUsed) * 10000), item.initialStock * 10000);
  ledger.next(item);
  assert.equal(item.qty, 0.2);
  item = JSON.parse(JSON.stringify(item));
  assert.equal(ledger.commit(item, 0.2).delta, 0.2);
  assert.equal(ledger.commit(item, 0.2).delta, 0);
  assert.deepEqual([item.stock, item.totalUsed, item.initialStock], [0, 0.3, 0.3]);
});

test('four decimal arithmetic conserves totals and rejects actual overstock', () => {
  const item = { stock: 0.3, qty: 0.3 };
  for (const confirmed of [0.1, 0.2, 0.3]) {
    assert.equal(ledger.commit(item, confirmed).delta, 0.1);
    assert.equal(ledger.commit(item, confirmed).delta, 0);
    assert.equal(Math.round((item.stock + item.totalUsed) * 10000), item.initialStock * 10000);
  }
  const partial = { stock: 0.3, qty: 0.4 };
  ledger.commit(partial, 0.1);
  rejectsUnchanged(partial, () => ledger.commit(partial, 0.3001));
  rejectsUnchanged(partial, () => ledger.prepare(partial, 0.3001));
  const tiny = { stock: 0.0003, qty: 0.0003 };
  ledger.commit(tiny, 0.0001);
  ledger.next(tiny);
  assert.equal(tiny.qty, 0.0002);
  ledger.commit(tiny, 0.0002);
  assert.equal(tiny.totalUsed, 0.0003);
  assert.equal(tiny.stock, 0);
});
