const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness({ cold = false, oldVersion = false, wrongAfterInject = false } = {}) {
  let injected = false;
  const warnings = [];
  const listeners = {};
  const calls = [];
  const page = vm.createContext({});
  const event = name => ({ addListener(listener) { listeners[name] = listener; } });
  const panelBehavior = [];
  const chrome = {
    sidePanel: { async setPanelBehavior(value) { panelBehavior.push(JSON.parse(JSON.stringify(value))); } },
    debugger: { onDetach: event('detach') },
    runtime: { onMessage: event('message'), getManifest: () => require('./manifest.json') },
    tabs: {
      async sendMessage(tabId, message) {
        calls.push({ type: 'message', tabId, message: { ...message } });
        if (!injected && cold) throw new Error('No receiver');
        if ((!injected && oldVersion) || (injected && wrongAfterInject)) return { version: '0.9.3' };
        return { version: require('./manifest.json').version };
      },
    },
    scripting: {
      async executeScript({ target, files }) {
        calls.push({ type: 'inject', tabId: target.tabId, files: Array.from(files) });
        injected = true;
        for (const file of files) {
          if (file === 'content.js') {
            // At content-script entry the helper must already be usable in the same world.
            const qty = vm.runInContext("ReceiptMath.parseNumber('101.0000')", page);
            assert.equal(qty, 101);
            assert.ok(Number.isFinite(qty));
            assert.equal(vm.runInContext("typeof ReceiptLedger.commit", page), "function");
            assert.equal(vm.runInContext("typeof ReceiptMarkup.apply", page), "function");
          } else {
            vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), page, { filename: file });
          }
        }
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8'), {
    chrome, setTimeout,
    console: { warn(...args) { warnings.push(args.join(' ')); } },
  }, { filename: 'background.js' });
  // What the side panel does before connecting
  const ensure = (tabId, sender = {}) => new Promise(resolve => {
    const async = listeners.message({ type: 'ensureContent', tabId }, sender, value => resolve(JSON.parse(JSON.stringify(value))));
    if (!async) resolve('sync');
  });
  return { listeners, calls, page, warnings, panelBehavior, ensure };
}

test('toolbar icon opens the Chrome side panel', () => {
  const { panelBehavior, listeners } = harness();
  assert.deepEqual(panelBehavior, [{ openPanelOnActionClick: true }]);
  assert.equal(listeners.click, undefined);
});

test('cold tab gets every module injected in manifest order before the side panel connects', async () => {
  const { calls, page, ensure } = harness({ cold: true });
  assert.deepEqual(await ensure(42), { ok: true });
  assert.deepEqual(calls, [
    { type: 'message', tabId: 42, message: { type: 'mkVersion' } },
    { type: 'inject', tabId: 42, files: require('./manifest.json').content_scripts[0].js },
    { type: 'message', tabId: 42, message: { type: 'mkVersion' } },
  ]);
  assert.equal(vm.runInContext("ReceiptMath.parseNumber('101.0000')", page), 101);
  assert.equal(vm.runInContext("typeof WorkClock.text", page), 'function');
});

test('current content is left alone', async () => {
  const { calls, ensure } = harness();
  assert.deepEqual(await ensure(42), { ok: true });
  assert.deepEqual(calls, [{ type: 'message', tabId: 42, message: { type: 'mkVersion' } }]);
});

test('responding stale receiver is replaced', async () => {
  const { calls, ensure } = harness({ oldVersion: true });
  assert.deepEqual(await ensure(42), { ok: true });
  assert.equal(calls.filter(c => c.type === 'inject').length, 1);
});

test('concurrent requests share one replacement injection', async () => {
  const { calls, ensure } = harness({ cold: true });
  await Promise.all([ensure(42), ensure(42)]);
  assert.equal(calls.filter(c => c.type === 'inject').length, 1);
});

test('content scripts and malformed requests cannot ask for injection', async () => {
  const { calls, ensure } = harness({ cold: true });
  assert.equal(await ensure(42, { tab: { id: 42 } }), 'sync');
  assert.equal(await ensure('42'), 'sync');
  assert.deepEqual(calls, []);
});

test('obsolete content cannot send trusted input to the new background', () => {
  const { listeners, calls } = harness();
  for (const version of [undefined, '0.9.3']) {
    let response;
    const result = listeners.message({ type:'cdp', version, action:{type:'text',text:'1'} }, {tab:{id:42}}, value => { response=value; });
    assert.equal(result,false);
    assert.equal(response.ok,false);
    assert.match(response.error,/Eski extension/);
  }
  assert.deepEqual(calls,[]);
});

test('failed new-version handshake reports failure instead of silently using the old panel', async () => {
  const { calls, ensure } = harness({ cold: true, wrongAfterInject: true });
  const response = await ensure(42);
  assert.equal(calls.filter(c => c.type === 'inject').length, 1);
  assert.equal(response.ok, false);
  assert.match(response.error, /Yangi panel javob bermadi/);
});
