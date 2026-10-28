/* Receipt planner: choose a nonempty subset of eligible named products.
 * Each selected product contributes exactly min(perItem, floor(stock)) units;
 * perItem defaults to 2 and may be Infinity (take the whole stock).
 * Currency is rounded to cents before multiplication, and all search totals
 * stay in BigInt cents until the result is converted back to Numbers.
 *
 * Names are normalized and may occur at most once in a plan. The objective is
 * closest total to the rounded target, then a total at or below the target,
 * then lexicographically earlier original indices. min/max feasible totals
 * describe all eligible nonempty subsets, including duplicate-name choices.
 *
 * Search is exact with sparse DP while its state set fits the bounded budget,
 * and exact meet-in-the-middle when each name group can be split into small
 * halves. Larger inventories use a deterministic capped frontier: this avoids
 * exponential memory/time, but the frontier cap means that its result is an
 * approximation for adversarial large subset-sum inputs. Feasible bounds are
 * computed independently; when their sum exceeds the safe ceiling, the upper
 * bound uses the same bounded solver to find the largest safe subset.
 */
(function (root) {
  'use strict';
  const math = root.ReceiptMath || (typeof require === 'function' ? require('./receipt-math.js') : null);
  const MAX = BigInt(Number.MAX_SAFE_INTEGER);
  const DP_STATE_LIMIT = 250000;
  const MITM_HALF_LIMIT = 1 << 21;

  function valid(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  function nameKey(name) {
    return typeof name === 'string' ? name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';
  }

  function compareIndices(a, b) {
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  }

  function addIndex(indices, index) {
    const result = indices.slice();
    result.push(index);
    result.sort((a, b) => a - b);
    return result;
  }

  function betterPlan(a, b, target) {
    if (!b) return true;
    const aDifference = a.total >= target ? a.total - target : target - a.total;
    const bDifference = b.total >= target ? b.total - target : target - b.total;
    if (aDifference !== bDifference) return aDifference < bDifference;
    const aAbove = a.total > target;
    const bAbove = b.total > target;
    if (aAbove !== bAbove) return !aAbove;
    return compareIndices(a.indices, b.indices) < 0;
  }

  function stateFor(total, indices) {
    return { total, indices };
  }

  function dedupeStates(states) {
    const byTotal = new Map();
    for (const state of states) {
      const old = byTotal.get(state.total);
      if (!old || compareIndices(state.indices, old.indices) < 0) byTotal.set(state.total, state);
    }
    return [...byTotal.values()];
  }

  function generateHalf(groups, start, end) {
    let states = [stateFor(0n, [])];
    for (let groupIndex = start; groupIndex < end; groupIndex++) {
      const next = [];
      for (const state of states) {
        for (const candidate of groups[groupIndex]) {
          const total = state.total + (candidate ? candidate.weight : 0n);
          if (total <= MAX) {
            next.push(stateFor(total, candidate ? addIndex(state.indices, candidate.index) : state.indices));
          }
        }
      }
      states = dedupeStates(next);
    }
    return states;
  }

  function lowerBound(states, value) {
    let low = 0;
    let high = states.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (states[middle].total < value) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function meetInMiddle(groups, target) {
    let split = 0;
    let leftEstimate = 1;
    for (let i = 0; i < groups.length; i++) {
      const optionCount = groups[i].length;
      if (split === 0 || leftEstimate * optionCount <= MITM_HALF_LIMIT) {
        leftEstimate *= optionCount;
        split = i + 1;
      }
    }
    const rightEstimate = groups.slice(split).reduce((product, group) => product * group.length, 1);
    if (leftEstimate > MITM_HALF_LIMIT || rightEstimate > MITM_HALF_LIMIT) return null;
    const left = generateHalf(groups, 0, split);
    const right = generateHalf(groups, split, groups.length)
      .sort((a, b) => a.total < b.total ? -1 : a.total > b.total ? 1 : compareIndices(a.indices, b.indices));
    let best = null;
    for (const first of left) {
      const remaining = target - first.total;
      const position = lowerBound(right, remaining);
      for (const rightPosition of [position - 1, position]) {
        if (rightPosition < 0 || rightPosition >= right.length) continue;
        const second = right[rightPosition];
        const total = first.total + second.total;
        if (total > MAX || (first.indices.length === 0 && second.indices.length === 0)) continue;
        const candidate = stateFor(total, first.indices.concat(second.indices).sort((a, b) => a - b));
        if (betterPlan(candidate, best, target)) best = candidate;
      }
    }
    return best;
  }

  function pruneFrontier(states, target) {
    if (states.length <= DP_STATE_LIMIT) return states;
    const below = states.filter(state => state.total <= target)
      .sort((a, b) => betterPlan(a, b, target) ? -1 : betterPlan(b, a, target) ? 1 : 0);
    const above = states.filter(state => state.total > target)
      .sort((a, b) => betterPlan(a, b, target) ? -1 : betterPlan(b, a, target) ? 1 : 0);
    const half = Math.floor(DP_STATE_LIMIT / 2);
    const chosen = below.slice(0, half).concat(above.slice(0, half));
    if (chosen.length < DP_STATE_LIMIT) {
      const selected = new Set(chosen);
      for (const state of states) {
        if (chosen.length >= DP_STATE_LIMIT) break;
        if (!selected.has(state)) { selected.add(state); chosen.push(state); }
      }
    }
    return chosen;
  }

  function dynamicPlan(groups, target) {
    let states = [stateFor(0n, [])];
    for (const group of groups) {
      const next = [];
      for (const state of states) {
        for (const candidate of group) {
          const total = state.total + (candidate ? candidate.weight : 0n);
          if (total <= MAX) next.push(stateFor(total, candidate ? addIndex(state.indices, candidate.index) : state.indices));
        }
      }
      states = pruneFrontier(dedupeStates(next), target);
    }
    let best = null;
    for (const state of states) {
      if (state.indices.length && betterPlan(state, best, target)) best = state;
    }
    return best;
  }

  function plan(items, target, percent, perItem = 2) {
    if (!math || typeof math.unitPrice !== 'function') throw new Error('ReceiptPair requires ReceiptMath');
    if (!Array.isArray(items)) throw new TypeError('items must be an array');
    if (!valid(target) || !valid(percent)) throw new RangeError('target and percent must be finite nonnegative numbers');
    if (perItem !== Infinity && !(Number.isSafeInteger(perItem) && perItem > 0)) throw new RangeError('perItem must be a positive integer or Infinity');
    const roundedTarget = math.unitPrice(target, 0);
    const targetCents = Math.round(roundedTarget * 100);
    if (!Number.isSafeInteger(targetCents)) throw new RangeError('target exceeds safe currency range');
    const targetBig = BigInt(targetCents);
    const candidates = [];
    items.forEach((item, index) => {
      if (!item || !valid(item.price) || item.price <= 0 || !valid(item.stock) || item.stock < 1) return;
      const key = nameKey(item.name);
      if (!key) return;
      const price = math.unitPrice(item.price, percent);
      const cents = Math.round(price * 100);
      if (!Number.isSafeInteger(cents) || cents <= 0) return;
      const qty = Math.min(perItem, Math.floor(item.stock));
      if (!Number.isSafeInteger(qty)) return;
      const weight = BigInt(qty) * BigInt(cents);
      if (weight > MAX) return;
      candidates.push({ index, key, weight, qty });
    });
    const grouped = new Map();
    for (const candidate of candidates) {
      if (!grouped.has(candidate.key)) grouped.set(candidate.key, []);
      grouped.get(candidate.key).push(candidate);
    }
    const groups = [...grouped.values()].map(group => [null, ...group]);
    let minFeasible = null;
    let maxFeasible = 0n;
    let totalWeight = 0n;
    for (const group of groups) {
      for (const candidate of group) {
        if (!candidate) continue;
        if (minFeasible === null || candidate.weight < minFeasible) minFeasible = candidate.weight;
      }
      const maximum = group.slice(1).reduce((best, candidate) => candidate.weight > best ? candidate.weight : best, 0n);
      totalWeight += maximum;
    }
    maxFeasible = totalWeight <= MAX ? totalWeight : (meetInMiddle(groups, MAX) || dynamicPlan(groups, MAX))?.total || 0n;
    if (minFeasible === null || maxFeasible === 0n) {
      throw new Error('No feasible receipt plan: need a named product with positive price and stock >= 1');
    }
    const best = meetInMiddle(groups, targetBig) || dynamicPlan(groups, targetBig);
    if (!best) throw new Error('No feasible receipt plan within safe currency range');
    const qty = Array(items.length).fill(0);
    best.indices.forEach(index => { qty[index] = candidates.find(candidate => candidate.index === index).qty; });
    const difference = best.total >= targetBig ? best.total - targetBig : targetBig - best.total;
    return { qty, total: Number(best.total) / 100, target: roundedTarget,
      difference: Number(difference) / 100, indices: best.indices,
      minFeasibleTotal: Number(minFeasible) / 100, maxFeasibleTotal: Number(maxFeasible) / 100 };
  }

  const api = Object.freeze({ plan });
  root.ReceiptPair = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
