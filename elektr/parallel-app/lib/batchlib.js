// Yon panel uchun: login/parol Excelini o'qish va yakuniy umumiy Excelni yig'ish.
(() => {
  'use strict';

  const LOGIN_H = /^(login|логин|username|foydalanuvchi)/i;
  const PASS_H = /^(parol|парол|пароль|password|pass)/i;

  // Birinchi varaq: "login" va "parol" ustunlari. Sarlavha qatori dastlabki 15 qator ichidan qidiriladi
  // (masalan «Kamunalka yangi jadval»da u 4-qatorda: «Логин», «Парол»). Sarlavha topilmasa — A va B ustun.
  function parseCreds(XLSX, arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    let hr = -1, li = 0, pi = 1;
    for (let i = 0; i < Math.min(rows.length, 15) && hr < 0; i++) {
      const head = rows[i] || [];
      const lc = head.findIndex((x) => LOGIN_H.test(String(x).trim()));
      const pc = head.findIndex((x) => PASS_H.test(String(x).trim()));
      if (lc >= 0 && pc >= 0) { hr = i; li = lc; pi = pc; }
    }
    const seen = new Set();
    const out = [];
    for (const r of rows.slice(hr + 1)) {
      const login = String(r[li] == null ? '' : r[li]).trim();
      const password = String(r[pi] == null ? '' : r[pi]).trim();
      const key = login + '\u0000' + password;
      if (!login || !password || seen.has(key)) continue;
      seen.add(key);
      out.push({ login, password });
    }
    return out;
  }

  function sheetName(wb, base) {
    let n = base.replace(/[[\]:*?/\\]/g, '_').slice(0, 31);
    for (let i = 2; wb.SheetNames.includes(n); i++) {
      const suf = ' ' + i;
      n = n.slice(0, 31 - suf.length) + suf;
    }
    return n;
  }

  const HEAD = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F4E79' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };

  const BANNER = { font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '2E75B6' } }, alignment: { vertical: 'center' } };

  // Bir nechta varaqni bitta varaqqa ketma-ket (tagma-tag) joylaydi; har biri oldidan sarlavha qatori.
  function stackSheets(XLSX, items) {
    const U = XLSX.utils;
    const out = {};
    const merges = [];
    let r0 = 0, maxC = 10;
    for (const { title, ws } of items) {
      if (!ws || !ws['!ref']) continue;
      out[U.encode_cell({ r: r0, c: 0 })] = { v: title, t: 's', s: BANNER };
      for (let c = 1; c <= 10; c++) out[U.encode_cell({ r: r0, c })] = { v: '', t: 's', s: BANNER };
      merges.push({ s: { r: r0, c: 0 }, e: { r: r0, c: 10 } });
      r0 += 1;
      const rg = U.decode_range(ws['!ref']);
      for (const k of Object.keys(ws)) {
        if (k[0] === '!') continue;
        const a = U.decode_cell(k);
        out[U.encode_cell({ r: a.r + r0, c: a.c })] = { ...ws[k] };
        if (a.c > maxC) maxC = a.c;
      }
      (ws['!merges'] || []).forEach((m) => merges.push({ s: { r: m.s.r + r0, c: m.s.c }, e: { r: m.e.r + r0, c: m.e.c } }));
      r0 += rg.e.r + 1 + 2; // 2 ta bo'sh qator ajratuvchi
    }
    if (!r0) return null;
    out['!ref'] = U.encode_range({ s: { r: 0, c: 0 }, e: { r: r0 - 1, c: maxC } });
    out['!merges'] = merges;
    const first = items.find((x) => x.ws && x.ws['!cols']);
    if (first) out['!cols'] = first.ws['!cols'];
    return out;
  }

  // job.results → bitta workbook: "Jamlanma" + har bir login uchun HF/HK/Sh varaqlari.
  function buildBatchWorkbook(XLSX, job) {
    const wb = XLSX.utils.book_new();
    const rows = [['№', 'Login', 'Holat', 'Izoh / xato', 'Hisob raqami', 'Sana']];
    job.results.forEach((r, i) => {
      const inv = r.parts && r.parts.invoice;
      rows.push([i + 1, r.login, r.status === 'ok' ? 'Muvaffaqiyatli' : 'Xato', r.message || '', (inv && inv.acc) || '', (inv && inv.date) || '']);
    });
    const sum = XLSX.utils.aoa_to_sheet(rows);
    for (let c = 0; c < 6; c++) sum[XLSX.utils.encode_cell({ r: 0, c })].s = HEAD;
    job.results.forEach((r, i) => {
      if (r.status !== 'ok') sum[XLSX.utils.encode_cell({ r: i + 1, c: 2 })].s = { font: { bold: true, color: { rgb: 'B3261E' } } };
    });
    sum['!cols'] = [6, 22, 16, 60, 16, 14].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, sum, 'Jamlanma');

    // "Hammasi": har bir login uchun Hisob-faktura → Hisob-kitob jadvali → Shartnoma, hammasi tagma-tag bitta varaqda
    const items = [];
    job.results.filter((r) => r.status === 'ok' && r.parts).forEach((r, i) => {
      const { invoice, summary, contract } = r.parts;
      const who = `${i + 1}. Login: ${r.login}${invoice && invoice.acc ? '   |   Hisob: ' + invoice.acc : ''}`;
      if (invoice) items.push({ title: who + '   —   Hisob-faktura', ws: invoice.ws });
      if (summary) items.push({ title: who + '   —   Hisob-kitob jadvali', ws: summary });
      if (contract) items.push({ title: who + '   —   Shartnoma ma\'lumotlari', ws: contract });
    });
    const all = stackSheets(XLSX, items);
    if (all) XLSX.utils.book_append_sheet(wb, all, 'Hammasi');

    // "Ko'rsatkichlar": har bir hisoblagich — oldingi va oy yakunidagi (joriy) ko'rsatkich
    const K = typeof window !== 'undefined' && window.HetKamunalka;
    if (K) {
      const ms = K.metersFromResults(XLSX, job.results);
      if (ms.length) XLSX.utils.book_append_sheet(wb, K.reportSheet(XLSX, ms.map((m) => ({ ...m, status: '' }))), "Ko'rsatkichlar");
    }

    for (const r of job.results) {
      if (r.status !== 'ok' || !r.parts) continue;
      const { invoice, summary, contract } = r.parts;
      if (invoice) XLSX.utils.book_append_sheet(wb, invoice.ws, sheetName(wb, 'HF ' + r.login));
      if (summary) XLSX.utils.book_append_sheet(wb, summary, sheetName(wb, 'HK ' + r.login));
      if (contract) XLSX.utils.book_append_sheet(wb, contract, sheetName(wb, 'Sh ' + r.login));
    }
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const name = `HET_hammasi_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
    return { wb, name };
  }

  const api = { parseCreds, buildBatchWorkbook, stackSheets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.HetBatch = api;
})();
