'use strict';
// Sinov uchun soxta cabinet-api.het.uz: Sentabr arxividagi haqiqiy hisob-fakturalardan JSON javoblarini yasaydi
// (haqiqiy serverdagi formatda: «1 904.800», «2 095 280.00», tiyinda qoldiq).
const http = require('http');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function fmt(n, d) {
  if (n == null || n === '') return '';
  const s = Number(n).toFixed(d);
  const [i, f] = s.split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? '.' + f : '');
}

function loadAccounts(dir, passwords) {
  const acc = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!/\.xlsx$/i.test(f)) continue;
    const login = f.replace(/\.xlsx$/i, '');
    const wb = XLSX.readFile(path.join(dir, f));
    const ws = wb.Sheets[wb.SheetNames.find((n) => /faktura/i.test(n))];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let consumer = '', address = '', reportNumber = '';
    const items = [];
    let inItems = false;
    for (const r of rows) {
      const l = r[0] == null ? '' : String(r[0]);
      let m;
      if ((m = /^ISTE'MOLCHI:\s*(.+)$/i.exec(l))) consumer = m[1];
      if ((m = /^Manzil:\s*(.+)$/i.exec(l))) address = m[1];
      if ((m = /RAQAM\s+(\d+)/i.exec(l))) reportNumber = m[1];
      if (/^Nomi$/i.test(l)) { inItems = true; continue; }
      if (!inItems || !l.trim()) continue;
      const unit = r[1];
      if (!unit) { items.push({ name: l, unit: null, consumption: null, price: null, amount: null, priceWithoutVat: null, amountWithoutVat: null, itemType: 'FULL_LEFT_ALIGNED_BOLD' }); continue; }
      items.push({ name: l, unit, consumption: fmt(r[2], 3), price: r[3] == null ? '' : fmt(r[3], 2), amount: r[4] == null ? '' : fmt(r[4], 2), priceWithoutVat: r[5] == null ? '' : fmt(r[5], 2), amountWithoutVat: r[6] == null ? '' : fmt(r[6], 2), itemType: 'LEFT_ALIGNED' });
    }
    let out = 0;
    const kb = wb.Sheets[wb.SheetNames.find((n) => /kitob/i.test(n))];
    if (kb) { const k = XLSX.utils.sheet_to_json(kb, { header: 1, defval: null }); const r3 = k.find((x) => /Всего/.test(x[0])); if (r3) out = r3[7]; }
    acc.set(login, { password: passwords[login], calc: { headerData: { reportNumber, address, period: '2026-09-01', consumer: { name: consumer, accountNumber: reportNumber } }, items }, period: { balance: { totalBalanceOut: Math.round(out * 100) } } });
  }
  return acc;
}

function start(dir, passwords, { port = 0, failLogins = [], flaky = 0 } = {}) {
  const accounts = loadAccounts(dir, passwords);
  const tokens = new Map();
  let calls = 0, active = 0, maxActive = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      active++; maxActive = Math.max(maxActive, active); calls++;
      await new Promise((r) => setTimeout(r, 40)); // tarmoq kechikishi
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); active--; };
      const url = req.url.replace(/^.*mobile-cabinet/, '');
      if (flaky && calls % flaky === 0) return send(503, { message: 'temporarily unavailable' });
      if (req.method === 'POST' && url === '/user-login') {
        let b = {}; try { b = JSON.parse(body); } catch { /* */ }
        const a = accounts.get(String(b.login));
        if (!a || a.password !== b.password || failLogins.includes(b.login)) return send(401, { message: "Login yoki parol noto'g'ri" });
        const token = 'tok' + Math.random().toString(36).slice(2);
        tokens.set(token, b.login);
        return send(200, { accessToken: token, refreshToken: 'r', coatoCode: '03404', personalAccount: b.login });
      }
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      const login = m && tokens.get(m[1]);
      if (!login) return send(401, { message: 'unauthorized' });
      if (!req.headers['coato-code']) return send(400, { message: 'coato.coato code empty' });
      const a = accounts.get(login);
      if (url === '/report/print-calc-result') return send(200, a.calc);
      if (url === '/calculation-for-period') return send(200, a.period);
      if (url === '/consumer-detail') return send(200, { tin: '3' + String(login).slice(-8), contractNumber: '00' + String(login).slice(-2), contractDate: '2023-01-04' });
      send(404, { message: 'not found' });
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, stats: () => ({ calls, maxActive }), count: accounts.size })));
}

module.exports = { start };
