const $ = id => document.getElementById(id);
$("ver").textContent = "v" + chrome.runtime.getManifest().version;
const MARK_URL = "https://my.soliq.uz/remotes-services/markirovka/product_markirovka";

// our STIR: a code is sellable only when its last operation is wholesale to this STIR
const cleanStir = v => String(v == null ? "" : v).replace(/\D/g, "");
chrome.storage.local.get("mxik_stir").then(d => { $("stir").value = d.mxik_stir || ""; });
$("stir").oninput = () => chrome.storage.local.set({ mxik_stir: cleanStir($("stir").value) });

function verdictOf(last, stir) {
  const op = (last && last.operation || "").toLowerCase(), ours = cleanStir(stir);
  if (ours && cleanStir(last && last.stir) !== ours) return { text: "SOTIB BO'LMAYDI (boshqa STIR)", cls: "bad" };
  if (/ulgurji|улгуржи|оптов/.test(op)) return { text: "SOTSA BO'LADI", cls: "ok" };
  if (/chakana|чакана|розн/.test(op)) return { text: "SOTIB BO'LMAYDI", cls: "bad" };
  return { text: "Holat noma'lum", cls: "" };
}

// ---- my.soliq.uz markirovka via the content script ----
async function markirovka(code) {
  // run on the website itself: prefer the tab the user is looking at, else any my.soliq.uz tab, else open one
  let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, url: "https://my.soliq.uz/*" });
  if (!tab) [tab] = await chrome.tabs.query({ url: MARK_URL + "*" });
  if (!tab) tab = await chrome.tabs.create({ url: MARK_URL });
  await chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});   // Memory Saver must not unload it
  if (tab.discarded) {
    await chrome.tabs.reload(tab.id);
    await new Promise(r => setTimeout(r, 1500));
  } else if (!tab.url || !tab.url.startsWith(MARK_URL)) {
    await chrome.tabs.update(tab.id, { url: MARK_URL, active: true });
    await new Promise(r => setTimeout(r, 1500));
  }
  for (let i = 0; i < 40; i++) {           // wait for the page + content script
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: "mxik-search", code });
      if (r) return r;
    } catch (e) { /* content script not ready yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("my.soliq.uz sahifasi javob bermadi");
}

// ================= Excel: bulk check =================
let batch = { rows: null, header: null, col: -1, out: [], stop: false, running: false, name: "" };
const GS1 = /^01\d{14}21/;
const clean = v => String(v == null ? "" : v).replace(/[\x00-\x1f\x1d]/g, "").trim();

function detectCodeColumn(rows) {
  const width = Math.max(...rows.slice(0, 50).map(r => r.length), 0);
  let best = -1, bestN = 0;
  for (let c = 0; c < width; c++) {
    const n = rows.slice(0, 200).filter(r => GS1.test(clean(r[c]))).length;
    if (n > bestN) { best = c; bestN = n; }
  }
  return best;
}

// one code per line (pasted text or .txt); codes may contain , ; " ' so no CSV parsing here
function rowsFromText(text) {
  return String(text).split(/\r?\n/).map(clean).filter(Boolean).map(c => [c]);
}
function prepareBatch(rows, header, col, name) {
  batch = { rows, header, col, out: [], stop: false, running: false, name };
  $("xlsInfo").textContent = `${rows.length} ta qator, kod ustuni: ${col + 1}`;
  $("xlsRun").disabled = rows.length === 0; $("xlsSave").disabled = true; $("xlsResume").hidden = true; $("xlsAsk").hidden = true;
  chrome.storage.local.remove("mxik_ckpt").catch(() => {});
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1_$2");

$("xlsFile").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  if (/\.txt$/i.test(f.name)) {
    prepareBatch(rowsFromText(await f.text()), ["Markirovka kodi"], 0, f.name.replace(/\.[^.]+$/, ""));
    return;
  }
  const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const col = detectCodeColumn(rows);
  if (col < 0) { $("xlsInfo").textContent = "Markirovka kodlari ustuni topilmadi (01... bilan boshlanadigan kodlar kerak)"; $("xlsRun").disabled = true; return; }
  const hasHeader = !GS1.test(clean(rows[0][col]));
  const data = rows.filter(r => r.some(x => clean(x)));
  prepareBatch(data, hasHeader ? data.shift() : null, col, f.name.replace(/\.[^.]+$/, ""));
};

// pasted list of codes: check right away
$("txtRun").onclick = () => {
  if (batch.running) return;
  const rows = rowsFromText($("txtCodes").value);
  if (!rows.length) { $("xlsInfo").textContent = "Kodlarni maydonga qo'ying (har qatorda bittadan)"; return; }
  prepareBatch(rows, ["Markirovka kodi"], 0, "markirovka_" + stamp());
  $("xlsRun").click();
};

const RES_COL = "Natija";

// ---- tasnif.soliq.uz: MXIK by barcode. 0104780074206916 21... -> GTIN 04780074206916 -> barcode 4780074206916 ----
const barcodeOf = code => { const m = clean(code).match(/^01(\d{14})/); return m ? m[1].replace(/^0+/, "") : ""; };
const tasnifCache = new Map();
async function tasnifLookup(barcode) {
  if (!barcode) return null;
  if (tasnifCache.has(barcode)) return tasnifCache.get(barcode);
  const p = (async () => {
    for (const g of [barcode, barcode.padStart(14, "0")]) {
      const r = await fetch(`https://tasnif.soliq.uz/api/cls-api/mxik/search/by-params?gtin=${g}&size=20&lang=uz_latn`);
      if (!r.ok) throw new Error("tasnif HTTP " + r.status);
      const j = await r.json(), list = (j.data && j.data.content) || [];
      if (list.length) return list;
    }
    return [];
  })();
  tasnifCache.set(barcode, p);
  p.catch(() => tasnifCache.delete(barcode));
  return p;
}
async function tasnifCheck(code, res) {
  const bc = barcodeOf(code);
  res.tBarcode = bc;
  try {
    const list = await tasnifLookup(bc);
    if (!list || !list.length) { res.tStatus = "Topilmadi"; return; }
    res.tStatus = "Bor";
    res.tMxik = list.map(x => x.mxikCode).join(", ");
    res.tName = list.map(x => x.mxikName).join(" | ");
  } catch (e) { res.tStatus = "Xato: " + e.message; }
}
const MXIK_MATCH = o => !o.tMxik || !o.mxik ? "" : o.tMxik.split(", ").includes(o.mxik) ? "✓ Mos" : "✗ Mos emas";

async function checkOne(raw) {
  const code = clean(raw), res = { Natija: "", Izoh: "" };
  if (!GS1.test(code)) { res.Natija = "Kod noto'g'ri"; return res; }
  const tasnifP = tasnifCheck(code, res);
  try {
    const r = await markirovka(code);
    if (r.loggedIn === false) { res.Natija = "KIRILMAGAN"; res.Izoh = "my.soliq.uz ga kiring"; return res; }
    const h = r.history, l = h && h.last;
    if (h) Object.assign(res, { product: h.product, size: h.size, importer: h.importer, stir: h.stir, mxik: h.mxik, barcode: h.barcode });
    if (l) Object.assign(res, { operation: l.operation, company: l.company, opStir: l.stir, date: l.date, address: l.address });
    res.Natija = l ? verdictOf(l, $("stir").value).text : "Tarix topilmadi";
  } catch (e) { res.Natija = "Xato"; res.Izoh = e.message; }
  await tasnifP;
  res.mxikMatch = MXIK_MATCH(res);
  return res;
}

// product details taken from my.soliq.uz (added after the original columns)
const INFO_COLS = [
  ["product", "Mahsulot nomi", 45], ["size", "Hajmi", 18], ["importer", "Importyor nomi", 32],
  ["mxik", "MXIK", 19], ["barcode", "Shtrix kodi", 16], ["operation", "Oxirgi operatsiya", 22],
  ["opStir", "Oxirgi egasi STIR", 14], ["company", "Oxirgi egasi", 32],
  ["tBarcode", "Tasnif: shtrix-kod", 16], ["tStatus", "Tasnifda", 12], ["tMxik", "Tasnif: MXIK", 19],
  ["tName", "Tasnif: MXIK nomi", 45], ["mxikMatch", "MXIK mosligi", 14],
];

// Excel cell for one result: ✓ green / ✗ red, anything else stays plain text
const STYLE_OK = { font: { bold: true, color: { rgb: "FF1E7B34" } }, fill: { patternType: "solid", fgColor: { rgb: "FFE6F4EA" } } };
const STYLE_BAD = { font: { bold: true, color: { rgb: "FFC00000" } }, fill: { patternType: "solid", fgColor: { rgb: "FFFDE9E9" } } };
const ROW_OK = { font: { color: { rgb: "FF1E7B34" } }, fill: STYLE_OK.fill };
const ROW_BAD = { font: { color: { rgb: "FFC00000" } }, fill: STYLE_BAD.fill };
function resultCell(o) {
  if (!o) return { v: "" };
  if (o.Natija === "SOTSA BO'LADI") return { v: "✓ Sotsa bo'ladi", s: STYLE_OK };
  if (o.Natija === "SOTIB BO'LMAYDI") return { v: "✗ Sotib bo'lmaydi", s: STYLE_BAD };
  return { v: o.Natija + (o.Izoh ? " (" + o.Izoh + ")" : ""), s: { font: { color: { rgb: "FF9A6700" } } } };
}

// one sheet: original columns + product info + Natija; whole row coloured green / red
function buildSheet(b, idx) {
  const head = (b.header || b.rows[0].map((_, i) => "Ustun " + (i + 1)));
  const width = head.length, total = width + INFO_COLS.length + 1, resCol = total - 1;
  const data = [head.concat(INFO_COLS.map(c => c[1]), [RES_COL])].concat(idx.map(i => {
    const r = b.rows[i], o = b.out[i] || {};
    return Array.from({ length: width }, (_, c) => r[c] == null ? "" : r[c])
      .concat(INFO_COLS.map(c => o[c[0]] == null ? "" : String(o[c[0]])), [""]);
  }));
  const ws = XLSX.utils.aoa_to_sheet(data);
  for (let c = 0; c < total; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = { font: { bold: true }, fill: { patternType: "solid", fgColor: { rgb: "FFEDEDED" } } };
  }
  idx.forEach((i, k) => {
    const c = resultCell(b.out[i]);
    ws[XLSX.utils.encode_cell({ r: k + 1, c: resCol })] = { t: "s", v: c.v, s: c.s };
    const rowStyle = c.s === STYLE_OK ? ROW_OK : c.s === STYLE_BAD ? ROW_BAD : null;
    if (!rowStyle) return;
    for (let col = 0; col < resCol; col++) {
      const addr = XLSX.utils.encode_cell({ r: k + 1, c: col });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      ws[addr].s = rowStyle;
    }
  });
  ws["!cols"] = Array.from({ length: width }, () => ({ wch: 22 })).concat(INFO_COLS.map(c => ({ wch: c[2] })), [{ wch: 20 }]);
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: idx.length, c: resCol } }) };
  return ws;
}

// sheets: Hammasi (original order) + Sotsa bo'ladi + Sotib bo'lmaydi (+ Boshqa: errors / unknown / not checked)
function buildResultWorkbook(b) {
  const all = b.rows.map((_, i) => i);
  const ok = all.filter(i => b.out[i] && b.out[i].Natija === "SOTSA BO'LADI");
  const bad = all.filter(i => b.out[i] && b.out[i].Natija === "SOTIB BO'LMAYDI");
  const other = all.filter(i => !ok.includes(i) && !bad.includes(i));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(b, all), "Hammasi");
  XLSX.utils.book_append_sheet(wb, buildSheet(b, ok), `Sotsa bo'ladi (${ok.length})`);
  XLSX.utils.book_append_sheet(wb, buildSheet(b, bad), `Sotib bo'lmaydi (${bad.length})`);
  if (other.length) XLSX.utils.book_append_sheet(wb, buildSheet(b, other), `Boshqa (${other.length})`);
  return wb;
}

function saveBatch() { XLSX.writeFile(buildResultWorkbook(batch), batch.name + "_natija.xlsx"); }

// ---- run (resumable: progress is checkpointed so thousands of codes survive a closed panel) ----
const CKPT = "mxik_ckpt";
const store = chrome.storage.local;
const saveCkpt = () => store.set({ [CKPT]: { rows: batch.rows, header: batch.header, col: batch.col, name: batch.name, out: batch.out } }).catch(() => {});
const fmtEta = ms => { const m = Math.round(ms / 60000); return m < 1 ? "<1 daq" : m + " daq"; };

// one line per checked code in the panel (newest on top): verdict + tasnif result
function showRow(i, o) {
  const v = o.Natija === "SOTSA BO'LADI" ? "✅ Sotsa bo'ladi" : o.Natija === "SOTIB BO'LMAYDI" ? "❌ Sotib bo'lmaydi" : o.Natija;
  const t = !o.tStatus ? "" : o.tStatus === "Bor" ? `Tasnifda: bor ${o.tMxik}${o.mxikMatch ? " " + o.mxikMatch : ""}` : `Tasnifda: ${o.tStatus.toLowerCase()}`;
  const line = `${i + 1}. ${o.tBarcode || ""} · ${v}${t ? " · " + t : ""}${o.tName ? "\n    " + o.tName : ""}`;
  const el = $("xlsList"), lines = el.textContent ? el.textContent.split("\n\n") : [];
  lines.unshift(line);
  el.textContent = lines.slice(0, 300).join("\n\n");
}

async function runBatch(start) {
  if (!batch.rows || batch.running) return;
  batch.running = true; batch.stop = false; batch.out = batch.out.slice(0, start); hideAsk();
  $("xlsSave").disabled = true; $("xlsStop").disabled = false; $("xlsRun").disabled = true; $("xlsResume").hidden = true;
  const seen = new Map();                                   // same code twice => one lookup
  batch.out.forEach((o, i) => seen.set(clean(batch.rows[i][batch.col]), o));
  const count = n => batch.out.filter(o => o.Natija === n).length;
  const tCount = () => {
    const by = f => batch.out.filter(f).length;
    return `\nTasnifda: bor ${by(o => o.tStatus === "Bor")} · topilmadi ${by(o => o.tStatus === "Topilmadi")}` +
      ` · MXIK mos ${by(o => o.mxikMatch === "✓ Mos")} · mos emas ${by(o => o.mxikMatch === "✗ Mos emas")}`;
  };
  $("xlsList").textContent = ""; $("xlsList").hidden = false;
  batch.out.forEach((o, i) => showRow(i, o));
  const t0 = Date.now(), n0 = start, total = batch.rows.length;
  for (let i = start; i < total && !batch.stop; i++) {
    const code = clean(batch.rows[i][batch.col]);
    const done = i - n0, eta = done >= 3 ? ` · ~${fmtEta((Date.now() - t0) / done * (total - i))} qoldi` : "";
    $("xlsInfo").textContent = `Tekshirilmoqda ${i + 1}/${total}…  ✅ ${count("SOTSA BO'LADI")}  ❌ ${count("SOTIB BO'LMAYDI")}${eta}${tCount()}`;
    let res = seen.get(code);
    if (!res) { res = await checkOne(code); seen.set(code, res); }
    batch.out.push(res); showRow(i, res);
    if (res.Natija === "KIRILMAGAN") break;
    if (batch.out.length % 10 === 0) saveCkpt();
  }
  batch.running = false; $("xlsStop").disabled = true; $("xlsRun").disabled = false; $("xlsSave").disabled = false;
  const loggedOut = batch.out.length && batch.out[batch.out.length - 1].Natija === "KIRILMAGAN";
  const finished = batch.out.length >= total && !loggedOut;
  if (finished) store.remove(CKPT).catch(() => {}); else saveCkpt();
  $("xlsInfo").textContent = `${finished ? "Tugadi" : "To'xtatildi"}: ${batch.out.length}/${total}  ✅ sotsa bo'ladi: ${count("SOTSA BO'LADI")}  ❌ sotib bo'lmaydi: ${count("SOTIB BO'LMAYDI")}` + tCount() +
    (loggedOut ? "  — my.soliq.uz ga kirilmagan! Kirib, «Davom ettirish» ni bosing" : "");
  if (!finished) { $("xlsResume").hidden = false; $("xlsResume").textContent = `Davom ettirish (${batch.out.length - (loggedOut ? 1 : 0)}/${total})`; }
  askSave(finished);                                        // ask first; download only after "Ha" (button also available)
}

// ---- ask before downloading the result ----
function askSave(finished) {
  if (!batch.out.length) return;
  $("xlsAskText").textContent = (finished ? "Tekshiruv tugadi." : "Tekshiruv to'xtatildi (" + batch.out.length + "/" + batch.rows.length + ").") +
    " Natijani Excel (.xlsx) qilib yuklab olaymi?";
  $("xlsAsk").hidden = false;
}
const hideAsk = () => { $("xlsAsk").hidden = true; };
$("xlsAskYes").onclick = () => { hideAsk(); saveBatch(); };
$("xlsAskNo").onclick = hideAsk;
$("xlsRun").onclick = () => runBatch(0);
$("xlsResume").onclick = () => runBatch(batch.out.length - (batch.out.length && batch.out[batch.out.length - 1].Natija === "KIRILMAGAN" ? 1 : 0));
$("xlsStop").onclick = () => { batch.stop = true; };
$("xlsSave").onclick = () => { hideAsk(); saveBatch(); };

// unfinished run from an earlier session?
store.get(CKPT).then(d => {
  const c = d && d[CKPT];
  if (!c || !c.rows || c.out.length >= c.rows.length) return;
  batch = { rows: c.rows, header: c.header, col: c.col, out: c.out, stop: false, running: false, name: c.name };
  $("xlsInfo").textContent = `Oldingi tekshiruv tugallanmagan: ${c.out.length}/${c.rows.length}`;
  $("xlsResume").hidden = false; $("xlsResume").textContent = `Davom ettirish (${c.out.length}/${c.rows.length})`;
  $("xlsSave").disabled = false;
}).catch(() => {});
