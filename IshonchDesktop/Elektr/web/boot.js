// Elektr sahifasi uchun "qatlam":
//  1) hostRpc(msg)  — C# bilan aloqa (WebView2 xabarlari).
//  2) fetch()       — cabinet-api.het.uz ga so'rovlar brauzerda CORS bilan to'silgani uchun C# orqali yuboriladi.
//                     Shu sababli elektr/parallel-app dagi het.js / convert.js / engine.js (Node uchun yozilgan)
//                     o'zgarishsiz ishlaydi.
//  3) CommonJS yuklagich — shu uchta modulni require() bilan ishlatish uchun.
(() => {
  'use strict';
  const wv = window.chrome && window.chrome.webview;
  if (!wv) throw new Error('WebView2 topilmadi');

  let seq = 0;
  const pending = new Map();
  window.hostRpc = (msg) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    wv.postMessage({ kind: 'rpc', id, msg });
  });
  wv.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.kind !== 'rpcReply') return;
    const done = pending.get(m.id);
    pending.delete(m.id);
    if (done) done(m.data);
  });

  // ---- fetch ko'prigi ------------------------------------------------------------------------
  const realFetch = window.fetch.bind(window);
  const abortError = () => Object.assign(new Error('Bekor qilindi'), { name: 'AbortError' });
  window.fetch = (url, init = {}) => {
    const u = String(url);
    if (!/^https?:\/\//i.test(u) || /^https:\/\/ishonch\.elektr\//i.test(u)) return realFetch(url, init); // o'z resurslarimiz
    return new Promise((resolve, reject) => {
      const signal = init.signal;
      if (signal && signal.aborted) return reject(abortError());
      let finished = false;
      const onAbort = () => { if (!finished) { finished = true; reject(abortError()); } };
      if (signal) signal.addEventListener('abort', onAbort);
      window.hostRpc({
        type: 'http', method: init.method || 'GET', url: u,
        headers: init.headers || {}, body: init.body == null ? null : String(init.body),
      }).then((r) => {
        if (finished) return;
        finished = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        if (!r || r.error) return reject(new TypeError(r && r.error ? r.error : 'Tarmoq xatosi'));
        resolve({
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          text: async () => r.text || '',
          json: async () => JSON.parse(r.text || 'null'),
        });
      });
    });
  };

  // ---- CommonJS yuklagich ---------------------------------------------------------------------
  const sources = {};
  const cache = {};
  const pathShim = { join: (...parts) => parts.join('/') };

  const req = (spec) => {
    if (spec === 'xlsx') return window.XLSX;
    if (spec === 'path') return pathShim;
    const name = String(spec).split('/').pop().replace(/\.js$/, '');
    if (name === 'jadval') return window.HetJadval;   // lib/ fayllari <script> bilan yuklanadi
    if (name === 'batchlib') return window.HetBatch;
    return run(name);
  };

  function run(name) {
    if (cache[name]) return cache[name].exports;
    if (!sources[name]) throw new Error('Modul topilmadi: ' + name);
    const mod = { exports: {} };
    cache[name] = mod;
    new Function('module', 'exports', 'require', '__dirname', sources[name])(mod, mod.exports, req, '/src');
    return mod.exports;
  }

  window.loadElektrModules = async () => {
    for (const name of ['het', 'convert', 'engine']) {
      const res = await realFetch('/' + name + '.js');
      if (!res.ok) throw new Error(name + '.js yuklanmadi');
      sources[name] = await res.text();
    }
    window.HetEngine = run('engine');
  };
})();
