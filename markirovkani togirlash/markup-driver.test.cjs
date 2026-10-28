const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('./markup-driver.js');

function harness({ open = false, stuck = false, wrong = false, missing, changeOnSubmit = false } = {}) {
  const nodes = [];
  function node(id, tagName = 'SPAN', textContent = '', parent = null) {
    const n = { id, tagName, textContent, parent, value: '', visible: true, classes: new Set(),
      querySelectorAll() { return nodes.filter(child => { let p = child.parent; while (p) { if (p === n) return true; p = p.parent; } return false; }); } };
    n.classList = { contains: cls => n.classes.has(cls) };
    nodes.push(n);
    return n;
  }
  const toolbar = node('form7_ТоварыЗаполнить', 'A');
  const menu = node('form7_ТоварыЗаполнить_submenu'); menu.visible = false;
  const wrapper = node('', 'DIV', 'Заполнить цены (себестоимость + %)', menu);
  const item = node('', 'SPAN', '  Заполнить цены\n(себестоимость + %) ', wrapper);
  const decoy = node('', 'SPAN', item.textContent);
  const input = node('form23_ПроцентНаценки_i0', 'INPUT'); input.value = '0.000';
  const rounding = node('form23_ПорядокОкругления_i0', 'INPUT'); rounding.value = '1';
  const dropdown = node('form23_ПорядокОкругления_DLB');
  const up = node('form23_ВсегдаВБольшуюСторону', 'DIV'); up.classes.add('select');
  const submit = node('form23_ФормаЗаполнить');
  const dialog = [input, rounding, dropdown, up, submit]; dialog.forEach(n => n.visible = open);
  const hiddenOption = node('', 'SPAN', '0.01'); hiddenOption.visible = false;
  const option = node('', 'SPAN', '0.01'); option.visible = false;
  const total = node('form7_ИтогиВсего_i0', 'INPUT'); total.value = '1234.56';
  node('form8_ИтогиВсего_i0', 'INPUT').value = '999';
  let submissions = 0; let changed = false;
  const clicks = []; const actions = [];
  const document = {
    getElementById: id => nodes.find(n => n.id === id && n !== missingNode()),
    querySelectorAll: selector => selector === '*' ? nodes : nodes.filter(n => n.tagName === 'INPUT' && n.id.endsWith('_ПроцентНаценки_i0')),
  };
  function missingNode() { return ({ rounding, dropdown, up, submit })[missing]; }
  const adapter = {
    document, mac: true, isVisible: n => !!n?.visible,
    parseNumber: value => Number(String(value).replace(',', '.')),
    assertDocument: () => wrong || changed ? 'form99' : 'form7',
    realClick: async n => { document.activeElement = n; },
    cdp: async action => { actions.push(action); if (action.type === 'text') document.activeElement.value = action.text; },
    sleep: async () => {},
    waitFor: async (fn, timeout, what) => { const result = fn(); if (!result) throw new Error('Timeout: ' + what); return result; },
    domClick: async n => {
      clicks.push(n);
      if (n === toolbar) menu.visible = true;
      if (n === item) { menu.visible = false; dialog.forEach(n => n.visible = true); }
      if (n === dropdown) option.visible = true;
      if (n === option) { rounding.value = '0.01'; option.visible = false; }
      if (n === up) up.classes.delete('select');
      if (n === submit) { submissions++; if (!stuck) nodes.filter(n => n.id.startsWith('form23_')).forEach(n => n.visible = false); }
      if (changeOnSubmit && n === up) changed = true;
    },
  };
  return { node, nodes, adapter, input, rounding, up, submit, toolbar, item, wrapper, decoy, clicks, actions,
    submissions: () => submissions };
}
const run = (h, percent = 12.5) => api.apply({ prefix: 'form7', percent }, h.adapter);

