// =====================================================================
//  1C 4790 to'ldiruvchi — sahifa ichidagi skript (v1.9.1)
//  1) «ОСВ по счету 4790» dan qizil (minus) qoldiqli xodimlarni o'qiydi.
//     Hisobot 1C web-klientida «moxel» iframe'larida div kataklar bilan
//     chiziladi — ustunlar ekrandagi o'rni bo'yicha aniqlanadi.
//  2) «Операция (введенная вручную)»da tanlangan namuna 4790 qatoridan
//     F9 bilan nusxa olib, har bir xodim uchun yangi qator to'ldiradi.
//  Hech qachon «Записать» yoki «Провести» bosmaydi.
// =====================================================================
(() => {
  // Bir sahifaga ikki marta yuklanmasin; lekin extension yangilangan bo'lsa (eski nusxa «o'lik») — qayta yuklanadi.
  try { if (typeof window.__u4790Alive === "function" && window.__u4790Alive()) return; } catch (e) { /* eski nusxa o'lik */ }
  window.__u4790Alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };

  // ---------- Sozlamalar ----------
  const ACCOUNT = "4790";
  const GRID_SUFFIX = "_Хозрасчетный";
  // «Операция» jadvalidagi ustun indekslari (colindex) — TestDB11 formasidan o'qilgan.
  const COL = { num: 0, schetDt: 2, podrDt: 7, subDt1: 8, schetKt: 12, podrKt: 17, subKt1: 18, subKt2: 19, subKt3: 20, summa: 22, nuDt: 25, nuKt: 29 };
  // Har bir ustun bosilganda ochilishi kerak bo'lgan maydon (tekshiruv uchun).
  const FIELD = { 2: "СчетДт", 7: "ПодразделениеДт", 8: "СубконтоДт1", 12: "СчетКт", 17: "ПодразделениеКт", 18: "СубконтоКт1", 19: "СубконтоКт2", 20: "СубконтоКт3", 22: "Сумма", 25: "СуммаНУДт", 29: "СуммаНУКт" };
  // Кт namunasi: qaysi katakdan qaysi maydonga (Add usulida shu tartibda to'ldiriladi).
  const KT_PARTS = [["schet", COL.schetKt, "Кт hisob"], ["podr", COL.podrKt, "Кт bo'lim"], ["sub1", COL.subKt1, "Кт subkonto 1"], ["sub2", COL.subKt2, "Кт subkonto 2"], ["sub3", COL.subKt3, "Кт subkonto 3"]];

  // ---------- Yordamchi funksiyalar ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "")
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ").trim().toUpperCase();

  // Raqam "1 080 000,00" (rus) ham, "1,080,000.00" (ingliz) ham bo'lishi mumkin.
  const isNum = (s) => { const t = (s || "").trim(); return /^[-−]?[\d\s  .,]+$/.test(t) && /\d/.test(t); };
  const decimalSep = (s) => { const m = String(s || "").trim().match(/\d([.,])\d{2}$/); return m ? m[1] : null; };
  const parseNum = (s) => {
    let t = String(s || "").replace(/[\s  ]/g, "").replace("−", "-");
    if (!t) return 0;
    const lc = t.lastIndexOf(","), ld = t.lastIndexOf(".");
    let dec = null;
    if (lc > -1 && ld > -1) dec = lc > ld ? "," : ".";
    else if (lc > -1 || ld > -1) {
      const sep = lc > -1 ? "," : ".";
      const count = t.split(sep).length - 1;
      const after = t.length - t.lastIndexOf(sep) - 1;
      if (count === 1 && after <= 2) dec = sep;          // "1080000,5" / "1080000.50"
    }
    const thou = dec === "," ? "." : dec === "." ? "," : null;
    if (thou) t = t.split(thou).join("");
    else if (!dec) t = t.replace(/[.,]/g, "");           // faqat ming ajratgichlar bor
    if (dec) t = t.replace(dec, ".");
    const n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  };
  const fmt = (n) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // 1C maydoniga yoziladigan summa: ming ajratgichsiz; kasr bo'lsa — 1C dagi ajratgich bilan.
  const amountText = (n, dec = ",") => (Math.round(n * 100) % 100 === 0 ? String(Math.round(n)) : n.toFixed(2).replace(".", dec));
  const visible = (el) => !!(el && el.offsetParent);

  const bg = (msg) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res || !res.ok) return reject(new Error((res && res.error) || "Fon skripti javob bermadi"));
      resolve();
    });
  });
  const center = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 12)) }; };
  const clickEl = async (el, count = 1) => { const p = center(el); await bg({ cmd: "click", x: p.x, y: p.y, count }); };
  const key = (k, modifiers = 0) => bg({ cmd: "key", key: k, modifiers });
  const typeText = (text, delay = 0) => bg({ cmd: "type", text, delay });
  const insertText = (text) => bg({ cmd: "insert", text });
  // Escape FAQAT jadval katagi tahrirda bo'lsa bosiladi. Tahrirdan tashqarida Escape 1C'da HUJJAT OYNASINI YOPADI.
  const inGridEditor = () => { const a = document.activeElement; return !!(a && a.tagName === "INPUT" && a.id && a.id.includes(GRID_SUFFIX)); };
  const safeEscape = async () => { if (inGridEditor()) { await key("Escape"); await sleep(300); } };
  // Mac'da «hammasini belgilash» — Cmd+A (CDP modifiers: Meta=4), Windows'da — Ctrl+A (Ctrl=2).
  const IS_MAC = /Mac/i.test(navigator.platform || navigator.userAgent);
  const selectAll = async () => {
    const a = document.activeElement;
    if (a && a.tagName === "INPUT" && typeof a.select === "function") a.select();   // DOM orqali ham belgilaymiz
    await key("a", IS_MAC ? 4 : 2);
  };

  // Tez yozish: matn bir yo'la joylanadi, oxirgi belgi haqiqiy tugma bilan bosiladi (1C qidiruvini ishga tushiradi).
  // Natija maydonda AYNAN shu matnmi — tekshiriladi; bo'lmasa tozalab qayta yoziladi.
  async function fastType(text) {
    const want = norm(text);
    for (let attempt = 1; attempt <= 2; attempt++) {
      const inp = document.activeElement;
      if (inp && inp.tagName === "INPUT") inp.select();
      await selectAll();
      await key("Backspace");
      if (text.length > 1) await insertText(text.slice(0, -1));
      await typeText(text.slice(-1));
      await sleep(40);
      const a = document.activeElement;
      const got = a && a.tagName === "INPUT" ? a.value : null;
      if (got === null || norm(got) === want) return;
      if (attempt === 2) throw new Error("Maydonga «" + text + "» o'rniga «" + got + "» yozildi.");
    }
  }

  // ---------- Holat ----------
  let state = { items: [], log: [], kt: null };
  let stopFlag = false;
  let running = false;   // to'ldirish paytida Кт avtomatik yangilanmaydi
  const save = () => chrome.storage.local.set({ u4790: { items: state.items, kt: state.kt } });
  const load = async () => { const d = await chrome.storage.local.get("u4790"); if (d.u4790) { state.items = d.u4790.items || []; state.kt = d.u4790.kt || null; } };

  // =================================================================
  //  1. ОСВ ni o'qish
  // =================================================================

  // Ko'rinib turgan «moxel» iframe'laridagi barcha matnli kataklar (ekran koordinatalari bilan).
  function collectMoxelCells() {
    const cells = [];
    for (const f of document.querySelectorAll("iframe")) {
      if (!f.offsetParent || !f.offsetWidth || !f.offsetHeight) continue;
      let d; try { d = f.contentDocument; } catch (e) { continue; }
      if (!d || !d.documentElement) continue;
      const fr = f.getBoundingClientRect();
      for (const e of d.querySelectorAll("div[class]")) {
        if (!/(^|\s)R\d+C\d+(\s|$)/.test(e.className)) continue;
        const text = (e.innerText || e.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        const r = e.getBoundingClientRect();
        const sp = e.querySelector("span") || e;
        const cs = d.defaultView.getComputedStyle(sp);
        cells.push({ x: fr.left + r.left, y: fr.top + r.top, w: r.width, text, color: cs.color, bold: (parseInt(cs.fontWeight, 10) || 400) >= 600 });
      }
    }
    return cells;
  }

  // Kataklardan qatorlar: sarlavhadagi «Дебет/Кредит» joylashuvi = ustunlar.
  function parseMoxelCells(cells) {
    const heads = cells.filter((c) => /^(дебет|debit|кредит|credit)$/i.test(c.text)).sort((a, b) => a.x - b.x);
    const cols = [];
    heads.forEach((h) => { if (!cols.some((c) => Math.abs(c.x - h.x) < 3)) cols.push(h); });
    if (cols.length < 2 || cols.length % 2) return null;
    const headY = Math.max(...cols.map((c) => c.y));
    const firstX = cols[0].x;
    const rows = [];
    cells.filter((c) => c.y > headY + 2).sort((a, b) => a.y - b.y || a.x - b.x).forEach((c) => {
      let r = rows.find((r) => Math.abs(r.y - c.y) < 4);
      if (!r) { r = { y: c.y, cells: [] }; rows.push(r); }
      r.cells.push(c);
    });
    const items = [];
    let groupColor = null, totalVec = null;
    for (const r of rows) {
      const nameCell = r.cells.find((c) => !isNum(c.text) && c.x < firstX - 1);
      if (!nameCell) continue;
      const vec = cols.map((col) => {
        const c = r.cells.find((c) => isNum(c.text) && Math.abs(c.x - col.x) < Math.max(4, col.w / 2));
        return c ? parseNum(c.text) : 0;
      });
      const nn = norm(nameCell.text);
      if (/^\d{4}/.test(nn)) { groupColor = groupColor || nameCell.color; continue; }   // «4790, Расчеты…»
      if (/^(ИТОГО|TOTAL|ВСЕГО)/.test(nn)) { totalVec = vec; continue; }
      items.push({ name: nameCell.text, vec, color: nameCell.color, bold: nameCell.bold });
    }
    const dec = decimalSep((cells.find((c) => isNum(c.text) && decimalSep(c.text)) || {}).text) || ",";
    return { items, nCols: cols.length, groupColor, totalVec, dec };
  }

  // Eski usul: oddiy <table> (boshqa 1C versiyalari uchun zaxira).
  function allTables(doc = document, acc = []) {
    try {
      acc.push(...doc.querySelectorAll("table"));
      for (const f of doc.querySelectorAll("iframe")) {
        try { if (f.contentDocument) allTables(f.contentDocument, acc); } catch (e) { /* boshqa domen */ }
      }
    } catch (e) { /* e'tiborsiz */ }
    return acc;
  }
  function tableToRows(table) {
    return [...table.rows].map((tr) => {
      const cells = [];
      for (const td of tr.cells) { cells.push((td.innerText || "").replace(/\s+/g, " ").trim()); for (let i = 1; i < (td.colSpan || 1); i++) cells.push(""); }
      return cells;
    });
  }

  function readOsvFromPage() {
    const cells = collectMoxelCells();
    const m = cells.length ? parseMoxelCells(cells) : null;
    if (m && m.items.length) return finishParse(m.items, m.nCols, m);
    const t = allTables().filter((x) => /Сальдо/i.test(x.innerText || "") && (x.innerText || "").includes(ACCOUNT));
    if (t.length) return readOsvFromRows(tableToRows(t.sort((a, b) => b.rows.length - a.rows.length)[0]));
    throw new Error("Ko'rinib turgan ОСВ hisoboti topilmadi. «ОСВ по счету " + ACCOUNT + "» yorlig'ini OCHIB, «Сформировать» bosilganiga ishonch hosil qiling.");
  }

  // Nusxa joylash (Ctrl+C → Ctrl+V) yoki <table> qatorlari.
  function readOsvFromRows(rows) {
    const h = rows.findIndex((r) => r.filter((c) => /^(дебет|debit)$/i.test(c)).length >= 2);
    if (h < 0) throw new Error("ОСВ sarlavhasida «Дебет/Кредит» ustunlari topilmadi.");
    const P = [];
    rows[h].forEach((c, i) => { if (/^(дебет|debit|кредит|credit)$/i.test(c)) P.push(i); });
    if (P.length % 2 !== 0) throw new Error("Дебет/Кредит ustunlari soni juft emas — ОСВ tuzilishi kutilganidek emas.");
    const items = [];
    let totalVec = null, dec = ",";
    for (let i = h + 1; i < rows.length; i++) {
      const c = rows[i];
      const name = c.slice(0, P[0]).find((x) => x && !isNum(x)) || "";
      if (!name) continue;
      const vec = P.map((p) => parseNum(c[p] || ""));
      c.forEach((x) => { if (isNum(x) && decimalSep(x)) dec = decimalSep(x); });
      const nn = norm(name);
      if (/^\d{4}/.test(nn)) continue;
      if (/^(ИТОГО|TOTAL|ВСЕГО)/.test(nn)) { totalVec = vec; continue; }
      items.push({ name, vec, color: null, bold: false });
    }
    return finishParse(items, P.length, { totalVec, dec });
  }
  const readOsvFromText = (text) => readOsvFromRows(text.split(/\r?\n/).map((l) => l.split("\t").map((c) => c.replace(/\s+/g, " ").trim())));

  // Bo'lim → xodim ierarxiyasi va qizil qoldiqlar.
  function finishParse(items, nCols, opts) {
    if (!items.length) throw new Error("ОСВ da xodim qatorlari topilmadi.");
    const warnings = [];
    const result = [];
    const gc = opts.groupColor;
    let method;
    if (gc && items.some((x) => x.color === gc) && items.some((x) => x.color !== gc)) {
      method = "rang";                                    // bo'lim qatori «4790» qatori bilan bir xil rangda
      let dept = "";
      for (const it of items) { if (it.color === gc) dept = it.name; else result.push({ dept, name: it.name, vec: it.vec }); }
    } else if (items.some((x) => x.bold) && items.some((x) => !x.bold)) {
      method = "qalin shrift";
      let dept = "";
      for (const it of items) { if (it.bold) dept = it.name; else result.push({ dept, name: it.name, vec: it.vec }); }
    } else {
      method = "yig'indi";                                // bo'lim = undan keyingi xodimlar yig'indisi
      const eq = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.005);
      let i = 0;
      while (i < items.length) {
        const r = items[i];
        let acc = r.vec.map(() => 0), found = -1;
        for (let j = i + 1; j < items.length && j - i < 1000; j++) {
          acc = acc.map((v, k) => v + items[j].vec[k]);
          if (eq(acc, r.vec)) { found = j; break; }
        }
        if (found > i) {
          for (let k = i + 1; k <= found; k++) result.push({ dept: r.name, name: items[k].name, vec: items[k].vec });
          i = found + 1;
        } else { result.push({ dept: "", name: r.name, vec: r.vec }); i++; }
      }
      warnings.push("Bo'limlar yig'indi qoidasi bo'yicha aniqlandi — ro'yxatni tekshiring.");
    }
    const kDt = nCols - 2, kKt = nCols - 1;               // oxirgi juftlik = Сальдо на конец периода
    const red = [];
    for (const r of result) {
      const amt = r.vec[kDt] < 0 ? -r.vec[kDt] : (r.vec[kKt] > 0 ? r.vec[kKt] : 0);
      if (amt > 0.004) red.push({ dept: r.dept, name: r.name, amount: Math.round(amt * 100) / 100 });
    }
    if (red.some((r) => !r.dept)) warnings.push("Ba'zi xodimlarning bo'limi aniqlanmadi — ularni qo'lda yozing yoki belgini olib tashlang.");
    return { red, warnings, method, employees: result.length, totalVec: opts.totalVec, nCols, dec: opts.dec || "," };
  }

  // =================================================================
  //  2. «Операция» jadvali bilan ishlash
  // =================================================================
  const findGrid = () => [...document.querySelectorAll('div[id$="' + GRID_SUFFIX + '"]')].find((g) => g.classList.contains("grid") && visible(g));
  // DIQQAT: jadval faqat ko'rinib turgan qatorlarni chizadi, «rowindex» — ekrandagi tartib.
  // Shuning uchun qatorni doim # ustunidagi qator RAQAMI bo'yicha topamiz.
  const lines = (grid) => [...grid.querySelectorAll(".gridLine[rowindex]")];
  const box = (row, col) => row && row.querySelector('.gridBox[colindex="' + col + '"]');
  const cellText = (row, col) => { const b = box(row, col); return b ? (b.innerText || "").trim() : ""; };
  const lineNo = (row) => cellText(row, COL.num);
  const rowByNo = (no) => { const g = findGrid(); return g && lines(g).find((r) => lineNo(r) === String(no)); };
  const selectedRow = (grid) => lines(grid).find((l) => l.classList.contains("select"));
  const activeId = () => { const a = document.activeElement; return a ? (a.id || a.tagName) : ""; };
  const isEditor = (field) => { const a = document.activeElement; return !!(a && a.tagName === "INPUT" && /_i0$/.test(a.id) && a.id.endsWith(GRID_SUFFIX + field + "_i0")); };

  async function waitFor(fn, ms = 4000, step = 150) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(step); }
    return null;
  }

  function templateInfo() {
    const grid = findGrid();
    if (!grid) throw new Error("«Операция (введенная вручную)» yorlig'i ochiq emas. Avval o'sha yorliqqa o'ting.");
    const row = selectedRow(grid);
    if (!row) throw new Error("Jadvalda namuna qator tanlanmagan. Firmaning to'g'ri Кт tomoni yozilgan bitta 4790 qatoriga bir marta bosing.");
    if (norm(cellText(row, COL.schetDt)) !== ACCOUNT) throw new Error("Tanlangan qatorning Дебет hisobi " + ACCOUNT + " emas (" + cellText(row, COL.schetDt) + ").");
    return {
      no: lineNo(row),
      kt: [...row.querySelectorAll(".gridBox")].filter((b) => { const c = +b.getAttribute("colindex"); return c >= 12 && c <= 20; }).map((b) => b.innerText.trim()).filter(Boolean).join(" / ")
    };
  }

  // 1C tanlash ro'yxati (#editDropDown) elementlari: "F.I.Sh. (00-0000162)" → nom va element.
  function dropdownItems() {
    const dd = document.getElementById("editDropDown");
    if (!dd || !dd.offsetParent) return [];
    return [...dd.querySelectorAll(".eddText")].filter((e) => e.offsetParent).map((e) => {
      const t = (e.innerText || "").trim();
      return { el: e, text: t, name: t.replace(/\s*\([^()]*\)\s*$/, "") };
    });
  }

  // Ma'lumotnoma maydoni (bo'lim / xodim): muharrir ochiq bo'lishi shart.
  // Haqiqiy tugmalar bilan yozamiz → 1C qidiruvi ro'yxatda AYNAN shu nomni ko'rsatguncha kutamiz →
  // o'sha element ustiga bosamiz. Ko'r-ko'rona Tab/Enter bosilmaydi (tarixdagi boshqa odam tanlanib qolishi mumkin).
  async function pickRef(field, value, label) {
    if (!(await waitFor(() => isEditor(field), 3000))) throw new Error(label + " maydoni tahrirga ochilmadi (faol: " + activeId() + ").");
    const want = norm(value);
    const cur = document.activeElement && document.activeElement.value;
    if (cur && norm(cur) === want) return;                  // allaqachon to'g'ri — tegmaymiz (keyingi goTo Tab bilan o'tadi)
    await fastType(value);
    const isHit = (i) => norm(i.text) === want || norm(i.name) === want;
    const items = await waitFor(() => { const it = dropdownItems(); return it.some(isHit) ? it : null; }, 6000, 80);
    if (!items) {
      const seen = dropdownItems().map((i) => i.text).join("; ");
      throw new Error(label + " «" + value + "» 1C ro'yxatida topilmadi" + (seen ? " (ro'yxatda: " + seen + ")" : "") + ".");
    }
    const idx = items.findIndex(isHit);
    // Ro'yxatda birinchi element belgilangan bo'ladi; kerakligi boshqa o'rinda bo'lsa — pastga yuramiz.
    for (let i = 0; i < idx; i++) { await key("ArrowDown"); await sleep(60); }
    await key("Tab");                                      // tanlaydi va keyingi maydonga o'tadi (tahrir yopilmaydi)
    await sleep(200);
  }

  // Kerakli maydonga o'tish: tahrirda bo'lsa — Tab bilan oldinga; tahrir yopiq bo'lsa — katakni 2x bosish.
  async function goTo(no, col) {
    const field = FIELD[col];
    if (await waitFor(() => isEditor(field), 400, 50)) return;
    if (inGridEditor()) {
      for (let i = 0; i < 6 && !isEditor(field); i++) {
        await key("Tab");
        await waitFor(() => isEditor(field), 1000, 50);
      }
      if (isEditor(field)) return;
    }
    const cell = await waitFor(() => box(rowByNo(no), col), 2500);
    if (!cell) throw new Error(field + " maydoniga o'tib bo'lmadi (qator " + no + ", faol: " + activeId() + ").");
    await clickEl(cell, 2);
    if (!(await waitFor(() => isEditor(field), 2500))) throw new Error(field + " maydoni ochilmadi (faol: " + activeId() + ").");
  }

  // Summa: raqamlar bittalab bosiladi (1C raqam maydoni bir yo'la joylashni qabul qilmaydi).
  async function typeAmount(no, amt) {
    await goTo(no, COL.summa);
    const inp = document.activeElement;
    if (inp && inp.tagName === "INPUT") inp.select();
    await selectAll();
    await key("Backspace");
    await typeText(amt);                 // raqam maydoni faqat haqiqiy bosishlarni qabul qiladi
    await waitFor(() => { const x = document.activeElement; return x && Math.abs(parseNum(x.value) - parseNum(amt)) < 0.005; }, 600, 40);
    const a = document.activeElement;
    if (a && a.tagName === "INPUT" && Math.abs(parseNum(a.value) - parseNum(amt)) > 0.004)
      throw new Error("Summa maydoniga «" + amt + "» o'rniga «" + a.value + "» yozildi.");
    await key("Tab");                  // tasdiqlash; Сумма НУ Дт/Кт ni 1C o'zi to'ldiradi
    await sleep(250);
  }

  // Xato bo'lsa — extension yaratgan qatorni o'chiradi (faqat aynan o'sha raqamli qator tanlangan bo'lsa).
  async function removeRow(no) {
    for (let i = 0; i < 3 && inGridEditor(); i++) await safeEscape();
    const row = rowByNo(no);
    if (!row) return false;
    await clickEl(box(row, COL.num));
    await sleep(500);
    const sel = selectedRow(findGrid());
    if (!sel || lineNo(sel) !== String(no)) return false;
    await key("Delete");
    return !!(await waitFor(() => !rowByNo(no) || lineNo(selectedRow(findGrid()) || {}) !== String(no), 2500));
  }

  // Tab bosib, kerakli maydon tahrirga ochilguncha o'tadi (oraliqda yashirin/keraksiz maydonlar bo'lishi mumkin).
  // Faqat oldinga yuradi; maydon topilmasa — xato (keyin qator o'chiriladi).
  async function tabTo(field, maxTabs = 4) {
    for (let i = 0; i < maxTabs; i++) {
      if (isEditor(field)) return;
      await key("Tab");
      if (await waitFor(() => isEditor(field), 1500)) return;
    }
    throw new Error(field + " maydoniga Tab bilan yetib bo'lmadi (faol: " + activeId() + ").");
  }

  // Maydonni ochish: allaqachon tahrirda bo'lsa — shu; aks holda qator katagini ikki marta bosamiz
  // (ro'yxatdan element bosilgach 1C tahrirni yopadi, Tab ishonchsiz — shuning uchun katakning o'ziga bosamiz).
  async function openField(no, col) {
    const field = FIELD[col];
    if (isEditor(field)) return;
    const cell = await waitFor(() => box(rowByNo(no), col), 3000);
    if (!cell) throw new Error(field + " katagi topilmadi (qator " + no + ").");
    await clickEl(cell, 2);
    if (await waitFor(() => isEditor(field), 2500)) return;
    // ikkinchi urinish: bitta bosish + F2 (Изменить)
    await clickEl(cell);
    await sleep(300);
    await key("F2");
    if (!(await waitFor(() => isEditor(field), 2500))) throw new Error(field + " maydoni ochilmadi (faol: " + activeId() + ").");
  }

  // Tanlangan haqiqiy 4790 qatoridan Кт tomonini o'qiydi (taxmin yo'q — faqat jadvaldagi qiymatlar).
  function ktFromSelected() {
    const grid = findGrid();
    if (!grid) throw new Error("«Операция» yorlig'i ochiq emas.");
    const row = selectedRow(grid);
    if (!row) throw new Error("Firmaning to'g'ri Кт tomoni yozilgan bitta 4790 qatoriga bosing.");
    if (norm(cellText(row, COL.schetDt)) !== ACCOUNT) throw new Error("Tanlangan qator " + ACCOUNT + " emas.");
    const kt = {};
    for (const [k, col] of KT_PARTS) {
      const t = cellText(row, col);
      kt[k] = t && t !== "<...>" ? t : "";
    }
    if (!kt.schet) throw new Error("Tanlangan qatorda Кт hisob bo'sh.");
    return kt;
  }

  // Ochiq «Операция»dagi ko'rinib turgan 4790 qatorlaridan Кт tomonini o'zi topadi (tanlash shart emas).
  // Faqat to'liq yozilgan qator olinadi (Кт hisob + kamida bitta subkonto bor).
  function scanKt() {
    const grid = findGrid();
    if (!grid) return null;
    for (const row of lines(grid)) {
      if (norm(cellText(row, COL.schetDt)) !== ACCOUNT) continue;
      const kt = {};
      for (const [k, col] of KT_PARTS) { const t = cellText(row, col); kt[k] = t && t !== "<...>" ? t : ""; }
      if (kt.schet && kt.sub1) return kt;     // faqat to'liq qator
    }
    return null;
  }
  function autoKt(silent) {
    const kt = scanKt();
    if (!kt) return false;
    const same = state.kt && KT_PARTS.every(([k]) => (state.kt[k] || "") === kt[k]);
    if (same) return true;
    state.kt = kt; save(); render();
    if (!silent) log("Кт tomoni hujjatdan avtomatik olindi: " + KT_PARTS.map(([k]) => kt[k]).filter(Boolean).join(" / "));
    return true;
  }

  // ADD usuli (yangi oy hujjati — 4790 qatori yo'q): Add → 4790 → bo'lim → xodim → Кт tomoni → summa.
  // Tahrirni yakunlash: tahrirdagi katak bo'lsa — o'sha qatorning # katagiga bir marta bosamiz (1C tahrirni yopadi).
  async function endEditing() {
    if (!inGridEditor()) return;
    const sel = selectedRow(findGrid());
    const cell = sel && box(sel, COL.num);
    if (cell) { await clickEl(cell); await waitFor(() => !inGridEditor(), 2000, 60); await sleep(120); }
  }

  // «Add» → HAQIQATAN yangi, bo'sh qator ochilganini tekshiradi. Aks holda — qayta urinadi, keyin to'xtaydi.
  // Hech qachon mavjud qator ustidan yozmaydi.
  async function addFreshRow(usedNos) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await endEditing();
      const grid = findGrid();
      if (!grid) throw new Error("«Операция» jadvali topilmadi.");
      const addBtn = document.getElementById(grid.id + "Добавить");
      if (!addBtn || !addBtn.offsetParent) throw new Error("Jadvalning «Add» tugmasi topilmadi.");
      const before = selectedRow(grid);
      log("   Add #" + attempt + " (oldin tanlangan qator: " + (before ? lineNo(before) : "yo'q") + ", tahrirda: " + (inGridEditor() ? activeId() : "yo'q") + ")");
      await clickEl(addBtn);
      const no = await waitFor(() => {
        if (!isEditor("СчетДт")) return null;
        const sel = selectedRow(findGrid());
        const n = sel && lineNo(sel);
        if (!n || usedNos.has(n)) return null;
        const inp = document.activeElement;
        if (inp && inp.value && inp.value.trim()) return null;              // bo'sh emas — bu eski qator
        if (cellText(sel, COL.schetDt) && cellText(sel, COL.schetDt) !== inp.value) return null;
        return n;
      }, 4000);
      if (no) { log("   yangi qator: " + no); return no; }
      const sel2 = selectedRow(findGrid());
      log("   yangi qator chiqmadi — tanlangan: " + (sel2 ? lineNo(sel2) + " (" + cellText(sel2, COL.schetDt) + ")" : "yo'q") + ", faol: " + activeId() + (document.activeElement && document.activeElement.value ? " = «" + document.activeElement.value + "»" : ""));
      await sleep(500);
    }
    throw new Error("«Add» bosilganda yangi bo'sh qator ochilmadi (faol: " + activeId() + "). Mavjud qatorlarga tegilmadi.");
  }

  // Qatorni tekshirish: Дт, Кт va summa — aynan kutilganidek bo'lishi shart.
  async function verifyRow(no, item, kt) {
    const ok = await waitFor(() => {
      const r = rowByNo(no);
      return r && Math.abs(parseNum(cellText(r, COL.summa)) - item.amount) < 0.005 ? r : null;
    }, 1500, 100);
    const r = ok || rowByNo(no);
    const errs = [];
    if (norm(cellText(r, COL.schetDt)) !== ACCOUNT) errs.push("Дт hisob: «" + cellText(r, COL.schetDt) + "»");
    if (norm(cellText(r, COL.podrDt)) !== norm(item.dept)) errs.push("bo'lim: «" + cellText(r, COL.podrDt) + "»");
    if (norm(cellText(r, COL.subDt1)) !== norm(item.name)) errs.push("xodim: «" + cellText(r, COL.subDt1) + "»");
    for (const [k, col, label] of KT_PARTS) {
      if (kt[k] && norm(cellText(r, col)) !== norm(kt[k])) errs.push(label + ": «" + cellText(r, col) + "»");
    }
    const sum = parseNum(cellText(r, COL.summa));
    if (Math.abs(sum - item.amount) > 0.004) errs.push("summa: " + fmt(sum));
    for (const [col, label] of [[COL.nuDt, "Сумма НУ Дт"], [COL.nuKt, "Сумма НУ Кт"]]) {
      const t = cellText(r, col);
      if (t && Math.abs(parseNum(t) - item.amount) > 0.004) errs.push(label + ": " + t);
    }
    if (errs.length) throw new Error("Qator " + no + " kutilganidek to'lmadi — " + errs.join(", "));
  }

  // ADD: yangi bo'sh qator — barcha maydonlar (birinchi qator uchun).
  async function fillOneAdd(item, usedNos) {
    const no = await addFreshRow(usedNos);
    usedNos.add(no);
    const kt = state.kt;
    try {
      await pickRef("СчетДт", ACCOUNT, "Дт hisob");
      await goTo(no, COL.podrDt);
      await pickRef("ПодразделениеДт", item.dept, "Bo'lim");
      await goTo(no, COL.subDt1);
      await pickRef("СубконтоДт1", item.name, "Xodim");
      for (const [k, col, label] of KT_PARTS) {
        if (!kt[k]) continue;
        await goTo(no, col);
        await pickRef(FIELD[col], kt[k], label);
      }
      await typeAmount(no, amountText(item.amount, item.dec || ","));
      await verifyRow(no, item, kt);
      return no;
    } catch (e) {
      await endEditing().catch(() => {});          // qator O'CHIRILMAYDI — buxgalter tekshiradi
      e.rowNo = no;
      throw e;
    }
  }

  // COPY: tayyor qatordan nusxa (F9) — 4790 va Кт tomoni nusxada bor; faqat bo'lim, xodim, summa yoziladi.
  // Yangi qator ochilmasa — null qaytaradi (chaqiruvchi ADD ga o'tadi). Mavjud qatorga hech qachon yozmaydi.
  async function copyFreshRow(srcNo, usedNos) {
    await endEditing();
    const src = rowByNo(srcNo);
    if (!src || norm(cellText(src, COL.schetDt)) !== ACCOUNT) return null;
    await clickEl(box(src, COL.num));
    await waitFor(() => { const s = selectedRow(findGrid()); return s && lineNo(s) === String(srcNo); }, 1500, 80);
    await key("F9");
    return await waitFor(() => {
      if (!isEditor("СчетДт")) return null;
      const sel = selectedRow(findGrid());
      const n = sel && lineNo(sel);
      if (!n || n === String(srcNo) || usedNos.has(n)) return null;
      const v = document.activeElement && document.activeElement.value;
      return norm(v) === ACCOUNT ? n : null;           // nusxada 4790 bo'lishi shart
    }, 3000, 100);
  }

  async function fillOneCopy(item, srcNo, usedNos) {
    const no = await copyFreshRow(srcNo, usedNos);
    if (!no) return null;
    usedNos.add(no);
    const kt = state.kt;
    try {
      await goTo(no, COL.podrDt);
      await pickRef("ПодразделениеДт", item.dept, "Bo'lim");
      await goTo(no, COL.subDt1);
      await pickRef("СубконтоДт1", item.name, "Xodim");
      await typeAmount(no, amountText(item.amount, item.dec || ","));
      await verifyRow(no, item, kt);
      return no;
    } catch (e) {
      await endEditing().catch(() => {});
      e.rowNo = no;
      throw e;
    }
  }

  async function runFill(onlyOne) {
    stopFlag = false;
    const todo = state.items.filter((x) => x.checked && !x.done);
    if (!todo.length) return log("To'ldiriladigan qator yo'q.");
    const bad = todo.find((x) => !x.dept || !x.name || !(x.amount > 0));
    if (bad) return log("XATO: «" + (bad.name || "?") + "» qatorida bo'lim, xodim yoki summa bo'sh. Avval to'ldiring yoki belgini olib tashlang.");
    if (!findGrid()) return log("XATO: «Операция (введенная вручную)» oynasi ochiq emas — yangi Операция yarating (Создать) va shu oynada turing.");
    autoKt(false);
    if (!(state.kt && state.kt.schet && state.kt.sub1)) {
      return log("XATO: Кт tomoni hali noma'lum. Bu firmaning to'g'ri yozilgan 4790 qatori bor «Операция»ni (masalan o'tgan oy) bir marta oching — extension Кт'ni o'zi eslab qoladi. Keyin yangi hujjatga qaytib, qayta bosing.");
    }
    log("1-qator Add, keyingilari Copy | Кт: " + KT_PARTS.map(([k]) => state.kt[k]).filter(Boolean).join(" / "));
    running = true;
    const usedNos = new Set();     // shu ishga tushirishda yaratilgan qatorlar raqamlari
    let srcNo = null;              // Copy uchun manba — oxirgi to'liq tekshirilgan qator
    const tAll = Date.now();
    try {
      await bg({ cmd: "attach" });
      const problems = [];
      let failsInRow = 0;
      for (const item of (onlyOne ? todo.slice(0, 1) : todo)) {
        if (stopFlag) { log("To'xtatildi."); break; }
        log("→ " + item.dept + " | " + item.name + " — " + fmt(item.amount));
        try {
          const t0 = Date.now();
          let no = srcNo ? await fillOneCopy(item, srcNo, usedNos) : null;
          const how = no ? "copy" : "add";
          if (!no) no = await fillOneAdd(item, usedNos);
          srcNo = no;                                    // keyingisi shu tayyor qatordan nusxa oladi
          item.done = true; await save(); render();
          log("   ✓ qator " + no + " (" + how + ", " + ((Date.now() - t0) / 1000).toFixed(1) + " s)");
          failsInRow = 0;
        } catch (e) {
          if (!e.rowNo) throw e;                       // yangi qator umuman ochilmagan — davom etish xavfli
          problems.push("qator " + e.rowNo + " (" + item.name + "): " + e.message);
          log("   ⚠ qator " + e.rowNo + " to'liq emas — TEKSHIRING: " + e.message);
          if (++failsInRow >= 2) { log("Ketma-ket 2 ta xato — to'xtadim."); break; }
        }
      }
      if (problems.length) { log("TEKSHIRISH KERAK:"); problems.forEach((p) => log("   " + p)); }
      log("Jami vaqt: " + ((Date.now() - tAll) / 1000).toFixed(1) + " s");
      log("Natija: " + (onlyOne ? "SINOV — faqat 1 ta qator. Qolganlari uchun «Hammasini to'ldirish»." : "barcha belgilangan qatorlar.") );
      log("Tayyor. Hujjatni ko'zdan kechirib, «Записать» / «Провести»ni O'ZINGIZ bosing.");
    } catch (e) {
      log("XATO: " + e.message);
      log("To'xtadim. Hujjat saqlanmagan.");
    } finally {
      running = false;
      await bg({ cmd: "detach" }).catch(() => {});
    }
  }

  // =================================================================
  //  3. Panel (UI)
  // =================================================================
  let panel;
  function log(t) {
    state.log.push(new Date().toLocaleTimeString() + "  " + t);
    state.log = state.log.slice(-200);
    const el = panel && panel.querySelector(".u4790-log");
    if (el) { el.textContent = state.log.join("\n"); el.scrollTop = el.scrollHeight; }
  }

  function render() {
    if (!panel) return;
    const tb = panel.querySelector("tbody");
    tb.innerHTML = "";
    state.items.forEach((it, i) => {
      const tr = document.createElement("tr");
      if (it.done) tr.className = "done";
      tr.innerHTML =
        '<td><input type="checkbox" data-k="checked" ' + (it.checked ? "checked" : "") + (it.done ? " disabled" : "") + "></td>" +
        '<td><input data-k="dept"></td><td><input data-k="name"></td>' +
        '<td><input data-k="amount" class="num"></td><td>' + (it.done ? "✓" : "") + "</td>";
      tr.querySelector('[data-k="dept"]').value = it.dept || "";
      tr.querySelector('[data-k="name"]').value = it.name || "";
      tr.querySelector('[data-k="amount"]').value = it.amount ? fmt(it.amount) : "";
      tr.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
        const k = inp.dataset.k;
        state.items[i][k] = k === "checked" ? inp.checked : k === "amount" ? parseNum(inp.value) : inp.value.trim();
        save(); render();
      }));
      tb.appendChild(tr);
    });
    const ktBox = panel.querySelector(".u4790-kt");
    if (ktBox) {
      ktBox.innerHTML = "";
      if (state.kt) {
        for (const [k, , label] of KT_PARTS) {
          const row = document.createElement("label");
          row.innerHTML = "<span></span><input>";
          row.querySelector("span").textContent = label;
          const inp = row.querySelector("input");
          inp.value = state.kt[k] || "";
          inp.addEventListener("change", () => { state.kt[k] = inp.value.trim(); save(); });
          ktBox.appendChild(row);
        }
      } else ktBox.textContent = "Кт hali noma'lum — 4790 qatori bor «Операция»ni bir marta oching.";
    }
    const total = state.items.filter((x) => x.checked).reduce((s, x) => s + (x.amount || 0), 0);
    panel.querySelector(".u4790-total").textContent = state.items.length ? "Belgilangan jami: " + fmt(total) : "";
  }

  function setItems(res) {
    state.items = res.red.map((r) => ({ dept: r.dept, name: r.name, amount: r.amount, dec: res.dec, checked: true, done: false }));
    save(); render();
    const sum = res.red.reduce((s, r) => s + r.amount, 0);
    log("ОСВ o'qildi: " + res.employees + " xodim, qizil qoldiqli — " + res.red.length + " ta, jami " + fmt(sum) + " (bo'limlar: " + (res.method || "?") + " bo'yicha).");
    if (res.totalVec) {
      const k = res.nCols - 2;
      const net = res.totalVec[k + 1] - res.totalVec[k];
      if (net > 0.004) log("   ОСВ «Total» oxirgi qoldiq (Кт): " + fmt(net) + (Math.abs(net - sum) < 0.01 ? " — mos ✓" : " — farq bor, ro'yxatni tekshiring"));
    }
    res.warnings.forEach((w) => log("Diqqat: " + w));
  }

  function diagnostics() {
    const out = [];
    const grid = findGrid();
    out.push("Versiya: 1.9.1");
    out.push("Операция jadvali: " + (grid ? grid.id : "topilmadi (yorliq ochiq emas)"));
    if (grid) {
      const r = selectedRow(grid);
      out.push("Tanlangan qator: " + (r ? lineNo(r) : "yo'q"));
      if (r) [...r.querySelectorAll(".gridBox")].forEach((b) => out.push("  col " + b.getAttribute("colindex") + ": " + b.innerText.trim().replace(/\n/g, " ")));
      out.push("Muharrirlar: " + [...document.querySelectorAll('input[id*="' + GRID_SUFFIX + '"]')].map((i) => i.id.replace(/^form\d+_/, "")).join(", "));
    }
    const cells = collectMoxelCells();
    out.push("Moxel kataklar (ko'rinib turgan): " + cells.length);
    const m = cells.length ? parseMoxelCells(cells) : null;
    out.push("ОСВ ustunlari: " + (m ? m.nCols : "topilmadi") + ", xodim/bo'lim qatorlari: " + (m ? m.items.length : 0) + ", guruh rangi: " + (m && m.groupColor));
    if (m) m.items.slice(0, 6).forEach((it) => out.push("  " + it.name + " | " + it.vec.join(" ; ") + " | " + it.color));
    out.push("Faol element: " + (document.activeElement && (document.activeElement.id || document.activeElement.tagName)));
    const text = out.join("\n");
    log("DIAGNOSTIKA:\n" + text);
    navigator.clipboard && navigator.clipboard.writeText(text).then(() => log("(Diagnostika nusxalandi — Claude'ga joylashingiz mumkin.)"), () => {});
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.id = "u4790-panel";
    panel.innerHTML = `
      <div class="u4790-head"><b>4790 to'ldiruvchi <small>v1.9.1</small></b><span class="u4790-x" title="Yopish">×</span></div>
      <div class="u4790-body">
        <div class="u4790-step">1. «ОСВ по счету ${ACCOUNT}» yorlig'ini oching</div>
        <button data-a="read">ОСВ'dan o'qish</button>
        <details><summary>yoki: nusxa joylash</summary>
          <div class="u4790-hint">Hisobot ichiga bosing → Ctrl+A → Ctrl+C → shu yerga Ctrl+V</div>
          <textarea class="u4790-paste" rows="3"></textarea>
          <button data-a="parse">Tahlil qilish</button>
        </details>
        <table class="u4790-tbl"><thead><tr><th>✔</th><th>Bo'lim</th><th>Xodim (F.I.Sh.)</th><th>Summa</th><th></th></tr></thead><tbody></tbody></table>
        <div class="u4790-total"></div>
        <div class="u4790-step">2. Кт tomoni — avtomatik</div>
        <div class="u4790-hint">4790 qatori bor istalgan «Операция» ochilganda Кт o'zi olinadi va eslab qolinadi. Kerak bo'lsa pastda tuzating.</div>
        <button data-a="ktget" class="link">qatordan qayta olish</button><button data-a="ktclear" class="link">tozalash</button>
        <div class="u4790-kt"></div>
        <div class="u4790-step">3. To'ldirish</div>
        <button data-a="one">Bitta qator (sinov)</button>
        <button data-a="all" class="primary">Hammasini to'ldirish</button>
        <button data-a="stop">To'xtatish</button>
        <div class="u4790-row2"><button data-a="reset" class="link">Ro'yxatni tozalash</button><button data-a="diag" class="link">Diagnostika</button><button data-a="copylog" class="link">Logni nusxalash</button></div>
        <pre class="u4790-log"></pre>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector(".u4790-x").onclick = () => { panel.style.display = "none"; wantOpen = false; };
    panel.addEventListener("click", async (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (!a) return;
      try {
        if (a === "read") setItems(readOsvFromPage());
        if (a === "parse") setItems(readOsvFromText(panel.querySelector(".u4790-paste").value));
        if (a === "ktget") { state.kt = (selectedRow(findGrid() || document.createElement("div")) ? ktFromSelected() : scanKt()) || state.kt; await save(); render(); log("Кт namunasi saqlandi: " + KT_PARTS.map(([k]) => state.kt[k]).filter(Boolean).join(" / ")); }
        if (a === "ktclear") { state.kt = null; await save(); render(); log("Кт namunasi o'chirildi — endi NUSXA usuli ishlatiladi."); }
        if (a === "one") await runFill(true);
        if (a === "all") await runFill(false);
        if (a === "stop") { stopFlag = true; log("To'xtatish so'raldi — joriy qatordan keyin to'xtaydi."); }
        if (a === "reset") { state.items = []; save(); render(); log("Ro'yxat tozalandi."); }
        if (a === "diag") diagnostics();
        if (a === "copylog") { try { await navigator.clipboard.writeText(state.log.join("\n")); log("(Log nusxalandi.)"); } catch (e) { log("Logni nusxalab bo'lmadi."); } }
      } catch (err) { log("XATO: " + err.message); }
    });
    render();
    log("Panel tayyor (v1.9.1). Hujjat hech qachon avtomatik saqlanmaydi.");
  }

  // 1C login'dan keyin (va ba'zan oyna almashganda) <body> ni qayta chizadi — panel DOM'dan yo'qoladi.
  // Shuning uchun har safar panel sahifada haqiqatan bormi — tekshiramiz, yo'q bo'lsa qayta quramiz.
  const panelAlive = () => !!(panel && panel.isConnected && document.body && document.body.contains(panel));
  let wantOpen = false;
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.cmd !== "togglePanel") return;
    if (!panelAlive()) { panel = null; buildPanel(); wantOpen = true; return; }
    const hidden = panel.style.display === "none";
    panel.style.display = hidden ? "" : "none";
    wantOpen = hidden;
  });
  // Panel ochiq bo'lgan paytda 1C body'ni almashtirsa — avtomatik qaytaramiz.
  if (!window.__u4790_test) setInterval(() => { try { if (!running && findGrid()) autoKt(!panelAlive()); } catch (e) {} }, 3000);
  if (!window.__u4790_test) setInterval(() => { if (wantOpen && !panelAlive() && document.body) { panel = null; buildPanel(); } }, 1500);

  // Test uchun (oddiy sahifada ishlamaydi).
  if (window.__u4790_test) window.__u4790_test = { readOsvFromText, parseMoxelCells, finishParse, parseNum, amountText };
  load();
})();
