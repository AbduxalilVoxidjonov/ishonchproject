const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ReceiptMath = require('./receipt-math.js');
const ReceiptLedger = require('./stock-ledger.js');
const ReceiptPair = require('./receipt-pair.js');
const source = fs.readFileSync(__dirname + '/content.js', 'utf8');

// Ishonch dasturidagi (IS_DESKTOP) ketma-ket terish: maqsadga yetguncha inventarizatsiya tartibida, keyingi chek qolgan joydan
function desktop(items) {
  const logs = [];
  const ctx = vm.createContext({ ReceiptMath, ReceiptLedger, ReceiptPair, IS_DESKTOP: true, EARLY_NOTE: 'erta',
    norm: s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(),
    state: { items: [], mode: 'marked', plan: null, perItemLimit: '', badDb: {}, stir: '' },
    log: (text, level) => logs.push({ text, level }), el: () => ({ value: '' }) });
  const inputs = source.slice(source.indexOf('  const parseNumber ='), source.indexOf('  // 1C grid helpers'));
  const math = source.slice(source.indexOf('  const round2 ='), source.indexOf('  // Step 2:'));
  vm.runInContext(inputs + math, ctx);
  ctx.state.items = items.map(i => ReceiptLedger.normalizeItem({ placed: 0, status: 'skip', note: '', rowNumbers: [1], ...i, qty: i.stock }));
  return { ctx, logs, run: e => vm.runInContext(e, ctx) };
}

const inv = () => [
  { name: 'A', stock: 5, price: 20_000_000 },
  { name: 'B', stock: 1, price: 28_000_000 },
  { name: 'C', stock: 1, price: 3_000_000 },
  { name: 'D', stock: 2, price: 10_000_000 },
  { name: 'E', stock: 1, price: 7_000_000 },
];

test('chek maqsadga yetguncha (oshguncha) tovar olinadi, keyingi chek qolgan tovardan davom etadi', () => {
  const h = desktop(inv());
  h.ctx.state.perItemLimit = '';
  h.run('applyPlan(50000000)');
  const qty = () => h.ctx.state.items.map(i => i.qty);
  // A: cheklovsiz, lekin maqsadga yetguncha: 3 × 20 mln = 60 mln ≥ 50 mln (butun qoldiq — 100 mln — olinmaydi)
  assert.deepEqual(qty(), [3, 0, 0, 0, 0]);
  assert.equal(h.ctx.state.seqNext, 1);
  assert.equal(h.ctx.state.plan.sequential, true);
});

test('bir tovardan 1 tadan: 20+28 = 48 mln, keyingisi 3 mln — 51 mln da to‘xtaydi; keyingi chek D dan boshlanadi', () => {
  const h = desktop(inv());
  h.ctx.state.perItemLimit = '1';
  h.run('applyPlan(50000000)');
  assert.deepEqual(h.ctx.state.items.map(i => i.qty), [1, 1, 1, 0, 0]);
  assert.equal(h.ctx.state.plan.total, 51_000_000);
  assert.equal(h.ctx.state.seqNext, 3);
  // keyingi chek (hech narsa o'tkazilmagan deb): D va E, so'ng boshidan A
  h.run('applyPlan(20000000)');
  assert.deepEqual(h.ctx.state.items.map(i => i.qty), [1, 0, 0, 1, 1]);
  assert.equal(h.ctx.state.seqNext, 1);
});

test('chek kam yig‘ilsa (kod yetmadi) keyingi tovarlar qo‘shiladi', () => {
  const h = desktop(inv());
  h.ctx.state.perItemLimit = '1';
  h.run('applyPlan(30000000)'); // A + B = 48 mln
  assert.deepEqual(h.ctx.state.items.map(i => i.qty), [1, 1, 0, 0, 0]);
  // A terildi, B ning kodi chiqmadi
  const [a, b] = h.ctx.state.items;
  ReceiptLedger.commit(a, 1); a.status = 'ok'; b.status = 'kam';
  assert.equal(h.run('topUpSequential()'), true);
  assert.deepEqual(h.ctx.state.items.map(i => i.qty), [1, 1, 1, 1, 0]); // 20 + 3 + 10 = 33 ≥ 30
  assert.equal(h.run('topUpSequential()'), false, 'rejadagilar terilmaguncha qayta qo‘shilmaydi');
});

test('markirovkasiz deb o‘rganilgan tovar rejaga kirmaydi', () => {
  const h = desktop(inv());
  h.ctx.state.perItemLimit = '1';
  h.ctx.state.goodsKind = { b: 'u' };
  h.run('applyPlan(50000000)');
  assert.deepEqual(h.ctx.state.items.map(i => i.qty), [1, 0, 1, 1, 1]); // 20 + 3 + 10 + 7 = 40 < 50, B yo'q
  assert.ok(h.logs.some(l => /markirovkasiz tovar kiritilmadi/.test(l.text)));
});

test('bekor qilingan chek: terilgani qoldiqqa, shu chek kodlari ishlatilmaganlarga qaytadi', () => {
  const start = source.indexOf('  function rollbackReceipt()');
  const ctx = vm.createContext({ state: {
    receiptId: 7, inFlight: { index: 0 }, pendingCodes: ['x'], current: {}, documentNeedsAck: true,
    usedCodes: { old: { receiptId: 3 }, a1: { receiptId: 7 }, a2: { receiptId: 7 } },
    items: [ReceiptLedger.normalizeItem({ name: 'A', stock: 5, qty: 2, placed: 0, status: 'ok' }), ReceiptLedger.normalizeItem({ name: 'B', stock: 1, qty: 0, placed: 0, status: 'skip' })],
  } });
  ReceiptLedger.commit(ctx.state.items[0], 2);
  vm.runInContext(source.slice(start, source.indexOf('  async function clearUnstarted()')), ctx);
  vm.runInContext('rollbackReceipt()', ctx);
  const [a, b] = ctx.state.items;
  assert.equal(a.stock, 5); assert.equal(a.placed, 0); assert.equal(a.deducted, 0); assert.equal(a.totalUsed, 0);
  assert.doesNotThrow(() => ReceiptLedger.normalizeItem({ ...a }));
  assert.equal(b.status, 'skip');
  assert.deepEqual(Object.keys(ctx.state.usedCodes), ['old']);
  assert.equal(ctx.state.inFlight, null);
});