test('browser global and CommonJS expose apply', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(__dirname + '/markup-driver.js', 'utf8'), context);
  assert.equal(typeof context.ReceiptMarkup.apply, 'function');
  assert.equal(typeof api.apply, 'function');
});
test('opens exact submenu leaf, commits percentage with Tab and verifies rounding and round-up', async () => {
  const h = harness();
  assert.deepEqual(await run(h), { percent: 12.5, rounding: 0.01, total: 1234.56 });
  assert.equal(h.input.value, '12.5');
  assert.equal(h.rounding.value, '0.01');
  assert.equal(h.up.classList.contains('select'), false);
  assert.ok(h.clicks.includes(h.item));
  assert.ok(!h.clicks.includes(h.decoy) && !h.clicks.includes(h.wrapper));
  assert.deepEqual(h.actions, [{type:'selectAll',mac:true},{type:'text',text:'12.5'},{type:'key',key:'Tab'}]);
  assert.equal(h.submissions(), 1);
});
test('reuses existing dynamic dialog and accepts zero percent and zero total', async () => {
  const h = harness({open:true});
  h.adapter.document.getElementById('form7_ИтогиВсего_i0').value = '0';
  assert.deepEqual(await run(h, 0), {percent:0,rounding:0.01,total:0});
  assert.ok(!h.clicks.includes(h.toolbar));
});
test('invalid percentage never edits or submits', async () => {
  for (const percent of ['', 'bad', NaN, Infinity, -1, null, true, {}]) {
    const h = harness(); await assert.rejects(run(h, percent), /Invalid/);
    assert.equal(h.submissions(),0); assert.equal(h.clicks.length,0);
  }
});
test('missing controls prevent editing and submission', async () => {
  for (const missing of ['rounding','dropdown','up','submit']) {
    const h = harness({open:true,missing});
    await assert.rejects(run(h), /Missing/);
    assert.equal(h.actions.length,0); assert.equal(h.submissions(),0);
  }
});
test('wrong document initially or before submission blocks submit', async () => {
  for (const options of [{wrong:true},{open:true,changeOnSubmit:true}]) {
    const h = harness(options); await assert.rejects(run(h), /Wrong/); assert.equal(h.submissions(),0);
  }
});
test('percentage not committed cannot submit', async () => {
  const h = harness({open:true}); h.adapter.cdp = async () => {};
  await assert.rejects(run(h), /percentage validation/); assert.equal(h.submissions(),0);
});
test('rounding selection must update actual input', async () => {
  const h = harness({open:true}); const click = h.adapter.domClick;
  h.adapter.domClick = n => n.textContent === '0.01' ? undefined : click(n);
  await assert.rejects(run(h), /rounding validation/); assert.equal(h.submissions(),0);
});
test('round-up must actually clear', async () => {
  const h = harness({open:true}); const click = h.adapter.domClick;
  h.adapter.domClick = n => n === h.up ? undefined : click(n);
  await assert.rejects(run(h), /round-up disabled/); assert.equal(h.submissions(),0);
});
test('submit timeout has unknown outcome and never retries', async () => {
  const h = harness({stuck:true});
  await assert.rejects(run(h), error => error.code === 'MARKUP_SUBMIT_UNKNOWN');
  assert.equal(h.submissions(),1);
});
test('invalid exact realization total rejects after application', async () => {
  const h = harness(); h.adapter.document.getElementById('form7_ИтогиВсего_i0').value = '-1';
  await assert.rejects(run(h), /grand total/);
});

function replaceInput(h, value, prefix = 'form23') {
  const old = h.adapter.document.querySelectorAll('input').find(n => n.visible);
  old.visible = false;
  h.nodes.splice(h.nodes.indexOf(old), 1);
  const fresh = h.node(`${prefix}_ПроцентНаценки_i0`, 'INPUT');
  fresh.value = value;
  return fresh;
}

test('waits for focus before keyboard input, using default or adapter timeout', async () => {
  for (const timeout of [undefined, 27000]) {
    const h = harness(); h.adapter.timeout = timeout;
    h.adapter.realClick = async () => {};
    const wait = h.adapter.waitFor;
    h.adapter.waitFor = async (fn, ms, what) => {
      assert.equal(ms, timeout ?? 15000);
      if (what === 'markup input focus') {
        assert.equal(fn(), false);
        assert.equal(h.actions.length, 0);
        h.adapter.document.activeElement = h.input;
      }
      return wait(fn, ms, what);
    };
    await run(h);
  }
});

