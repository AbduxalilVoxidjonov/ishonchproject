// Chrome side panel: shows the panel of the 1C tab next to the page instead of over it.
// content.js in the 1C tab owns all state and logic. This page mirrors the view it renders and sends
// back clicks and typed values; nothing here touches 1C or the saved state.

const VERSION = chrome.runtime.getManifest().version;
const ONE_C = /^http:\/\/tas-1cbuxapp-01\//;
const app = document.getElementById('app');
const statusBox = document.getElementById('status');

let port = null;
let tabId = null;
let clock = null;
let runStatus = 'idle';
let lastTyped = 0;
const lastHtml = new Map();

const showStatus = (text) => {
  statusBox.textContent = text;
  statusBox.hidden = !text;
};

function disconnect() {
  if (!port) return;
  const old = port;
  port = null;
  try { old.disconnect(); } catch { /* already gone */ }
}

async function connect(id) {
  if (port && tabId === id) return;
  disconnect();
  tabId = id;
  showStatus('1C sahifasiga ulanmoqda…');
  try {
    // Loads the current content scripts into the tab when it still runs an old build (or none)
    const res = await chrome.runtime.sendMessage({ type: 'ensureContent', tabId: id });
    if (!res?.ok) throw new Error(res?.error || 'javob yo‘q');
  } catch (e) {
    if (tabId === id) showStatus(`1C sahifasiga ulanib bo‘lmadi: ${e.message}. Sahifani yangilang (F5).`);
    return;
  }
  if (tabId !== id || port) return;
  const p = chrome.tabs.connect(id, { name: 'mk-panel' });
  port = p;
  p.onMessage.addListener((msg) => { if (port === p) onPanelMessage(msg); });
  p.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    if (port !== p) return;
    port = null;
    showStatus('1C sahifasi bilan aloqa uzildi — qayta ulanmoqda…');
    setTimeout(() => { if (!port) pickTab(); }, 1500);
  });
}

/** The active tab when it is 1C; otherwise keep showing the 1C tab already connected (the run goes on there). */
// Opened as a separate window (browsers without a side panel): bound to the 1C tab given in the address
const pinnedTab = Number(new URLSearchParams(location.search).get('tab')) || null;

async function pickTab() {
  if (pinnedTab) {
    const tab = await chrome.tabs.get(pinnedTab).catch(() => null);
    if (tab && ONE_C.test(tab.url || '')) return connect(tab.id);
    if (port) return;
    tabId = null;
    app.innerHTML = '';
    lastHtml.clear();
    return showStatus('1C tabi yopilgan yoki boshqa sahifaga o‘tgan. Panelni 1C tabidan qayta oching.');
  }
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (active && ONE_C.test(active.url || '')) return connect(active.id);
  if (port) return;
  if (tabId != null) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab && ONE_C.test(tab.url || '')) return connect(tab.id);
  }
  tabId = null;
  app.innerHTML = '';
  lastHtml.clear();
  showStatus('1C sahifasini oching: http://tas-1cbuxapp-01/ — panel shu yerda chiqadi.');
}

function onPanelMessage(msg) {
  if (msg?.version !== VERSION) {
    showStatus('1C sahifasidagi panel boshqa versiyada. 1C sahifasini yangilang (F5).');
    return;
  }
  if (msg.type === 'template') {
    app.innerHTML = msg.html;
    lastHtml.clear();
    showStatus('');
  } else if (msg.type === 'view') {
    applyView(msg);
  }
}

function applyView(view) {
  clock = view.clock || null;
  runStatus = view.status;
  for (const [name, v] of Object.entries(view.els || {})) {
    const node = app.querySelector(`[data-el="${name}"]`);
    if (!node) continue;
    node.hidden = !!v.hidden;
    if (node.tagName === 'INPUT') {
      node.disabled = !!v.disabled;
      // Never overwrite what the user is typing right now
      const typing = document.activeElement === node && Date.now() - lastTyped < 1500;
      if (!typing && node.value !== v.value) {
        node.value = v.value;
        if (name === 'target' && document.activeElement !== node) groupThousands(node);
      }
      continue;
    }
    if (v.style !== undefined) {
      if (v.style) node.setAttribute('style', v.style);
      else node.removeAttribute('style');
    }
    if (v.html === undefined || lastHtml.get(name) === v.html) continue;
    lastHtml.set(name, v.html);
    node.innerHTML = v.html;
    if (name === 'log') node.scrollTop = node.scrollHeight;
    if (name === 'list') node.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
  }
  for (const [name, v] of Object.entries(view.buttons || {})) {
    const b = app.querySelector(`[data-a="${name}"]`);
    if (!b) continue;
    if (b.textContent !== v.text) b.textContent = v.text;
    b.disabled = !!v.disabled;
    b.hidden = !!v.hidden;
  }
  tickClock();
}

function tickClock() {
  const node = app.querySelector('[data-el="clock"]');
  if (!node || !clock) return;
  node.textContent = globalThis.WorkClock.text(clock, runStatus);
  lastHtml.delete('clock');
}
setInterval(tickClock, 1000);

app.addEventListener('click', (e) => {
  const target = e.target.closest('[data-a]');
  if (!target || target.disabled || !port) return;
  port.postMessage({ type: 'click', a: target.dataset.a });
});
// Summa yozilayotganda minglarga ajratiladi: 100000000 → 100 000 000 (kursor raqamlar orasidagi joyida qoladi)
function groupThousands(input) {
  const raw = input.value;
  const caret = input.selectionStart ?? raw.length;
  const before = raw.slice(0, caret).replace(/[^\d.,]/g, '').length;
  const s = raw.replace(/[\s ]/g, '').replace('.', ',');
  const comma = s.indexOf(',');
  let int = (comma >= 0 ? s.slice(0, comma) : s).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const frac = comma >= 0 ? ',' + s.slice(comma + 1).replace(/\D/g, '').slice(0, 2) : '';
  if (!int && frac) int = '0';
  const out = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + frac;
  if (out === raw) return;
  input.value = out;
  let pos = 0;
  for (let seen = 0; pos < out.length && seen < before; pos++) if (/[\d,]/.test(out[pos])) seen++;
  input.setSelectionRange(pos, pos);
}

app.addEventListener('input', (e) => {
  const name = e.target.dataset?.el;
  if (!name || e.target.tagName !== 'INPUT' || !port) return;
  if (name === 'target') groupThousands(e.target);
  lastTyped = Date.now();
  port.postMessage({ type: 'input', name, value: e.target.value });
});

// Enter in a field with data-enter presses that button (a scanner ends a code with Enter)
app.addEventListener('keydown', (e) => {
  const a = e.target.dataset?.enter;
  if (e.key !== 'Enter' || !a || !port) return;
  e.preventDefault();
  lastTyped = 0; // typing is finished: the panel may clear the field after the check
  // The typed value must reach the panel model before the click
  port.postMessage({ type: 'input', name: e.target.dataset.el, value: e.target.value });
  port.postMessage({ type: 'click', a });
});

chrome.tabs.onActivated.addListener(() => pickTab());
chrome.tabs.onUpdated.addListener((id, info) => {
  // A reloaded 1C page gets a new content script: connect to it once it has loaded
  if (info.status === 'complete' && (!port || id !== tabId)) pickTab();
});
pickTab();
