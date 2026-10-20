// HET → Excel: "Kamunalka yangi jadval" (har bir hisoblagich — alohida qator) ni
// hisob-faktura ma'lumotlari bilan avtomatik to'ldiradi.
//
// Jadval tuzilishi (1-varaq):
//   A № | B Худуд | C Номи | D Логин | E Парол | F ID | G Олдиндан тулов | I Сч. №
//   Актив:   J oy boshi | K oy oxiri | L Кт | M соф (formula) | N Пот. ЛЭП | O Пот. ТРФ | P tarif | Q summa (formula)
//   Реактив: S oy boshi | T oy oxiri | U Кт | V соф (formula) | W Пот. ЛЭП | X Пот. ТРФ | Y tarif | Z summa (formula)
//   AB Расчет по Cos Ф | AC Жами (formula)
//
// Qoidalar:
//  * Hisob-faktura ("Hisob-faktura" varag'i) dagi har bir hisoblagich (Сч. №) — alohida qator. Bitta loginda
//    2 va undan ko'p hisoblagich bo'lsa — hammasi tagma-tag (keyingi qatorlarga) yoziladi.
//  * Qator logini «Логин» ustuni bo'yicha topiladi; jadvalda bo'lmagan login jadval oxiriga qo'shiladi (faqat login yoziladi; A–G ustunlariga hech narsa taxmin qilib yozilmaydi).
//  * «Пот. ЛЭП» / «Пот. ТРФ» (hisoblagichga bog'langan yoki umumiy «потери в ...») — N, O (кВтч) va W, X (кВарч).
//  * «Расчет по Cos Ф» qatorining summasi — AB ustuniga.
//  * M, Q, V, Z, AC formulalar sifatida yoziladi; faqat kerakli kataklar o'zgaradi, formatlash saqlanadi.
// Fayl XML darajasida tahrirlanadi (kamunalka.js dagi usul).
(() => {
  'use strict';

  const TD = new TextDecoder('utf-8');
  const TE = new TextEncoder();
  const clean = (s) => String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
  const num = (v) => {
    if (typeof v === 'number') return v;
    const t = clean(v).replace(/ /g, '').replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
  };
  const fin = (v) => (Number.isFinite(v) ? v : null);
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const r2 = (v) => Math.round(v * 1e2) / 1e2;
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const stripZeros = (s) => clean(s).replace(/\.0+$/, '').replace(/^0+/, '');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
  const nStr = (v) => { const s = String(v); return /e/i.test(s) ? v.toFixed(6) : s; };

  const colIdx0 = (letters) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const colL = (i) => { let n = i + 1, s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

  // =====================================================================
  // 1) Hisob-fakturadan ma'lumot olish
  // =====================================================================
  const REACT = /вар|var/i;
  const LOSS_LEP = /пот\.?\s*лэп|потери\s+в\s+лэп/i;
  const LOSS_TRF = /пот\.?\s*трф|потери\s+в\s+трансформатор/i;
  const TOTAL = /^(итого|всего|дебет|договорная|экономическое)/i;
  const COS = /расчет\s+по\s+cos/i;
  // «Плата эл.эн сверх дог.вел» va «Акты нарушений N …» — o'z tarifi bilan alohida qator (hisoblagich ko'rsatkichi emas)
  const OVER = /^(плата\s+эл\.?\s*эн\.?\s+сверх|акты?\s+нарушен)/i;
  const DEDUCT = /выч\.?\s*$/i;

  // ws — SheetJS varaq obyekti (yon panel natijasidan yoki Excel fayldan o'qilgan)
  function invoiceRows(XLSX, ws) {
    if (!ws || !ws['!ref']) return null;
    const U = XLSX.utils, rg = U.decode_range(ws['!ref']);
    const at = (r, c) => { const x = ws[U.encode_cell({ r, c })]; return x ? x.v : undefined; };
    const out = { consumer: '', korxona: '', address: '', acc: '', readings: [], losses: [], cos: [], over: [], debitA: null, debitR: null };
    for (let r = rg.s.r; r <= rg.e.r; r++) {
      const label = clean(at(r, 0));
      let m;
      if ((m = /^iste.?molchi:\s*(.+)$/i.exec(label))) { out.consumer = m[1]; continue; }
      if ((m = /^korxona:\s*(?:\d+\s*-\s*)?(.+)$/i.exec(label))) { out.korxona = m[1]; continue; }
      if ((m = /^manzil:\s*(.+)$/i.exec(label))) { out.address = m[1]; continue; }
      if ((m = /RAQAM\s+(\d+)/i.exec(label))) { out.acc = m[1]; continue; }
      const unit = clean(at(r, 1));
      if (!unit) continue; // "Площадка: ..." / bo'sh qator
      const sm = num(at(r, 4));
      const item = {
        label, unit, react: REACT.test(unit),
        istemol: num(at(r, 2)) || 0, tarif: fin(num(at(r, 3))), summa: Number.isFinite(sm) ? sm : 0,
        meter: clean(at(r, 7)), cur: fin(num(at(r, 8))), prev: fin(num(at(r, 9))), koef: fin(num(at(r, 10))),
      };
      if (/^дебет/i.test(label)) { if (/реактив/i.test(label)) out.debitR = item.summa; else if (/актив/i.test(label)) out.debitA = item.summa; continue; }
      if (COS.test(label)) { out.cos.push(item); continue; }
      if (OVER.test(label)) { out.over.push(item); continue; }
      if (TOTAL.test(label)) continue;
      const isLep = LOSS_LEP.test(label), isTrf = LOSS_TRF.test(label);
      if (isLep || isTrf) {
        item.kind = isLep ? 'lep' : 'trf';
        item.meter = (/№\s*(\d{5,})/.exec(label) || [])[1] || '';
        out.losses.push(item);
        continue;
      }
      if (/^\d{5,}$/.test(item.meter) && item.cur != null && item.prev != null) {
        item.deduct = DEDUCT.test(label);
        out.readings.push(item);
      }
    }
    return out;
  }

  // Bitta hisoblagich bir necha tarif bo'yicha bo'lingan bo'lsa (masalan reaktiv 49.10 va 98.20):
  // (4 303.42 → 4 303.42) + (4 303.42 → 4 404.01) — ketma-ket bo'laklarni bitta oraliqqa birlashtiramiz.
  function chain(segs) {
    const out = [], used = new Set();
    for (let i = 0; i < segs.length; i++) {
      if (used.has(i)) continue;
      used.add(i);
      const g = { prev: segs[i].prev, cur: segs[i].cur, koef: segs[i].koef, parts: [segs[i]] };
      for (let grew = true; grew;) {
        grew = false;
        for (let j = 0; j < segs.length; j++) {
          if (used.has(j)) continue;
          const t = segs[j];
          if (Math.abs(t.prev - g.cur) < 1e-6) g.cur = t.cur;
          else if (Math.abs(t.cur - g.prev) < 1e-6) g.prev = t.prev;
          else continue;
          g.parts.push(t); used.add(j); grew = true;
        }
      }
      out.push(g);
    }
    return out;
  }

  // Qator uchun tarif: sarfi 0 bo'lmagan qismlarning tarifi; aralash bo'lsa — o'rtacha (summa = jami summa)
  function effTariff(parts) {
    const nz = parts.filter((p) => Math.abs(p.istemol) > 1e-9 && p.tarif != null);
    if (nz.length) {
      const tarifs = [...new Set(nz.map((p) => r4(p.tarif)))];
      if (tarifs.length === 1) return { tarif: tarifs[0], mixed: false };
      const si = sum(nz, (p) => p.istemol), ss = sum(nz, (p) => p.summa);
      return { tarif: r4(ss / si), mixed: true, tarifs };
    }
    const any = parts.find((p) => p.tarif != null);
    return { tarif: any ? r4(any.tarif) : null, mixed: false };
  }

  const nonzero = (x) => Math.abs(x.istemol) > 1e-9;

  // Bir tomon (aktiv yoki reaktiv) uchun qator-bo'laklar: har bo'lak — {chain, lep, trf, tarif}.
  // Odatda bitta bo'lak. Agar bir oy ichida tarif o'zgargan bo'lsa (masalan reaktiv 49.10 va 98.20),
  // har bir tarif uchun alohida bo'lak (alohida qator) — tarif katagi doim haqiqiy tarif bo'lib qoladi.
  function sideParts(parts, lep, trf) {
    if (!parts.length && !lep.length && !trf.length) return { subs: [], split: null };
    const tariffs = [];
    for (const x of [...parts, ...lep, ...trf]) if (nonzero(x) && x.tarif != null && !tariffs.includes(r4(x.tarif))) tariffs.push(r4(x.tarif));
    if (tariffs.length <= 1) {
      const chains = chain(parts);
      const subs = chains.map((c, i) => ({ chain: c, lep: i === 0 ? lep : [], trf: i === 0 ? trf : [] }));
      if (!subs.length) subs.push({ chain: null, lep, trf });
      for (const sb of subs) sb.tarif = effTariff([...(sb.chain ? sb.chain.parts : []), ...sb.lep, ...sb.trf]).tarif;
      return { subs, split: null };
    }
    const subs = [];
    for (const t of tariffs) {
      const same = (x) => x.tarif != null && r4(x.tarif) === t;
      const chains = chain(parts.filter((x) => nonzero(x) && same(x)));
      const l = lep.filter(same), f = trf.filter(same);
      const part = chains.map((c, i) => ({ chain: c, lep: i === 0 ? l : [], trf: i === 0 ? f : [], tarif: t }));
      if (!part.length && (l.length || f.length)) part.push({ chain: null, lep: l, trf: f, tarif: t });
      subs.push(...part);
    }
    return { subs, split: tariffs };
  }

  // «Hisob-kitob» jadvali: «Всего» qatori, «Chiqish qoldig‘i» ustuni (kabinetning bosh sahifasidagi qoldiq). Manfiy = oldindan to'lov.
  function balanceFromWs(XLSX, ws) {
    if (!ws || !ws['!ref']) return null;
    const rg = XLSX.utils.decode_range(ws['!ref']);
    let col = -1, rowT = -1;
    for (let r = rg.s.r; r <= Math.min(rg.e.r, 14); r++) for (let c = rg.s.c; c <= rg.e.c; c++) {
      const v = ws[XLSX.utils.encode_cell({ r, c })];
      const t = v && String(v.v == null ? '' : v.v);
      if (col < 0 && t && /chiqish\s+qoldig/i.test(t)) col = c;
      if (rowT < 0 && t && /^\s*Всего\s*$/i.test(t)) rowT = r;
    }
    if (col < 0 || rowT < 0) return null;
    const v = ws[XLSX.utils.encode_cell({ r: rowT, c: col })];
    return v && typeof v.v === 'number' ? v.v : null;
  }

  // Bitta login uchun qatorlar ro'yxatini tuzadi
  function buildAccount(XLSX, r) {
    const inv = r && r.parts && r.parts.invoice;
    const P = invoiceRows(XLSX, inv && inv.ws);
    if (!P) return { login: r.login, error: "Hisob-faktura topilmadi" };
    const warnings = [], infos = [];
    const balance = r && r.parts ? (r.parts.balance != null ? r.parts.balance : balanceFromWs(XLSX, r.parts.summary)) : null;

    const groups = [], gmap = new Map();
    for (const it of P.readings) {
      const key = it.meter + (it.deduct ? '|D' : '');
      let g = gmap.get(key);
      if (!g) { g = { meter: it.meter, deduct: !!it.deduct, act: [], rea: [], lep: [], trf: [] }; gmap.set(key, g); groups.push(g); }
      (it.react ? g.rea : g.act).push(it);
    }
    if (!groups.length && P.losses.length) groups.push({ meter: '', deduct: false, act: [], rea: [], lep: [], trf: [] });
    if (!groups.length) return { login: r.login, error: "Hisob-fakturada hisoblagich qatori topilmadi" };

    // Yo'qotishlar: hisoblagichga bog'langan bo'lsa — o'sha hisoblagichga. Umumiy («потери в ...») bo'lsa —
    // tarifi mos keladigan (yo'q bo'lsa eng ko'p sarfli) asosiy hisoblagichga.
    const mains = groups.filter((g) => !g.deduct);
    const flow = (g, react) => sum(react ? g.rea : g.act, (x) => Math.abs(x.istemol));
    const pickFor = (l) => {
      const side = (g) => (l.react ? g.rea : g.act);
      const sameTariff = mains.filter((g) => side(g).some((x) => nonzero(x) && x.tarif != null && l.tarif != null && r4(x.tarif) === r4(l.tarif)));
      const pool = sameTariff.length ? sameTariff : mains.filter((g) => side(g).length) ;
      const cand = pool.length ? pool : mains;
      return cand.reduce((best, g) => (flow(g, l.react) > flow(best, l.react) ? g : best), cand[0]);
    };
    for (const l of P.losses) {
      const g = (l.meter && groups.find((x) => x.meter === l.meter && !x.deduct)) || pickFor(l);
      (l.kind === 'lep' ? g.lep : g.trf).push(l);
    }

    const overBy = new Map();
    for (const o of P.over) { if (o.react) continue; const g = pickFor(o); if (!g) continue; if (!overBy.has(g)) overBy.set(g, []); overBy.get(g).push(o); }
    const rows = [];
    for (const g of groups) {
      const A = sideParts(g.act, g.lep.filter((x) => !x.react), g.trf.filter((x) => !x.react));
      const Rr = sideParts(g.rea, g.lep.filter((x) => x.react), g.trf.filter((x) => x.react));
      const n = Math.max(1, A.subs.length, Rr.subs.length);
      for (let i = 0; i < n; i++) {
        const sa = A.subs[i] || null, sr = Rr.subs[i] || null;
        const row = { meter: g.meter, deduct: g.deduct, notes: [], hasA: !!sa, hasR: !!sr, a: null, r: null, N: 0, O: 0, W: 0, X: 0, P: null, Y: null };
        if (sa) {
          row.a = sa.chain ? { prev: sa.chain.prev, cur: sa.chain.cur, koef: sa.chain.koef || 1 } : null;
          row.N = r6(sum(sa.lep, (x) => x.istemol)); row.O = r6(sum(sa.trf, (x) => x.istemol)); row.P = sa.tarif;
          row.compsA = [...(sa.chain ? sa.chain.parts : []), ...sa.lep, ...sa.trf];
        }
        if (sr) {
          row.r = sr.chain ? { prev: sr.chain.prev, cur: sr.chain.cur, koef: sr.chain.koef || 1 } : null;
          row.W = r6(sum(sr.lep, (x) => x.istemol)); row.X = r6(sum(sr.trf, (x) => x.istemol)); row.Y = sr.tarif;
          row.compsR = [...(sr.chain ? sr.chain.parts : []), ...sr.lep, ...sr.trf];
          if (sr.tarif == null && sr.chain && Math.abs(sr.chain.cur - sr.chain.prev) > 1e-9) row.notes.push("reaktiv tarifi hisob-fakturada yo'q (to'lov hisoblanmagan) — tarif bo'sh qoldi");
        }
        if (i === 0 && A.split) row.notes.push(`aktiv: tarif o'zgargan (${A.split.join(' va ')}) — tarif bo'yicha alohida qatorlarga bo'lindi`);
        if (i === 0 && Rr.split) row.notes.push(`reaktiv: tarif o'zgargan (${Rr.split.join(' va ')}) — tarif bo'yicha alohida qatorlarga bo'lindi`);
        if (row.deduct) {
          for (const c of [row.a, row.r]) if (c) { const t = c.prev; c.prev = c.cur; c.cur = t; }
          row.notes.push("«Выч.» — ayirish qatori: oy boshi/oy oxiri almashtirib yozildi (sarf manfiy)");
        }
        rows.push(row);
      }
      // «Плата эл.эн сверх дог.вел» — shartnoma kattaligidan oshgan sarf: o'sha hisoblagichning keyingi qatori, o'z tarifi bilan
      for (const o of overBy.get(g) || []) {
        rows.push({ meter: g.meter, deduct: false, over: true, hasA: true, hasR: false, a: { prev: 0, cur: o.istemol, koef: 1 }, r: null, N: 0, O: 0, W: 0, X: 0, P: o.tarif, Y: null,
          compsA: [o], compsR: [], notes: [/нарушен/i.test(o.label) ? `«${o.label}» — qoidabuzarlik akti bo'yicha hisoblangan sarf alohida qator: hisoblagich ko'rsatkichi emas, shuning uchun oy boshi = 0, oy oxiri = sarf miqdori` : "«Плата эл.эн сверх дог.вел» — shartnoma kattaligidan oshgan sarf alohida tarif bilan; hisoblagich ko'rsatkichi emas, shuning uchun oy boshi = 0, oy oxiri = sarf miqdori"] });
      }
    }

    let totA = 0, totR = 0, expA = 0, expR = 0;
    const net = (c) => (c ? (c.cur - c.prev) * c.koef : 0);
    for (const row of rows) {
      row.compsA = row.compsA || []; row.compsR = row.compsR || [];
      row.calcQ = (net(row.a) + row.N + row.O) * (row.P || 0);
      row.calcZ = (net(row.r) + row.W + row.X) * (row.Y || 0);
      totA += row.calcQ; totR += row.calcZ;
      expA += sum(row.compsA, (x) => x.summa); expR += sum(row.compsR, (x) => x.summa);
    }
    if (Math.abs(totA - expA) > 1 * rows.length) warnings.push(`Aktiv summa mos kelmadi: jadval ${r2(totA)}, hisob-faktura ${r2(expA)}`);
    if (Math.abs(totR - expR) > 1 * rows.length) warnings.push(`Reaktiv summa mos kelmadi: jadval ${r2(totR)}, hisob-faktura ${r2(expR)}`);

    if (P.cos.length) rows[0].cos = r2(sum(P.cos, (x) => x.summa));
    // Tekshiruv: jadvaldagi «Тўланадиган сумма» (aktiv + reaktiv + Cos Ф) kabinetdagi «Hisoblangan» jami bilan bir xilmi
    const cabinetTotal = r && r.parts && typeof r.parts.accrued === 'number' ? r.parts.accrued : null;
    const tableTotal = r2(totA + totR + (rows[0] && rows[0].cos ? rows[0].cos : 0));
    let check = null;
    if (cabinetTotal != null) {
      const diff = r2(tableTotal - cabinetTotal);
      check = { table: tableTotal, cabinet: cabinetTotal, diff, ok: Math.abs(diff) <= Math.max(1, rows.length) };
      if (!check.ok) warnings.push(`Тўланадиган сумма kabinet bilan mos emas: jadval ${tableTotal}, kabinetdagi «Hisoblangan» ${cabinetTotal} (farq ${diff})`);
    }
    const dt = r && r.parts && r.parts.detail;
    const detail = dt ? { inn: dt.inn ? String(dt.inn).trim() : '', contractNo: dt.contractNo != null ? String(dt.contractNo).trim() : '', contractDate: dt.contractDate ? String(dt.contractDate).trim() : '' } : null;
    return { login: r.login, check, detail, consumer: P.consumer, korxona: P.korxona, address: P.address, acc: P.acc || (inv && inv.acc) || '', rows, warnings, infos, balance, totals: { active: r2(totA), reactive: r2(totR) } };
  }

  // =====================================================================
  // 2) Excel fayllardan (login = fayl nomi) natijalar ro'yxatini tuzish — .xlsx yoki .zip
  // =====================================================================
  const loginFromName = (name) => {
    const stem = String(name).split(/[\\/]/).pop().replace(/\.xlsx$/i, '');
    return (/\d{9,}/.exec(stem) || [stem.trim()])[0];
  };

  function resultsFromFiles(XLSX, files) {
    const out = [];
    const addXlsx = (name, bytes) => {
      const login = loginFromName(name);
      try {
        const wb = XLSX.read(bytes, { type: 'array' });
        const sn = wb.SheetNames.find((x) => /hisob.?faktura/i.test(x)) || wb.SheetNames[0];
        const ws = wb.Sheets[sn];
        const a8 = ws && Object.keys(ws).map((k) => (ws[k] && ws[k].v)).find((v) => /RAQAM\s+\d+/i.test(String(v)));
        const sk = wb.SheetNames.find((x) => /hisob.?kitob/i.test(x));
        const sws = sk ? wb.Sheets[sk] : null;
        out.push({ login, status: 'ok', message: name, parts: { invoice: { ws, acc: ((/RAQAM\s+(\d+)/i.exec(a8 || '') || [])[1]) || '' }, summary: sws || undefined } });
      } catch (e) {
        out.push({ login, status: 'error', message: name + ': ' + e.message });
      }
    };
    for (const f of files) {
      const bytes = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes);
      if (/\.zip$/i.test(f.name)) {
        const cfb = XLSX.CFB.read(bytes, { type: 'array' });
        cfb.FullPaths.forEach((p, i) => {
          const e = cfb.FileIndex[i];
          if (!/\.xlsx$/i.test(p) || /(^|\/)(__MACOSX|~\$)/.test(p) || /(^|\/)\._/.test(p) || !e || !e.content) return;
          addXlsx(p, e.content instanceof Uint8Array ? e.content : new Uint8Array(e.content));
        });
      } else addXlsx(f.name, bytes);
    }
    out.sort((a, b) => String(a.login).localeCompare(String(b.login), undefined, { numeric: true }));
    return out;
  }

  // =====================================================================
  // 3) Jadval XML'i bilan ishlash
  // =====================================================================
  function entry(CFB, cfb, path) {
    const e = CFB.find(cfb, path) || CFB.find(cfb, '/' + path);
    if (!e) throw new Error('Faylda topilmadi: ' + path);
    return e;
  }
  const readText = (e) => TD.decode(e.content instanceof Uint8Array ? e.content : new Uint8Array(e.content));

  function firstSheetPath(CFB, cfb) {
    const wbx = readText(entry(CFB, cfb, 'xl/workbook.xml'));
    const rid = (/<sheet\b[^>]*\br:id="([^"]+)"/.exec(wbx) || [])[1];
    const rels = readText(entry(CFB, cfb, 'xl/_rels/workbook.xml.rels'));
    const tag = (new RegExp('<Relationship\\b[^>]*\\bId="' + rid + '"[^>]*>').exec(rels) || [])[0] || '';
    let target = (/\bTarget="([^"]+)"/.exec(tag) || [])[1] || 'worksheets/sheet1.xml';
    target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    return 'xl/' + target;
  }

  function parseSst(xml) {
    if (!xml) return [];
    return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
      .map((m) => unesc([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  }

  function parseRows(xml) {
    const a = xml.indexOf('<sheetData'), b = xml.indexOf('</sheetData>');
    if (a < 0 || b < 0) throw new Error('Varaq tuzilishi tushunarsiz (sheetData topilmadi)');
    const open = xml.indexOf('>', a) + 1;
    const body = xml.slice(open, b);
    const rows = [];
    const reRow = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
    let m;
    while ((m = reRow.exec(body))) {
      const attrs = m[1];
      const num0 = +((/\br="(\d+)"/.exec(attrs) || [])[1]);
      const cells = new Map();
      if (m[2]) {
        const reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let c;
        while ((c = reC.exec(m[2]))) {
          const ref = /\br="([A-Z]+)\d+"/.exec(c[1]);
          if (!ref) continue;
          cells.set(colIdx0(ref[1]), { s: (/\bs="(\d+)"/.exec(c[1]) || [])[1] || null, t: (/\bt="([^"]*)"/.exec(c[1]) || [])[1] || null, inner: c[2] || '' });
        }
      }
      rows.push({ orig: num0, attrs: attrs.replace(/\s*\br="\d+"/, ''), cells });
    }
    // qatorlar ketma-ket bo'lishi kerak (1..N) — bo'shliqlarni to'ldiramiz
    const full = [];
    for (const r of rows) {
      while (full.length + 1 < r.orig) full.push({ orig: full.length + 1, attrs: '', cells: new Map() });
      full.push(r);
    }
    return { head: xml.slice(0, open), tail: xml.slice(b), rows: full };
  }

  function serialize(rows) {
    return rows.map((r) => {
      const cs = [...r.cells.keys()].sort((a, b) => a - b).map((c) => {
        const x = r.cells.get(c);
        const at = `${x.s != null ? ` s="${x.s}"` : ''}${x.t ? ` t="${x.t}"` : ''}`;
        return x.inner ? `<c r="${colL(c)}${r.num}"${at}>${x.inner}</c>` : `<c r="${colL(c)}${r.num}"${at}/>`;
      }).join('');
      return cs ? `<row r="${r.num}"${r.attrs}>${cs}</row>` : `<row r="${r.num}"${r.attrs}/>`;
    }).join('');
  }

  function cellText(cell, sst) {
    if (!cell || !cell.inner) return '';
    if (cell.t === 'inlineStr') return unesc([...cell.inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
    const v = /<v>([\s\S]*?)<\/v>/.exec(cell.inner);
    if (!v) return '';
    if (cell.t === 's') return sst[+v[1]] || '';
    return unesc(v[1]);
  }
  const hasContent = (cell, sst) => !!cell && (/<f\b/.test(cell.inner) || cellText(cell, sst) !== '');

  // Aniq raqam ko'rinishi: mavjud uslubning nusxasi, faqat son formati boshqacha
  function makeStyler(stylesXml) {
    let xml = stylesXml;
    const fmtIds = {};
    const fmtId = (FMT) => {
      if (FMT === '@') return '49';
      if (fmtIds[FMT]) return fmtIds[FMT];
      const e = FMT.replace(/"/g, '&quot;');
      const ids = [...xml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)];
      const same = ids.find((m) => m[2] === e);
      if (same) return (fmtIds[FMT] = same[1]);
      const id = String(Math.max(163, ...ids.map((m) => +m[1])) + 1);
      const nf = `<numFmt numFmtId="${id}" formatCode="${e}"/>`;
      if (/<numFmts\b[^>]*>/.test(xml)) {
        xml = xml.replace(/<numFmts\b([^>]*)count="(\d+)"([^>]*)>/, (x, p1, c, p3) => `<numFmts${p1}count="${+c + 1}"${p3}>`);
        xml = xml.replace('</numFmts>', nf + '</numFmts>');
      } else xml = xml.replace(/<fonts\b/, `<numFmts count="1">${nf}</numFmts><fonts`);
      return (fmtIds[FMT] = id);
    };
    const cx = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
    const xfs = cx ? [...cx[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]) : [];
    const added = [], cache = {};
    const styleFor = (s, FMT) => {
      const key = s + '|' + FMT;
      if (cache[key] != null) return cache[key];
      const id = fmtId(FMT);
      let base = xfs[+s] || xfs[0] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
      base = base.replace(/\bnumFmtId="\d+"/, `numFmtId="${id}"`);
      if (!/numFmtId=/.test(base)) base = base.replace('<xf', `<xf numFmtId="${id}"`);
      base = /applyNumberFormat=/.test(base) ? base.replace(/applyNumberFormat="\d"/, 'applyNumberFormat="1"') : base.replace('<xf', '<xf applyNumberFormat="1"');
      added.push(base);
      cache[key] = String(xfs.length + added.length - 1);
      return cache[key];
    };
    const finish = () => {
      if (!added.length || !cx) return xml;
      const total = xfs.length + added.length;
      return xml.replace(/<cellXfs\b([^>]*?)count="\d+"([^>]*)>([\s\S]*?)<\/cellXfs>/,
        (x, p1, p2, body) => `<cellXfs${p1}count="${total}"${p2}>${body}${added.join('')}</cellXfs>`);
    };
    return { styleFor, finish };
  }

  // Formuladagi nisbiy qator raqamlarini siljitish (qator qo'shilganda)
  function shiftFormula(f, dr) {
    return f.replace(/(^|[^A-Za-z0-9_.$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g,
      (all, pre, ac, col, ar, row) => `${pre}${ac}${col}${ar}${ar ? row : String(+row + dr)}`);
  }

  // =====================================================================
  // 4) Jadval tuzilishini aniqlash
  // =====================================================================
  function analyze(P, sst) {
    const R = P.rows;
    const txt = (r, c) => clean(cellText(R[r] && R[r].cells.get(c), sst));
    const find = (re, from, to) => {
      for (let r = from; r < Math.min(to, R.length); r++)
        for (const c of [...R[r].cells.keys()].sort((a, b) => a - b)) if (re.test(txt(r, c))) return { r, c };
      return null;
    };
    const hLogin = find(/^(логин|login)/i, 0, 12);
    if (!hLogin) throw new Error("Jadvalda «Логин» ustuni topilmadi (sarlavha qatori kerak)");
    const hr = hLogin.r;
    const inRow = (re, dflt) => { const f = find(re, hr, hr + 1); return f ? f.c : dflt; };
    const act = find(/^актив\s+электр/i, 0, hr + 1), rea = find(/^реактив\s+электр/i, 0, hr + 1);
    const cos = find(/cos/i, 0, hr + 1), tot = find(/^жами/i, 0, hr + 1), met = find(/^сч\.?\s*№?/i, 0, hr + 1);
    const o = {
      hr, first: hr + 1,
      num: inRow(/^№$/, 0), region: inRow(/^худуд/i, 1), name: inRow(/^(номи|название|наименование)/i, 2),
      login: hLogin.c, pass: inRow(/^(парол|пароль|password)/i, hLogin.c + 1), id: inRow(/^id$/i, hLogin.c + 2),
      prepay: (() => { const f = find(/^олдиндан/i, 0, hr + 1); return f ? f.c : inRow(/^олдиндан/i, 6); })(),
      totRow: tot ? tot.r : 0,
      meter: met ? met.c : 8,
      actStart: act ? act.c : 9, reaStart: rea ? rea.c : 18,
      cos: cos ? cos.c : 27, total: tot ? tot.c : 28,
    };
    // Kabinet bosh sahifasidagi ma'lumotlar (ixtiyoriy ustunlar; sarlavha bo'lmasa — o'tkazib yuboriladi)
    const hInn = find(/^(inn|инн|stir|стир)\s*$/i, 0, hr + 1);
    const hCn = find(/^(sh\w*noma|шартнома|договор)\s*(raqami|рақами|номер|№)/i, 0, hr + 1);
    const hCd = find(/^(sh\w*noma|шартнома|договор)\s*(sanasi|санаси|дата)/i, 0, hr + 1);
    o.inn = hInn ? hInn.c : null; o.cNo = hCn ? hCn.c : null; o.cDate = hCd ? hCd.c : null;
    const pay = find(/^(тўланадиган|туланадиган|тулан)/i, 0, hr + 1);
    o.payNew = !pay;
    o.pay = pay ? pay.c : o.total + 1;
    return o;
  }

  // =====================================================================
  // 5) Asosiy funksiya
  // =====================================================================
  // opts: { onlyEmpty: bool (faqat bo'sh kataklarga yozish), appendMissing: bool (jadvalda yo'q loginni oxiriga qo'shish; standart: true) }
  function fillJadval(XLSX, arrayBuffer, results, opts = {}) {
    const bytes = new Uint8Array(arrayBuffer);
    const CFB = XLSX.CFB;
    const cfb = CFB.read(bytes, { type: 'array' });
    const se = entry(CFB, cfb, firstSheetPath(CFB, cfb));
    const sheetXml = readText(se);
    const sste = CFB.find(cfb, 'xl/sharedStrings.xml') || CFB.find(cfb, '/xl/sharedStrings.xml');
    const sst = sste ? parseSst(readText(sste)) : [];
    const ste = CFB.find(cfb, 'xl/styles.xml') || CFB.find(cfb, '/xl/styles.xml');
    const styler = makeStyler(ste ? readText(ste) : '');

    const P = parseRows(sheetXml);
    const K = analyze(P, sst);
    const R = P.rows;
    const origLen = R.length, oldLast = R.length;
    const onlyEmpty = !!opts.onlyEmpty;
    const appendMissing = opts.appendMissing !== false;

    // --- natijalardan loginlar bo'yicha qatorlar spetsifikatsiyasi
    const accounts = [];
    const report = [];
    for (const r of results || []) {
      if (!r) continue;
      if (r.status !== 'ok' || !r.parts || !r.parts.invoice) {
        report.push({ login: r.login, status: 'skip', message: r.message || "Ma'lumot yo'q (kirish/yig'ish xatosi)" });
        continue;
      }
      const acc = buildAccount(XLSX, r);
      if (acc.error) { report.push({ login: r.login, status: 'skip', message: acc.error }); continue; }
      accounts.push(acc);
    }

    // --- mavjud qatorlar: login bo'yicha
    const blank = (row) => ![...row.cells.values()].some((c) => hasContent(c, sst));
    const byLogin = new Map();
    for (let i = K.first; i < R.length; i++) {
      const lg = stripZeros(cellText(R[i].cells.get(K.login), sst));
      if (!lg) continue;
      if (!byLogin.has(lg)) byLogin.set(lg, []);
      byLogin.get(lg).push(R[i]);
    }
    let maxNo = 0;
    for (let i = K.first; i < R.length; i++) { const v = num(cellText(R[i].cells.get(K.num), sst)); if (Number.isFinite(v) && v > maxNo) maxNo = v; }

    // namuna qator: uslublar shu qatordan olinadi (birinchi ma'lumot qatori — odatda to'ldirilgan namuna)
    const protoRow = R[K.first];
    const protoS = (c) => { const x = protoRow && protoRow.cells.get(c); return x && x.s != null ? x.s : null; };
    const blankSrc = (() => { for (let i = K.first; i < R.length; i++) if (blank(R[i])) return R[i]; return R[R.length - 1]; })();
    const blankStyles = new Map([...blankSrc.cells].map(([c, x]) => [c, x.s]));
    const blankAttrs = blankSrc.attrs;
    const cloneBlank = () => {
      const cells = new Map();
      for (const [c, st] of blankStyles) cells.set(c, { s: st, t: null, inner: '' });
      return { orig: 0, attrs: blankAttrs, cells, fresh: true };
    };
    const claimBlank = () => {
      for (let i = K.first; i < R.length; i++) if (!R[i].claimed && blank(R[i])) { R[i].claimed = true; return R[i]; }
      const row = cloneBlank(); row.claimed = true; R.push(row); return row;
    };

    // --- Логин / Парол ustunlari matn formatida bo'lsin; login boshidagi 0 tiklansin (aniq login manbadan: natijalar yoki opts.logins)
    {
      const exact = new Map();
      for (const l of (opts.logins || [])) { const k = stripZeros(l); if (k && !exact.has(k)) exact.set(k, clean(l)); }
      for (const r of results || []) { const k = r && stripZeros(r.login); if (k) exact.set(k, clean(r.login)); }
      for (let i = K.first; i < R.length; i++) {
        for (const c of [K.login, K.pass]) {
          const ex = R[i].cells.get(c);
          const base = ex && ex.s != null ? ex.s : (protoS(c) != null ? protoS(c) : null);
          const s2 = base != null ? styler.styleFor(base, '@') : null;
          if (c === K.login) {
            const cur = clean(cellText(ex, sst));
            const want = cur && exact.get(stripZeros(cur));
            if (want && want !== cur) { R[i].cells.set(c, { s: s2, t: 'inlineStr', inner: `<is><t xml:space="preserve">${esc(want)}</t></is>` }); continue; }
          }
          if (ex) { if (s2 != null) ex.s = s2; } else if (s2 != null) R[i].cells.set(c, { s: s2, t: null, inner: '' });
        }
      }
    }

    // --- qatorlarni ajratish: hisoblagich raqami bo'yicha moslash, qolganlari — tartib bilan, yetmasa — pastiga qo'shiladi
    const meterOf = (row) => String(cellText(row.cells.get(K.meter), sst) || '').trim().replace(/^0+(?=\d)/, '');
    const plan = [];
    for (const acc of accounts) {
      const key = stripZeros(acc.login);
      let target = (byLogin.get(key) || []).slice();
      let mode = 'match';
      const pairs = [];
      let first = null;
      if (!target.length) {
        if (!appendMissing) { report.push({ login: acc.login, status: 'skip', message: "Jadvalda bu login yo'q" }); continue; }
        mode = 'new';
        for (const spec of acc.rows) pairs.push({ spec, row: claimBlank() });
        target = pairs.map((p) => p.row);
        byLogin.set(key, target.slice());
        first = target[0];
      } else {
        target.forEach((x) => { x.claimed = true; });
        first = target[0];
        const free = target.slice(), rest = [];
        for (const spec of acc.rows) {
          const sm = String(spec.meter || '').trim().replace(/^0+(?=\d)/, '');
          const idx = sm ? free.findIndex((r) => meterOf(r) === sm) : -1;
          if (idx >= 0) pairs.push({ spec, row: free.splice(idx, 1)[0] }); else rest.push(spec);
        }
        const extraSpecs = [];
        for (const spec of rest) {
          const idx = free.findIndex((r) => !meterOf(r));
          if (idx >= 0) pairs.push({ spec, row: free.splice(idx, 1)[0] }); else extraSpecs.push(spec);
        }
        let anchor = target[target.length - 1];
        for (const spec of extraSpecs) {
          const nr = cloneBlank(); nr.claimed = true; nr.cont = true; nr.copyFrom = anchor;
          R.splice(R.indexOf(anchor) + 1, 0, nr);
          anchor = nr; pairs.push({ spec, row: nr }); mode = 'extended';
        }
        for (const r of free) report.push({ login: acc.login, status: 'warn', message: `Jadvaldagi hisoblagich ${meterOf(r)} bo'yicha ma'lumotda mos hisoblagich topilmadi — qator o'zgartirilmadi` });
        byLogin.set(key, target.concat(pairs.filter((p) => p.row.cont).map((p) => p.row)));
      }
      plan.push({ acc, pairs, mode, first });
    }
    // qo'shilgan bo'sh qatorlar hisobiga jadval o'lchamini (150 qator) saqlab qolish
    while (R.length > origLen && R.length > K.first && !R[R.length - 1].claimed && blank(R[R.length - 1])) R.pop();

    // --- qatorlarni qayta raqamlash (formulalar siljiydi)
    R.forEach((row, i) => {
      const nn = i + 1;
      if (row.orig && row.orig !== nn) {
        for (const x of row.cells.values()) if (x.inner && /<f\b/.test(x.inner)) x.inner = x.inner.replace(/(<f\b[^>]*>)([^<]*)(<\/f>)/, (m, a, f, b) => a + shiftFormula(f, nn - row.orig) + b);
      }
      row.num = nn;
    });

    // --- yozish
    const DATA = (st) => [st, st + 1, st + 2, st + 3, st + 4, st + 5, st + 6, st + 7];
    const F3 = '#,##0.000';
    const written = [];
    for (const { acc, pairs, mode, first } of plan) {
      pairs.forEach(({ spec, row }, i) => {
        const n = row.num;
        const put = (col, d, fmt) => {
          const ex = row.cells.get(col);
          if (onlyEmpty && hasContent(ex, sst)) return;
          const base = (col >= K.meter) ? (protoS(col) != null ? protoS(col) : (ex && ex.s)) : (ex ? ex.s : null);
          const s = fmt && base != null ? styler.styleFor(base, fmt) : base;
          let inner = '', t = null;
          if (d.f != null) inner = `<f>${esc(d.f)}</f>${d.v == null ? '' : `<v>${nStr(d.v)}</v>`}`;
          else if (typeof d.v === 'number') inner = `<v>${nStr(d.v)}</v>`;
          else if (d.v !== '' && d.v != null) { t = 'inlineStr'; inner = `<is><t xml:space="preserve">${esc(String(d.v))}</t></is>`; }
          row.cells.set(col, { s, t, inner });
        };
        const clear = (col, fmt) => {
          const ex = row.cells.get(col);
          if (onlyEmpty && hasContent(ex, sst)) return;
          const base = protoS(col) != null ? protoS(col) : (ex && ex.s);
          row.cells.set(col, { s: fmt && base != null ? styler.styleFor(base, fmt) : base, t: null, inner: '' });
        };

        // Qo'shilgan qatorga Худуд/Номи/Логин/Парол/ID — oldingi qatordan nusxa (o'zgarishsiz). Aks holda faqat bo'sh login to'ldiriladi.
        const cur = (c) => cellText(row.cells.get(c), sst);
        if (row.cont && row.copyFrom) {
          for (const c of [K.region, K.name, K.login, K.pass, K.id]) { const x = row.copyFrom.cells.get(c); if (x) row.cells.set(c, { s: x.s, t: x.t, inner: x.inner }); }
        } else if (!cur(K.login)) put(K.login, { v: (mode === 'new' && i > 0) ? (cellText(pairs[0].row.cells.get(K.login), sst) || acc.login) : acc.login });

        // Kabinet bosh sahifasidagi INN, shartnoma raqami va sanasi (faqat haqiqiy qiymat bo'lsa; matn formatida, boshidagi 0 saqlanadi)
        if (acc.detail) {
          const putTxt = (col, v) => {
            if (col == null || !v) return;
            const ex = row.cells.get(col);
            if (onlyEmpty && hasContent(ex, sst)) return;
            const base = ex && ex.s != null ? ex.s : protoS(col);
            row.cells.set(col, { s: base != null ? styler.styleFor(base, '@') : null, t: 'inlineStr', inner: `<is><t xml:space="preserve">${esc(String(v))}</t></is>` });
          };
          putTxt(K.inn, acc.detail.inn);
          putTxt(K.cNo, acc.detail.contractNo);
          const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(acc.detail.contractDate);
          putTxt(K.cDate, m ? `${m[3]}.${m[2]}.${m[1]}` : acc.detail.contractDate);
        }

        // hisoblagich raqami
        put(K.meter, { v: spec.meter || '' });

        const [aP, aC, aK, aM, aL, aT, aTar, aS] = DATA(K.actStart);
        const [rP, rC, rK, rM, rL, rT, rTar, rS] = DATA(K.reaStart);
        const fmts = { [aP]: F3, [aC]: F3, [aK]: null, [aM]: F3, [aL]: F3, [aT]: F3, [rP]: F3, [rC]: F3, [rM]: F3, [rL]: F3, [rT]: F3 };
        for (const c of [...DATA(K.actStart), ...DATA(K.reaStart)]) clear(c, fmts[c]);
        clear(K.cos); clear(K.total);

        const L = colL;
        const a = spec.a, rr = spec.r;
        if (a) {
          put(aP, { v: r6(a.prev) }, F3); put(aC, { v: r6(a.cur) }, F3); put(aK, { v: a.koef });
        }
        if (spec.hasA) {
          const netA = r6((((a ? a.cur : 0) - (a ? a.prev : 0)) * (a ? a.koef : 0)));
          put(aM, { f: `(${L(aC)}${n}-${L(aP)}${n})*${L(aK)}${n}`, v: netA }, F3);
          put(aL, { v: spec.N }, F3); put(aT, { v: spec.O }, F3);
          if (spec.P != null) put(aTar, { v: spec.P });
          put(aS, { f: `(${L(aM)}${n}+${L(aL)}${n}+${L(aT)}${n})*${L(aTar)}${n}`, v: r2(spec.calcQ) });
        }
        if (rr) {
          put(rP, { v: r6(rr.prev) }, F3); put(rC, { v: r6(rr.cur) }, F3); put(rK, { v: rr.koef });
        }
        if (spec.hasR) {
          const netR = r6((((rr ? rr.cur : 0) - (rr ? rr.prev : 0)) * (rr ? rr.koef : 0)));
          put(rM, { f: `(${L(rC)}${n}-${L(rP)}${n})*${L(rK)}${n}`, v: netR }, F3);
          put(rL, { v: spec.W }, F3); put(rT, { v: spec.X }, F3);
          if (spec.Y != null) put(rTar, { v: spec.Y });
          put(rS, { f: `(${L(rM)}${n}+${L(rL)}${n}+${L(rT)}${n})*${L(rTar)}${n}`, v: r2(spec.calcZ) });
        }
        if (spec.cos != null) put(K.cos, { v: spec.cos });
        put(K.total, { f: `${L(aS)}${n}+${L(rS)}${n}+${L(K.cos)}${n}`, v: r2(spec.calcQ + spec.calcZ + (spec.cos || 0)) });

        row.totVal = r2(spec.calcQ + spec.calcZ + (spec.cos || 0));
        written.push({ login: acc.login, meter: spec.meter, row: n, mode: row.cont ? 'extended' : mode, notes: spec.notes });
      });
      // Олдиндан тулов: kabinet bosh sahifasidagi «Chiqish qoldig'i» (manfiy = oldindan to'lov) — musbat qilib, loginning birinchi qatoriga
      if (K.prepay != null && first && acc.balance != null) {
        if (acc.balance < 0) {
          const ex = first.cells.get(K.prepay);
          if (!(onlyEmpty && hasContent(ex, sst))) first.cells.set(K.prepay, { s: ex ? ex.s : null, t: null, inner: `<v>${nStr(r2(-acc.balance))}</v>` });
        } else {
          const ex = first.cells.get(K.prepay);
          if (!(onlyEmpty && hasContent(ex, sst))) first.cells.set(K.prepay, { s: ex ? ex.s : null, t: null, inner: '' });
          if (acc.balance > 0) acc.infos.push(`Chiqish qoldig'i ${r2(acc.balance)} so'm (qarz) — «Олдиндан тулов» ga yozilmadi`);
        }
      }
    }

    // --- № (har bir filialga bitta raqam) va «Тўланадиган сумма» (bir qatorli filialda — «Жами» nusxasi, 2 va undan ortiq qatorda — «Жами» yig'indisi)
    // Filial = ketma-ket kelgan, login va Номи bir xil qatorlar (qo'shimcha hisoblagich / «сверх дог.вел» qatorlari shu filialga kiradi).
    const txtOf = (row, c) => String(cellText(row.cells.get(c), sst) || '').trim();
    const isData = (row) => !!(txtOf(row, K.region) || txtOf(row, K.name) || txtOf(row, K.login));
    const groups = [];
    for (let i = K.first; i < R.length; i++) {
      if (!isData(R[i])) continue;
      const lg = stripZeros(txtOf(R[i], K.login)), nm = txtOf(R[i], K.name);
      const last = groups[groups.length - 1];
      if (lg && last && last.lg === lg && last.nm === nm && last.rows[last.rows.length - 1] === R[i - 1]) last.rows.push(R[i]);
      else groups.push({ lg, nm, rows: [R[i]] });
    }
    const rowTot = (row) => {
      if (row.totVal != null) return row.totVal;
      const m = /<v>([^<]*)<\/v>/.exec((row.cells.get(K.total) || {}).inner || '');
      return m && Number.isFinite(+m[1]) ? +m[1] : 0;
    };
    const baseS = (c, row) => { const x = row.cells.get(c); return x && x.s != null ? x.s : (protoS(c) != null ? protoS(c) : null); };
    const payS = protoS(K.total);
    const mergesNew = [];
    for (let i = K.first; i < R.length; i++) {
      R[i].cells.set(K.num, { s: baseS(K.num, R[i]), t: null, inner: '' });
      R[i].cells.set(K.pay, { s: payS != null ? payS : baseS(K.total, R[i]), t: null, inner: '' });
    }
    groups.forEach((g, gi) => {
      const r1 = g.rows[0];
      r1.cells.set(K.num, { s: baseS(K.num, r1), t: null, inner: `<v>${gi + 1}</v>` });
      if (g.rows.length >= 2 && K.prepay != null) {
        // Олдиндан тулов: bir filialning bir nechta qatori uchun bitta qiymat — birlashgan katak
        const withVal = g.rows.find((x) => hasContent(x.cells.get(K.prepay), sst));
        const keep = withVal ? withVal.cells.get(K.prepay) : null;
        g.rows.forEach((x, idx) => {
          const ex = x.cells.get(K.prepay);
          x.cells.set(K.prepay, { s: ex ? ex.s : null, t: idx === 0 && keep ? keep.t : null, inner: idx === 0 && keep ? keep.inner : '' });
        });
        mergesNew.push(`${colL(K.prepay)}${g.rows[0].num}:${colL(K.prepay)}${g.rows[g.rows.length - 1].num}`);
      }
      if (g.rows.length === 1) {
        // bitta hisoblagichli filial: «Жами» qiymati o'zi ko'chiriladi (ma'lumot bo'lmasa — bo'sh)
        const tc = r1.cells.get(K.total);
        if (hasContent(tc, sst)) r1.cells.set(K.pay, { s: payS != null ? payS : baseS(K.total, r1), t: null, inner: `<f>${colL(K.total)}${r1.num}</f><v>${nStr(rowTot(r1))}</v>` });
      } else if (g.rows.length >= 2) {
        const a = g.rows[0].num, b = g.rows[g.rows.length - 1].num;
        const sumV = r2(g.rows.reduce((t, x) => t + rowTot(x), 0));
        r1.cells.set(K.pay, { s: payS != null ? payS : baseS(K.total, r1), t: null, inner: `<f>SUM(${colL(K.total)}${a}:${colL(K.total)}${b})</f><v>${nStr(sumV)}</v>` });
        mergesNew.push(`${colL(K.num)}${a}:${colL(K.num)}${b}`, `${colL(K.pay)}${a}:${colL(K.pay)}${b}`);
      }
    });
    // sarlavha: yangi ustun bo'lsa «Жами» sarlavhasining nusxasi
    const headMerges = [];
    if (K.payNew) {
      for (const hrI of [K.totRow, K.totRow + 1]) {
        const src = R[hrI] && R[hrI].cells.get(K.total);
        if (!src) continue;
        const txt = hrI === K.totRow ? 'Тўланадиган сумма' : '';
        R[hrI].cells.set(K.pay, { s: src.s, t: txt ? 'inlineStr' : null, inner: txt ? `<is><t xml:space="preserve">${txt}</t></is>` : '' });
      }
      headMerges.push([`${colL(K.total)}${K.totRow + 1}:${colL(K.total)}${K.totRow + 2}`, `${colL(K.pay)}${K.totRow + 1}:${colL(K.pay)}${K.totRow + 2}`]);
    }

    // --- umumiy: qatorlar soni o'zgargan bo'lsa — diapazonlarni moslash
    const newLast = R.length;
    let tail = P.tail;
    let head = P.head;
    if (newLast !== oldLast) {
      const fixRef = (s) => s.replace(new RegExp(`(\\$?[A-Z]+\\$?)${oldLast}\\b`, 'g'), `$1${newLast}`);
      for (let i = 0; i < K.first; i++) for (const x of R[i].cells.values()) if (x.inner && /<f\b/.test(x.inner)) x.inner = x.inner.replace(/(<f\b[^>]*>)([^<]*)(<\/f>)/, (m, a, f, b) => a + fixRef(f) + b);
      head = head.replace(/(<dimension ref="[^"]*?)(\d+)(")/, (m, a, d, b) => `${a}${newLast}${b}`);
      tail = tail.replace(/(<autoFilter\b[^>]*\bref="[^"]*?)(\d+)(")/, (m, a, d, b) => `${a}${newLast}${b}`);
    }
    // birlashtirilgan kataklar: № va «Тўланадиган сумма» ustunlaridagi eskilarini olib tashlab, yangilarini qo'yamiz
    {
      const pl = colL(K.pay), nl = colL(K.num), gl = K.prepay != null ? colL(K.prepay) : '@@';
      const kept = [];
      let have = [];
      tail = tail.replace(/<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/, (m, inner) => {
        have = [...inner.matchAll(/<mergeCell\s+ref="([^"]+)"\s*\/>/g)].map((x) => x[1]);
        return '@@MERGES@@';
      });
      for (const ref of have) {
        const mm = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
        if (mm && (mm[1] === nl || mm[1] === pl || mm[1] === gl) && mm[1] === mm[3] && +mm[2] >= K.first + 1) continue;
        kept.push(ref);
      }
      for (const [src, dst] of headMerges) if (kept.includes(src) && !kept.includes(dst)) kept.push(dst);
      const all = kept.concat(mergesNew);
      const xmlM = all.length ? `<mergeCells count="${all.length}">${all.map((r) => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>` : '';
      if (tail.includes('@@MERGES@@')) tail = tail.replace('@@MERGES@@', xmlM);
      else if (xmlM) {
        const at = tail.search(/<(phoneticPr|conditionalFormatting|dataValidations|hyperlinks|printOptions|pageMargins|pageSetup|drawing)\b/);
        tail = at >= 0 ? tail.slice(0, at) + xmlM + tail.slice(at) : tail.replace('</worksheet>', xmlM + '</worksheet>');
      }
    }
    // yangi ustun: kengligi, o'lchami (dimension) va qator oralig'i (spans)
    if (K.payNew && /<cols>/.test(head)) {
      const cd = new RegExp(`<col\\b[^>]*\\bmin="${K.total + 1}"[^>]*/>`).exec(head);
      const st = cd ? (/\bstyle="(\d+)"/.exec(cd[0]) || [])[1] : null;
      head = head.replace('</cols>', `<col min="${K.pay + 1}" max="${K.pay + 1}" width="21.29" ${st ? `style="${st}" ` : ''}customWidth="1"/></cols>`);
    }
    head = head.replace(/(<dimension ref="[A-Z]+\d+:)([A-Z]+)(\d+)(")/, (m, a, c, d, e) => `${a}${colIdx0(c) >= K.pay ? c : colL(K.pay)}${d}${e}`);
    const hiSpan = K.pay + 1;
    R.forEach((row) => { row.attrs = row.attrs.replace(/\bspans="(\d+):(\d+)"/, (m, a, b) => (+b < hiSpan ? `spans="${a}:${hiSpan}"` : m)); });
    const newSheet = head + serialize(R) + tail;

    // formulalar qayta hisoblansin
    se.content = TE.encode(newSheet);
    if (ste) ste.content = TE.encode(styler.finish());
    const we = entry(CFB, cfb, 'xl/workbook.xml');
    let wx = readText(we);
    if (newLast !== oldLast) wx = wx.replace(new RegExp(`(\\$[A-Z]+\\$\\d+:\\$[A-Z]+\\$)${oldLast}\\b`, 'g'), `$1${newLast}`);
    if (/<calcPr\b/.test(wx)) { if (!/fullCalcOnLoad=/.test(wx)) wx = wx.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"'); }
    else wx = wx.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    we.content = TE.encode(wx);
    const out = CFB.write(cfb, { fileType: 'zip', type: 'array', compression: true });

    for (const w of written) report.push({ ...w, status: 'ok' });
    for (const p of plan) if (p.acc.check) report.push({ login: p.acc.login, status: 'check', ok: p.acc.check.ok, table: p.acc.check.table, cabinet: p.acc.check.cabinet, diff: p.acc.check.diff });
    for (const p of plan) {
      const list = [...p.acc.warnings, ...p.acc.infos];
      if (list.length) report.push({ login: p.acc.login, status: p.acc.warnings.length ? 'warn' : 'info', message: list.join('; ') });
    }
    return {
      data: new Uint8Array(out), report,
      accounts: plan.length, rows: written.length,
      added: plan.filter((p) => p.mode === 'new').length,
      lastRow: newLast,
    };
  }

  const api = { fillJadval, buildAccount, invoiceRows, resultsFromFiles, loginFromName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.HetJadval = api;
})();
