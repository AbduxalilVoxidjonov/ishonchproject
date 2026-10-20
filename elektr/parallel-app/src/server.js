'use strict';
// Mahalliy veb-server: interfeys (ui/index.html) va ishchi jarayon. Faqat 127.0.0.1 da tinglaydi.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const engine = require('./engine');

const jobs = new Map();

function send(res, code, body, headers = {}) {
  res.writeHead(code, headers);
  res.end(body);
}

function readBody(req, limit = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('Fayl juda katta')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function emit(job, ev) {
  job.events.push(ev);
  for (const res of job.listeners) res.write(`data: ${JSON.stringify(ev)}\n\n`);
}

async function runJob(job, bytes, concurrency, apiBase, credsBytes) {
  try {
    const creds = engine.readCreds(bytes, credsBytes);
    if (!creds.length) throw new Error("Jadvalda login/parol topilmadi («Логин» va «Парол» ustunlarini tekshiring)");
    emit(job, { type: 'start', total: creds.length, concurrency });
    const results = await engine.collect(creds, {
      concurrency, apiBase,
      isCancelled: () => job.cancelled,
      onProgress: ({ done, total, result }) => emit(job, { type: 'progress', done, total, login: result.login, status: result.status, message: result.message }),
    });
    if (job.cancelled) { emit(job, { type: 'cancelled', done: results.length }); return; }
    const out = engine.fill(bytes, results, creds);
    job.result = Buffer.from(out.data);
    const ok = results.filter((r) => r.status === 'ok').length;
    const checks = out.report.filter((x) => x.status === 'check');
    const mismatched = checks.filter((x) => !x.ok).map((x) => `${x.login}: jadval ${x.table}, kabinet ${x.cabinet} (farq ${x.diff})`);
    emit(job, {
      type: 'done', ok, failed: results.length - ok, rows: out.rows, accounts: out.accounts, checked: checks.length, mismatched,
      notes: out.report.filter((x) => x.status === 'warn' || x.status === 'info' || x.status === 'skip').map((x) => `${x.login}: ${x.message}`),
    });
  } catch (e) {
    emit(job, { type: 'error', message: e.message || String(e) });
  }
}

function createServer({ apiBase } = {}) {
  const uiHtml = () => fs.readFileSync(path.join(__dirname, '..', 'ui', 'index.html'));
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, uiHtml(), { 'Content-Type': 'text/html; charset=utf-8' });
      if (req.method === 'POST' && url.pathname === '/api/run') {
        const body = JSON.parse((await readBody(req)).toString('utf8'));
        const bytes = Buffer.from(String(body.file || ''), 'base64');
        if (!bytes.length) return send(res, 400, JSON.stringify({ error: 'Fayl bo\'sh' }), { 'Content-Type': 'application/json' });
        const id = crypto.randomBytes(8).toString('hex');
        const job = { id, name: String(body.name || 'jadval.xlsx'), events: [], listeners: new Set(), cancelled: false, result: null };
        jobs.set(id, job);
        const credsBytes = body.creds ? Buffer.from(String(body.creds), 'base64') : null;
        runJob(job, bytes, Number(body.concurrency) || 4, apiBase, credsBytes && credsBytes.length ? credsBytes : null);
        return send(res, 200, JSON.stringify({ id }), { 'Content-Type': 'application/json' });
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        const job = jobs.get(url.searchParams.get('id'));
        if (!job) return send(res, 404, 'yo\'q');
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        for (const ev of job.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
        job.listeners.add(res);
        req.on('close', () => job.listeners.delete(res));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/cancel') {
        const job = jobs.get(url.searchParams.get('id'));
        if (job) job.cancelled = true;
        return send(res, 200, '{}', { 'Content-Type': 'application/json' });
      }
      if (req.method === 'GET' && url.pathname === '/api/result') {
        const job = jobs.get(url.searchParams.get('id'));
        if (!job || !job.result) return send(res, 404, 'Natija yo\'q');
        const name = job.name.replace(/\.xlsx$/i, '') + '_toldirildi.xlsx';
        return send(res, 200, job.result, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        });
      }
      send(res, 404, 'Topilmadi');
    } catch (e) {
      send(res, 500, JSON.stringify({ error: e.message }), { 'Content-Type': 'application/json' });
    }
  });
}

function listen({ port = 0, apiBase } = {}) {
  const server = createServer({ apiBase });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

if (require.main === module) {
  listen({ port: Number(process.env.PORT) || 5177 }).then(({ port }) => console.log(`HET parallel: http://127.0.0.1:${port}  (brauzerda oching)`));
}

module.exports = { listen, createServer };
