// "chrome.*" o'rnini bosuvchi ko'prik: Chrome kengaytmasi uchun yozilgan content.js / sidepanel.js /
// MXIK content.js o'zgarishsiz ishlashi uchun WebView2 xabarlari (chrome.webview) ustiga quriladi.
// C# tomoni boshida `const __MODE__ = '...'; const __VERSION__ = '...';` qo'shadi.
//   page  — 1C sahifasi (content.js shu yerda ishlaydi)
//   panel — dasturning yon paneli (sidepanel.js)
//   soliq — my.soliq.uz sahifasi (MXIK content.js: markirovka tarixi qidiruvi)
(() => {
  const wv = window.chrome && window.chrome.webview;
  if (!wv) return;
  const chromeObj = window.chrome;
  const post = (m) => wv.postMessage(m);

  let seq = 0;
  const pending = new Map();
  const messageListeners = new Set();
  const connectListeners = new Set();
  const ports = new Map(); // portId -> { onMsg, onDisc }

  const rpc = (msg) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    post({ kind: 'rpc', id, msg });
  });

  const makePort = (id, name) => {
    const onMsg = new Set();
    const onDisc = new Set();
    ports.set(id, { onMsg, onDisc });
    return {
      name,
      sender: {},
      onMessage: { addListener: (f) => onMsg.add(f), removeListener: (f) => onMsg.delete(f) },
      onDisconnect: { addListener: (f) => onDisc.add(f), removeListener: (f) => onDisc.delete(f) },
      postMessage: (data) => post({ kind: 'port', portId: id, data }),
      disconnect: () => {
        if (!ports.has(id)) return;
        ports.delete(id);
        post({ kind: 'portClose', portId: id });
      },
    };
  };

  const runtime = {
    id: 'ishonch-desktop',
    lastError: undefined,
    getManifest: () => ({ version: __VERSION__ }),
    onMessage: { addListener: (f) => messageListeners.add(f), removeListener: (f) => messageListeners.delete(f) },
    onConnect: { addListener: (f) => connectListeners.add(f), removeListener: (f) => connectListeners.delete(f) },
    // sendMessage(msg) -> Promise, sendMessage(extId, msg, cb) yoki sendMessage(msg, cb)
    sendMessage: (a, b, c) => {
      let msg = a;
      let cb = null;
      if (typeof a === 'string') { msg = b; cb = c; } else if (typeof b === 'function') cb = b;
      const promise = rpc(msg);
      if (!cb) return promise;
      promise.then((reply) => { runtime.lastError = undefined; cb(reply); });
      return undefined;
    },
  };
  chromeObj.runtime = runtime;

  chromeObj.storage = {
    local: {
      get: (keys) => rpc({ type: 'storageGet', keys }),
      set: async (obj) => { await rpc({ type: 'storageSet', obj }); },
    },
  };

  if (__MODE__ === 'panel') {
    // Yon panel bitta 1C tabini ko'radi; sidepanel.js tab so'rovlarini shu yerdan oladi
    const tab = { id: 1, active: true, url: 'http://tas-1cbuxapp-01/' };
    chromeObj.tabs = {
      query: async () => [tab],
      get: async () => tab,
      onActivated: { addListener() {} },
      onUpdated: { addListener() {} },
      connect: (_id, info) => {
        const id = ++seq;
        const port = makePort(id, (info && info.name) || '');
        post({ kind: 'connectRequest', portId: id, name: port.name });
        return port;
      },
    };
  }

  wv.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    switch (m.kind) {
      case 'rpcReply': {
        const resolve = pending.get(m.id);
        pending.delete(m.id);
        if (resolve) resolve(m.data);
        break;
      }
      case 'connect': {
        const port = makePort(m.portId, m.name);
        for (const f of connectListeners) f(port);
        break;
      }
      case 'port': {
        const p = ports.get(m.portId);
        if (p) for (const f of [...p.onMsg]) f(m.data);
        break;
      }
      case 'portClose': {
        const p = ports.get(m.portId);
        ports.delete(m.portId);
        if (p) for (const f of [...p.onDisc]) f();
        break;
      }
      case 'dispatch': {
        // C# dan sahifadagi onMessage tinglovchilariga xabar (javob bilan)
        let replied = false;
        const respond = (data) => {
          if (replied) return;
          replied = true;
          post({ kind: 'dispatchReply', id: m.id, data });
        };
        let isAsync = false;
        for (const f of messageListeners) {
          try { if (f(m.msg, {}, respond) === true) isAsync = true; } catch (err) { respond({ error: String(err) }); }
        }
        if (!isAsync) respond(undefined);
        break;
      }
    }
  });
})();
