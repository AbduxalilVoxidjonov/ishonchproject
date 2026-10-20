'use strict';
// cabinet-api.het.uz JSON javoblarini jadval.js kutadigan «Hisob-faktura» varag'iga aylantiradi
// (sayt modalidagi jadval ko'rinishida: 0-ustun nom, 1 birlik, 2 iste'mol, 3 tarif, 4 summa, 5-6 QQSsiz, 7 hisoblagich, 8 joriy, 9 oldingi, 10 koeffitsient).

const METER_RE = /Сч\.\s*№\s*(\d+)\s*Пок\.\s*\(\s*([\d\s.]+?)\s*-\s*([\d\s.]+?)\s*\)\s*\*\s*(\d+)/;

function parseNum(s) {
  if (s == null || s === '') return undefined;
  if (typeof s === 'number') return s;
  const t = String(s).replace(/[\s  ]/g, '').replace(',', '.');
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
}

function invoiceSheet(XLSX, calc) {
  const h = (calc && calc.headerData) || {};
  const cons = h.consumer || {};
  const rows = [];
  if (cons.name) rows.push([`ISTE'MOLCHI: ${cons.name}`]);
  const acc = h.reportNumber || cons.accountNumber || '';
  rows.push([`HISOB: RAQAM ${acc} uchun`]);
  if (h.address) rows.push([`Manzil: ${String(h.address).trim()}`]);
  rows.push([]);
  rows.push(['Nomi', "O'lchov birliklari", "Iste'mol", 'Tarif', "Summa(so'm)", "QQSsiz tarif", "Summa(so'm) QQSsiz", 'Hisoblagich №', "Joriy ko'rsatkich", "Oldingi ko'rsatkich", 'Koeffitsient']);
  for (const it of (calc && calc.items) || []) {
    const name = String(it.name == null ? '' : it.name).trim();
    if (!name) continue;
    if (!it.unit) { rows.push([name]); continue; }
    const row = [name, String(it.unit), parseNum(it.consumption), parseNum(it.price), parseNum(it.amount), parseNum(it.priceWithoutVat), parseNum(it.amountWithoutVat)];
    const m = METER_RE.exec(name);
    if (m) row.push(m[1], parseNum(m[2]), parseNum(m[3]), parseNum(m[4]));
    rows.push(row);
  }
  return { ws: XLSX.utils.aoa_to_sheet(rows), acc };
}

// «Chiqish qoldig'i» (tiyinda keladi) → so'm. Manfiy = oldindan to'lov (kabinetdagi «Hisob-kitob» jadvalidagi «Всего» qatori).
function balanceSom(period) {
  const b = period && period.balance;
  const v = b && b.totalBalanceOut;
  return typeof v === 'number' ? Math.round(v) / 100 : null;
}

// «Hisoblangan» jami (tiyinda) → so'm: kabinetdagi «Hisob-kitob joriy davr uchun» jadvalining «Всего / Hisoblangan» katagi
function accruedSom(period) {
  const v = period && period.balance && period.balance.totalDebit;
  return typeof v === 'number' ? Math.round(v) / 100 : null;
}

module.exports = { invoiceSheet, balanceSom, accruedSom, parseNum, METER_RE };
