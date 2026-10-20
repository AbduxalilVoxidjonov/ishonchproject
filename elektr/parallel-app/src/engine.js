'use strict';
const XLSX = require('xlsx');
const path = require('path');
const { makeClient } = require('./het');
const { invoiceSheet, balanceSom, accruedSom } = require('./convert');
const Jadval = require(path.join(__dirname, '..', 'lib', 'jadval.js'));
const Batch = require(path.join(__dirname, '..', 'lib', 'batchlib.js'));

// Bosh sahifa ma'lumotlari (consumer-detail): INN = tin, shartnoma raqami va sanasi
const detailOf = (d) => (d ? { inn: d.tin || '', contractNo: d.contractNumber != null ? String(d.contractNumber) : '', contractDate: d.contractDate || '' } : null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// creds ro'yxatini `concurrency` ta parallel oqimda ishlaydi. Har login — alohida sessiya.
async function collect(creds, { concurrency = 4, apiBase, onProgress, isCancelled } = {}) {
  const client = makeClient({ apiBase });
  const results = new Array(creds.length);
  let next = 0, done = 0;
  const worker = async (wi) => {
    await sleep(wi * 400); // oqimlar bir vaqtda urilmasin
    while (!isCancelled || !isCancelled()) {
      const i = next++;
      if (i >= creds.length) break;
      const { login, password } = creds[i];
      let res;
      try {
        const session = await client.login(login, password);
        const { calc, period, detail } = await client.fetchAccount(session);
        const { ws, acc } = invoiceSheet(XLSX, calc);
        res = { login, status: 'ok', message: '', parts: { invoice: { ws, acc }, balance: balanceSom(period), accrued: accruedSom(period), detail: detailOf(detail) } };
      } catch (e) {
        res = { login, status: 'error', message: e.message || String(e) };
      }
      results[i] = res;
      done++;
      if (onProgress) onProgress({ done, total: creds.length, result: res });
    }
  };
  const n = Math.max(1, Math.min(10, concurrency | 0 || 1));
  await Promise.all(Array.from({ length: Math.min(n, creds.length) }, (_, k) => worker(k)));
  return results.filter(Boolean);
}

// Login/parollar: alohida fayldan (credsBytes) yoki, u berilmasa, jadvalning o'zidan.
// Fayldagi login boshidagi 0 yo'qolgan bo'lsa (raqam formatida saqlangan), jadvaldagi matnli login bilan
// raqamiy tengligi bo'yicha moslab tiklanadi (taxmin emas — jadvaldagi haqiqiy qiymat olinadi).
function readCreds(tableBytes, credsBytes) {
  const creds = Batch.parseCreds(XLSX, new Uint8Array(credsBytes || tableBytes));
  if (!credsBytes) return creds;
  let tableLogins = [];
  try { tableLogins = Batch.parseCreds(XLSX, new Uint8Array(tableBytes)).map((c) => c.login); } catch { /* jadvalda login yo'q */ }
  const strip = (x) => String(x).replace(/^0+/, '');
  const byNum = new Map();
  for (const l of tableLogins) if (/^\d+$/.test(l) && !byNum.has(strip(l))) byNum.set(strip(l), l);
  return creds.map((c) => (/^\d+$/.test(c.login) && byNum.has(strip(c.login)) ? { login: byNum.get(strip(c.login)), password: c.password } : c));
}

function fill(tableBytes, results, creds) {
  const buf = new Uint8Array(tableBytes);
  return Jadval.fillJadval(XLSX, buf, results, { logins: creds.map((c) => c.login) });
}

async function run(tableBytes, opts = {}) {
  const creds = readCreds(tableBytes, opts.credsBytes);
  if (!creds.length) throw new Error("Jadvalda login/parol topilmadi («Логин» va «Парол» ustunlarini tekshiring)");
  const results = await collect(creds, opts);
  const out = fill(tableBytes, results, creds);
  return { creds, results, out };
}

module.exports = { collect, readCreds, fill, run };
