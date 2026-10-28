// Real (trusted) input for the 1C web client.
// 1C ignores synthetic keyboard events from page scripts, so typing, Enter and grid navigation go through
// the Chrome DevTools Protocol (chrome.debugger). Coordinates are CSS pixels of the page viewport,
// exactly what getBoundingClientRect() returns in the content script (browser zoom must be 100%).

const PROTOCOL_VERSION = '1.3';
const attached = new Set();

const send = (tabId, method, params = {}) => chrome.debugger.sendCommand({ tabId }, method, params);

// Runs in the 1C page itself (MAIN world): 1C must keep working while its tab is in the background
// or another window is in front. The page is told it is visible, and requestAnimationFrame — which a
// hidden tab never fires — falls back to a timer while the tab is really hidden.
function keepPageActive() {
  if (window.__mkKeepActive) return;
  window.__mkKeepActive = true;
  const proto = Document.prototype;
  const realHidden = Object.getOwnPropertyDescriptor(proto, 'hidden')?.get;
  const isReallyHidden = () => (realHidden ? realHidden.call(document) : false);
  try {
    Object.defineProperty(proto, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(proto, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(proto, 'webkitHidden', { configurable: true, get: () => false });
    Object.defineProperty(proto, 'webkitVisibilityState', { configurable: true, get: () => 'visible' });
  } catch {
    /* keep the defaults */
  }
  // The app must not switch itself into "background" mode
  document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
  document.addEventListener('webkitvisibilitychange', (e) => e.stopImmediatePropagation(), true);
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  // Timer-based frames get negative ids so they never collide with real ones
  window.requestAnimationFrame = (cb) => (isReallyHidden() ? -setTimeout(() => cb(performance.now()), 16) : raf(cb));
  window.cancelAnimationFrame = (id) => (id < 0 ? clearTimeout(-id) : caf(id));
}

async function ensureAttached(tabId) {
  if (attached.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
  } catch (e) {
    // Already attached by us in an earlier service-worker life is fine
    if (!String(e && e.message).includes('Already attached')) throw e;
  }
  attached.add(tabId);
  // Keep working while the user is in another tab or window:
  //  • the page keeps "focus" (1C would otherwise close its editors on blur),
  //  • the tab is not frozen or discarded, and 1C is told it is visible
  await send(tabId, 'Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await send(tabId, 'Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: keepPageActive }).catch(() => {});
}

chrome.debugger.onDetach.addListener(({ tabId }, reason) => {
  attached.delete(tabId);
  // The user closed the "is debugging this browser" bar or the tab went away: let the panel pause itself
  if (tabId) chrome.tabs.sendMessage(tabId, { type: 'debuggerDetached', reason }).catch(() => {});
});

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  Home: { key: 'Home', code: 'Home', keyCode: 36 },
  End: { key: 'End', code: 'End', keyCode: 35 },
  F2: { key: 'F2', code: 'F2', keyCode: 113 },
  a: { key: 'a', code: 'KeyA', keyCode: 65 },
};

// CDP modifier bits: Alt=1, Ctrl=2, Meta=4, Shift=8
async function pressKey(tabId, name, modifiers = 0) {
  const k = KEYS[name];
  if (!k) throw new Error(`Noma’lum tugma: ${name}`);
  const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode, modifiers };
  const down = { type: k.text && !modifiers ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text && !modifiers ? { text: k.text, unmodifiedText: k.text } : {}) };
  // macOS: Cmd+A as a key event does not select by itself — ask for the editing command explicitly
  if (name === 'a' && modifiers & 4) down.commands = ['selectAll'];
  await send(tabId, 'Input.dispatchKeyEvent', down);
  await send(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

// 1C tracks the text of its inputs from keypress events, so text is typed one character at a time
// (Input.insertText only changes the DOM value and 1C then searches with the old, empty text).
async function typeChars(tabId, text) {
  for (const ch of text) {
    const code = ch === ' ' ? 'Space' : /[0-9]/.test(ch) ? `Digit${ch}` : '';
    const keyCode = /[0-9]/.test(ch) ? 48 + Number(ch) : ch === ' ' ? 32 : 0;
    const base = { key: ch, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
    await send(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, ...base });
    await send(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
}

async function click(tabId, x, y, clickCount = 1) {
  await send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  for (let i = 1; i <= clickCount; i++) {
    await send(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: i });
    await send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: i });
  }
}

