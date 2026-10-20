'use strict';
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { start } = require('./mock-server');
const engine = require('../src/engine');

(async () => {
  const table = fs.readFileSync(process.argv[2]);
  const dir = process.argv[3];
  const creds = engine.readCreds(table);
  const pw = Object.fromEntries(creds.map((c) => [c.login, c.password]));
  const m = await start(dir, pw, { failLogins: ['03404111553'], flaky: 17 });
  const t0 = Date.now();
  const { results, out } = await engine.run(table, { concurrency: 5, apiBase: `http://127.0.0.1:${m.port}/legal-consumer-billing/v1/mobile-cabinet` });
  console.log('accounts in mock', m.count, 'creds', creds.length, 'time', Date.now() - t0, 'ms', m.stats());
  console.log('ok', results.filter((r) => r.status === 'ok').length, 'err', results.filter((r) => r.status !== 'ok').map((r) => r.login + ':' + r.message));
  fs.writeFileSync(process.argv[4], out.data);
  m.server.close();
})().catch((e) => { console.error(e); process.exit(1); });
