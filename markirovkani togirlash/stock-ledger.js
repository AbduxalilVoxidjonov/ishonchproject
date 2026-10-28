/* Internal receipt preparation bookkeeping only; no posting or sale operations.
 * Legacy items (no deducted field) hold original stock: placed is deducted once.
 * deducted is the migration marker; persist all ledger fields together in JSON.
 * Quantities use four decimal places (1C precision); subprecision input rounds.
 * All operations validate a copy before mutating the caller's item.
 */
(function (root) {
  'use strict';

  function quantity(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new RangeError(name + ' must be a finite nonnegative number');
    }
    const units = Math.round(value * 10000);
    if (!Number.isSafeInteger(units)) throw new RangeError(name + ' exceeds quantity precision');
    return units / 10000;
  }

  function normalized(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('item must be an object');
    }
    const result = { ...item };
    const stock = quantity(item.stock, 'stock');
    result.qty = quantity(item.qty === undefined ? stock : item.qty, 'qty');
    result.placed = quantity(item.placed === undefined ? 0 : item.placed, 'placed');
    const legacy = item.deducted === undefined;
    result.deducted = quantity(legacy ? result.placed : item.deducted, 'deducted');
    if (result.deducted > result.placed || result.placed > result.qty) {
      throw new RangeError('Expected deducted <= placed <= qty');
    }
    result.stock = quantity(stock - (legacy ? result.placed : 0), 'remaining stock');
    result.totalUsed = quantity(item.totalUsed === undefined ? result.deducted : item.totalUsed, 'totalUsed');
    if (result.totalUsed < result.deducted) throw new RangeError('totalUsed is below deducted');
    result.initialStock = quantity(item.initialStock === undefined
      ? result.stock + result.totalUsed : item.initialStock, 'initialStock');
    const sum = quantity(result.stock + result.totalUsed, 'inventory total');
    if (!Number.isFinite(sum) || Math.abs(sum - result.initialStock) >
        Number.EPSILON * Math.max(1, sum, result.initialStock) * 8) {
      throw new RangeError('initialStock must equal stock + totalUsed');
    }
    return result;
  }

  function normalizeItem(item) {
    return Object.assign(item, normalized(item));
  }

  // A plan includes quantities already placed on this receipt. Only its
  // outstanding portion needs to fit the remaining internal stock.
  function prepare(item, qty) {
    const result = normalized(item);
    result.qty = quantity(qty === undefined ? result.qty : qty, 'qty');
    if (result.qty < result.placed || quantity(result.qty - result.placed, 'outstanding qty') > result.stock) {
      throw new RangeError('Outstanding plan exceeds remaining stock or plan is below placed');
    }
    return Object.assign(item, result);
  }

  function commit(item, confirmedPlaced) {
    const result = normalized(item);
    confirmedPlaced = quantity(confirmedPlaced, 'confirmedPlaced');
    if (confirmedPlaced < result.placed || confirmedPlaced < result.deducted) {
      throw new RangeError('Confirmed quantity cannot decrease');
    }
    if (confirmedPlaced > result.qty) throw new RangeError('Confirmed quantity exceeds plan');
    const delta = quantity(confirmedPlaced - result.deducted, 'delta');
    if (delta > result.stock) throw new RangeError('Insufficient remaining stock');
    result.stock = quantity(result.stock - delta, 'remaining stock');
    result.totalUsed = quantity(result.totalUsed + delta, 'totalUsed');
    result.placed = confirmedPlaced;
    result.deducted = confirmedPlaced;
    Object.assign(item, result);
    return { item, delta };
  }

  function next(item) {
    const result = normalized(item);
    if (result.placed !== result.deducted) throw new RangeError('Commit placed quantity before resetting');
    result.qty = result.stock;
    result.placed = 0;
    result.deducted = 0;
    result.status = result.stock > 0 ? 'pending' : 'skip';
    result.note = '';
    return Object.assign(item, result);
  }

  const api = Object.freeze({ normalizeItem, prepare, commit, next });
  root.ReceiptLedger = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
