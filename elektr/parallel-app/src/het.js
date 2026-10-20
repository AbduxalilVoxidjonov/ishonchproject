'use strict';
// cabinet-api.het.uz bilan ishlash: login → token, keyin hisobotlarni olish. Har login uchun alohida sessiya (token).

const API = 'https://cabinet-api.het.uz/legal-consumer-billing/v1/mobile-cabinet';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class HetError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

function makeClient(opts = {}) {
  const base = (opts.apiBase || API).replace(/\/$/, '');
  const timeoutMs = opts.timeoutMs || 30000;
  const retries = opts.retries == null ? 3 : opts.retries;

  async function call(method, path, { token, coato, body } = {}) {
    let last;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        // Login so'rovi saytda faqat Accept va Content-Type bilan yuboriladi; qolgan so'rovlarga lang va Coato-Code qo'shiladi
        const headers = { Accept: 'application/json' };
        if (token) { headers.lang = 'uz'; headers['Coato-Code'] = coato || '33401'; }
        if (token) headers.Authorization = 'Bearer ' + token;
        if (body) headers['Content-Type'] = 'application/json';
        const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* JSON emas */ }
        if (res.ok) return json;
        const detail = (json && (json.message || json.error || json.detail || json.title)) || (text ? text.replace(/\s+/g, ' ').slice(0, 160) : '');
        const msg = `HTTP ${res.status}` + (detail ? ' — ' + detail : '') + (res.status === 401 && path === '/user-login' ? " (login yoki parol noto'g'ri, yoki sayt talabi o'zgargan)" : '');
        const err = new HetError(msg, res.status);
        if (res.status === 429 || res.status >= 500) { last = err; } else throw err; // 4xx (noto'g'ri parol va h.k.) — qayta urinmaymiz
      } catch (e) {
        if (e instanceof HetError && !(e.status === 429 || e.status >= 500)) throw e;
        last = e instanceof HetError ? e : new HetError(e.name === 'AbortError' ? "Javob kutish vaqti tugadi" : 'Tarmoq xatosi: ' + e.message, 0);
      } finally { clearTimeout(timer); }
      if (attempt < retries) await sleep(1000 * Math.pow(2, attempt) + Math.random() * 500);
    }
    throw last;
  }

  async function login(username, password) {
    const r = await call('POST', '/user-login', { body: { login: username, password } });
    if (!r || !r.accessToken) throw new HetError((r && r.message) || 'Kirish muvaffaqiyatsiz (token kelmadi)', 401);
    return { token: r.accessToken, coato: r.coatoCode || null };
  }

  // Bitta login uchun kerakli ma'lumotlar: hisob-faktura (Расчет за потребленную эл. энергию) va hisob-kitob (qoldiq)
  async function fetchAccount(session) {
    const [calc, period, detail] = await Promise.all([
      call('GET', '/report/print-calc-result', { token: session.token, coato: session.coato }),
      call('GET', '/calculation-for-period', { token: session.token, coato: session.coato }),
      call('GET', '/consumer-detail', { token: session.token, coato: session.coato }),
    ]);
    return { calc, period, detail };
  }

  return { login, fetchAccount, call };
}

module.exports = { makeClient, HetError, API };