test('failed focus or focus lost after select-all never types into a goods row', async () => {
  for (const lostAfterSelect of [false, true]) {
    const h = harness();
    const goods = h.node('form7_Товары_row1', 'INPUT'); goods.value = 'goods';
    if (!lostAfterSelect) h.adapter.realClick = async () => { h.adapter.document.activeElement = goods; };
    const cdp = h.adapter.cdp;
    h.adapter.cdp = async action => {
      await cdp(action);
      if (lostAfterSelect && action.type === 'selectAll') h.adapter.document.activeElement = goods;
    };
    await assert.rejects(run(h), /focus/);
    assert.ok(!h.actions.some(a => a.type === 'text'));
    assert.equal(goods.value, 'goods');
    assert.equal(h.submissions(), 0);
  }
});

test('Tab rerender validates fresh percentage and rejects stale successful value', async () => {
  for (const value of ['12.500', '0.000']) {
    const h = harness(); const cdp = h.adapter.cdp;
    h.adapter.cdp = async action => {
      await cdp(action);
      if (action.key === 'Tab') replaceInput(h, value);
    };
    if (value === '12.500') await run(h);
    else {
      await assert.rejects(run(h), /percentage validation/);
      assert.equal(h.submissions(), 0);
    }
  }
});

test('different dialog prefix after Tab blocks submission', async () => {
  const h = harness(); const cdp = h.adapter.cdp;
  h.adapter.cdp = async action => {
    await cdp(action);
    if (action.key === 'Tab') replaceInput(h, '12.5', 'form99');
  };
  await assert.rejects(run(h), /dialog changed/);
  assert.equal(h.submissions(), 0);
});

test('submit rerender with live percentage field is not dialog closure', async () => {
  const h = harness({stuck:true}); const click = h.adapter.domClick;
  h.adapter.domClick = async n => {
    // Replace before normal submit hides only the old nodes.
    if (n === h.submit) replaceInput(h, '12.5');
    await click(n);
  };
  await assert.rejects(run(h), error => error.code === 'MARKUP_SUBMIT_UNKNOWN');
  assert.equal(h.submissions(), 1);
});

test('waits for complete dialog controls and freshly available grand total', async () => {
  const h = harness({open:true});
  h.rounding.visible = false;
  const total = h.adapter.document.getElementById('form7_ИтогиВсего_i0');
  total.value = '';
  const wait = h.adapter.waitFor;
  h.adapter.waitFor = async (fn, ms, what) => {
    if (what.includes('dialog ready') && !h.rounding.visible) {
      assert.equal(fn(), null);
      assert.equal(h.actions.length, 0);
      h.rounding.visible = true;
    }
    if (what === 'realization grand total ready') {
      assert.equal(fn(), null);
      total.value = 'NaN'; assert.equal(fn(), null);
      total.value = '4321.00';
    }
    return wait(fn, ms, what);
  };
  assert.equal((await run(h)).total, 4321);
});

test('exact global fill applies both goods markers without row editing or Save/Post', async () => {
  const h = harness();
  const rows = [h.node('form7_Товары_row1'), h.node('form7_Товары_row2')];
  const decoySubmit = h.node('form99_ФормаЗаполнить');
  const save = h.node('form7_ФормаЗаписать');
  const post = h.node('form7_ФормаПровести');
  const click = h.adapter.domClick;
  h.adapter.domClick = async n => {
    if (n === h.submit) rows.forEach(row => { row.appliedPercent = Number(h.adapter.document.getElementById('form23_ПроцентНаценки_i0').value); });
    await click(n);
  };
  await run(h);
  assert.deepEqual(rows.map(row => row.appliedPercent), [12.5, 12.5]);
  assert.equal(h.clicks.filter(n => n === h.submit).length, 1);
  assert.ok(![...rows, decoySubmit, save, post].some(n => h.clicks.includes(n)));
});