async function run(tabId, a) {
  await ensureAttached(tabId);
  switch (a.type) {
    case 'click':
      return click(tabId, a.x, a.y, a.count || 1);
    case 'move':
      return send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
    case 'text':
      return typeChars(tabId, a.text);
    case 'key':
      return pressKey(tabId, a.key, a.modifiers || 0);
    case 'selectAll':
      // Ctrl+A on Windows/Linux, Cmd+A on macOS
      return pressKey(tabId, 'a', a.mac ? 4 : 2);
    case 'detach':
      if (attached.has(tabId)) {
        attached.delete(tabId);
        await chrome.debugger.detach({ tabId }).catch(() => {});
      }
      await chrome.tabs.update(tabId, { autoDiscardable: true }).catch(() => {});
      return;
    default:
      throw new Error(`Noma’lum buyruq: ${a.type}`);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Timers of a background tab are throttled (down to once a minute); the service worker's are not,
  // so the content script waits through here
  if (msg?.type === 'sleep') {
    setTimeout(() => reply({ ok: true }), Math.max(0, Math.min(msg.ms || 0, 60000)));
    return true;
  }
  // Only the extension's own pages (the side panel) may ask for content to be loaded
  if (msg?.type === 'ensureContent') {
    if (sender.tab || !Number.isInteger(msg.tabId)) return false;
    ensureContent(msg.tabId)
      .then(() => reply({ ok: true }))
      .catch((e) => reply({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  // «To‘liq to‘xtatish»: the page retired its panel. Drop the debugger (a command stuck in it ends
  // too) and load a fresh panel, which starts from the clean saved state
  if (msg?.type === 'restartContent') {
    const tabId = sender.tab?.id;
    if (!tabId) return false;
    (async () => {
      attached.delete(tabId);
      await chrome.debugger.detach({ tabId }).catch(() => {});
      await chrome.tabs.update(tabId, { autoDiscardable: true }).catch(() => {});
      await ensureContent(tabId);
    })().then(() => reply({ ok: true }), (e) => reply({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type !== 'cdp' || !sender.tab?.id) return false;
  if (msg.version !== chrome.runtime.getManifest().version) {
    reply({ ok: false, error: 'Eski extension kodi to‘xtatildi. Toolbar ikonkasini bosib yangi panelni oching.' });
    return false;
  }
  run(sender.tab.id, msg.action)
    .then(() => reply({ ok: true }))
    .catch((e) => reply({ ok: false, error: String(e?.message || e) }));
  return true; // async reply
});

// The toolbar icon opens the Chrome side panel (sidepanel.html), which shows the panel of the 1C tab
// Edge has the same API. Browsers without it (Yandex, older Chromium builds) get the same panel in a small
// window pinned to the 1C tab it was opened from.
if (typeof chrome.sidePanel?.setPanelBehavior === 'function') {
  Promise.resolve(chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })).catch(() => {});
} else {
  const panelWindows = new Map(); // 1C tab id → panel window id
  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab?.id) return;
    const known = panelWindows.get(tab.id);
    if (known != null && await chrome.windows.update(known, { focused: true }).then(() => true, () => false)) return;
    const win = await chrome.windows.create({ url: chrome.runtime.getURL(`sidepanel.html?tab=${tab.id}`), type: 'popup', width: 440, height: 820 });
    panelWindows.set(tab.id, win.id);
  });
  chrome.windows.onRemoved.addListener((id) => {
    for (const [tabId, windowId] of panelWindows) if (windowId === id) panelWindows.delete(tabId);
  });
}

// The side panel asks for this before connecting. A responding receiver can still be the previous
// build, so the version is probed; an old or missing one is replaced by every module of the manifest.
const contentLoads = new Map();
function ensureContent(tabId) {
  if (contentLoads.has(tabId)) return contentLoads.get(tabId);
  const task = (async () => {
    const version = chrome.runtime.getManifest().version;
    let current;
    try { current = await chrome.tabs.sendMessage(tabId, { type: 'mkVersion' }); } catch { /* no live receiver */ }
    if (current?.version === version) return;
    const files = chrome.runtime.getManifest().content_scripts[0].js;
    await chrome.scripting.executeScript({ target: { tabId }, files });
    const response = await chrome.tabs.sendMessage(tabId, { type: 'mkVersion' });
    if (response?.version !== version) throw new Error('Yangi panel javob bermadi; extension va 1C sahifasini yangilang.');
  })().finally(() => contentLoads.delete(tabId));
  contentLoads.set(tabId, task);
  return task;
}
