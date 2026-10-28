const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(__dirname + '/content.js', 'utf8');
function extract(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing source boundaries: ${start} / ${end}`);
  return source.slice(from, to);
}
const functions = extract('  async function enableMarkingMode()', '  const rowsOfItem');

function harness({ selected = false, missing = false, toggles = true, marked = true, onWait = () => {} } = {}) {
  const classes = new Set(selected ? ['checkbox', 'select'] : ['checkbox', 'unselect', 'selectable']);
  const checkbox = {
    get className() { return [...classes].join(' '); },
    id: 'form9_checkbox',
    getAttribute: () => null,
    classList: { contains: name => classes.has(name) },
  };
  const clicks = [];
  const waits = [];
  const ui = { marked, checkbox: missing ? null : checkbox, search: true, prefix: 'form9' };
  const context = vm.createContext({
    chrome: { runtime: { sendMessage: async () => ({ ok: true }) } },
    T: { afterClick: 0, openForm: 1 },
    podborCheckbox: () => ui.checkbox,
    formPrefix: node => node?.id?.match(/^form\d+/)?.[0] || '',
    searchInput: () => ui.search ? {id:ui.prefix + '_search'} : null,
    markingGrid: () => ui.marked ? { id: ui.prefix + '_marked' } : null,
    domClick: node => {
      clicks.push(node);
      assert.equal(node, ui.checkbox);
      if (toggles) classes.has('select') ? classes.delete('select') : classes.add('select');
    },
    sleep: async () => {},
    waitFor: async (predicate, timeout, description) => {
      waits.push(description);
      for (let attempt = 0; attempt < 3; attempt++) {
        onWait({ attempt, classes, ui, checkbox });
        const result = predicate();
        if (result) return result;
      }
      throw new Error('Timeout: ' + description);
    },
  });
  vm.runInContext(functions, context, { filename: 'content.js:podbor-mode' });
  return { clicks, waits, classes, checkbox, run: name => vm.runInContext(`${name}()`, context) };
}

test('marked: selected checkbox avoids toggling and waits for marking grid', async () => {
  const h = harness({ selected: true });
  await h.run('enableMarkingMode');
  assert.equal(h.clicks.length, 0);
  assert.equal(h.waits.length, 1);
});

test('marked: unselect/selectable checkbox clicks exactly once and validates selection', async () => {
  const h = harness();
  await h.run('enableMarkingMode');
  assert.deepEqual(h.clicks, [h.checkbox]);
  assert.equal(h.classes.has('select'), true);
  assert.equal(h.waits.length, 1);
});

test('marked: failed toggle or missing marking grid rejects without retrying click', async () => {
  for (const options of [{ toggles: false }, { marked: false }]) {
    const h = harness(options);
    await assert.rejects(h.run('enableMarkingMode'), /Timeout/);
    assert.equal(h.clicks.length, 1);
  }
});


test('marked: waits for a live enabled replacement before its single click', async () => {
  const h = harness({ missing:true, onWait({attempt,ui,checkbox}) {
    if (attempt === 0) { checkbox.disabled=true; ui.checkbox=checkbox; }
    if (attempt === 1) { ui.checkbox={...checkbox,disabled:false}; }
  }});
  await h.run('enableMarkingMode');
  assert.equal(h.clicks.length,1);
  assert.notEqual(h.clicks[0],h.checkbox);
});

test('marked: delayed selection on replacement never dispatches a second click', async () => {
  const h = harness({toggles:false,onWait({attempt,ui,checkbox,classes}) {
    if (attempt === 1) { ui.checkbox={...checkbox}; classes.add('select'); }
  }});
  await h.run('enableMarkingMode');
  await h.run('enableMarkingMode');
  assert.equal(h.clicks.length,1);
});

test('marked: missing, detached and disabled controls time out without clicking', async () => {
  for (const flag of ['missing','detached','disabled','aria','class']) {
    const h=harness({onWait({ui,checkbox,classes}) {
      if(flag==='missing') ui.checkbox=null;
      if(flag==='detached') checkbox.isConnected=false;
      if(flag==='disabled') checkbox.disabled=true;
      if(flag==='aria') checkbox.getAttribute=()=> 'true';
      if(flag==='class') classes.add('disabled');
    }});
    await assert.rejects(h.run('enableMarkingMode'),/Timeout/);
    assert.equal(h.clicks.length,0);
  }
});

test('marked: selection alone is insufficient without same-form grid and search', async () => {
  for (const flag of ['search','form']) {
    const h=harness({selected:true,onWait({ui}) {
      if(flag==='search') ui.search=false;
      else ui.prefix='form8';
    }});
    await assert.rejects(h.run('enableMarkingMode'),/Timeout/);
    assert.equal(h.clicks.length,0);
  }
});

test('openPodbor waits for live checkbox and clicks opener only for closed dialog',async()=>{
  for(const opened of [false,true]) {
    let ready=opened, clicks=0;
    const ctx=vm.createContext({podborCheckbox:()=>ready?{}:null,salesPodborButton:()=>({}),
      domClick:()=>{clicks++;ready=true;},T:{openForm:100},
      waitFor:async predicate=>{const value=predicate();assert.ok(value);return value;}});
    vm.runInContext(extract('  async function openPodbor()', '  async function enableMarkingMode()'),ctx);
    await vm.runInContext('openPodbor()',ctx);
    assert.equal(clicks,opened?0:1);
  }
});
