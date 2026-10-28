// Elektr bo'limi interfeysi: akkauntlar ro'yxati (saqlanadi), Kamunalka jadvali, parallel yig'ish.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const rpc = (msg) => window.hostRpc(msg);

  let accounts = [];            // { login, password, note, enabled, lastStatus, lastMessage, lastTime }
  let tablePath = null;
  let tableName = '';
  let apiBase;                  // faqat sinov muhitida beriladi
  let running = false;
  let cancelled = false;
  let saveTimer = null;
  let modulesReady = false;

  // ---- yordamchilar --------------------------------------------------------------------------
  const b64ToBytes = (b64) => { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  const bytesToB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const dirOf = (p) => String(p).replace(/[\\/][^\\/]*$/, '');
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const newAccount = (login = '', password = '') => ({ login, password, note: '', enabled: true, lastStatus: null, lastMessage: null, lastTime: null });
  const normalize = (a) => ({ ...newAccount(), ...a, login: String(a.login || ''), password: String(a.password || ''), note: String(a.note || '') });
  const usable = (a) => a.login.trim() && a.password;

  function showInfo(text, cls = '') { const el = $('info'); el.textContent = text; el.className = 'muted ' + cls; }
  function showMsg(text, cls = '') { $('prog').hidden = false; $('msg').textContent = text; $('msg').className = cls; }
  function log(cls, text) { const li = document.createElement('li'); li.className = cls; li.textContent = text; $('log').prepend(li); }

  // ---- saqlash -------------------------------------------------------------------------------
  function payload() {
    return { type: 'state.save', accounts, tablePath, concurrency: Math.max(1, Math.min(10, Number($('conc').value) || 4)) };
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const r = await rpc(payload());
    $('saved').textContent = r && r.ok ? 'Saqlandi ✓ ' + hhmm(new Date()) : 'Saqlanmadi!';
    $('saved').style.color = r && r.ok ? '' : '#b42318';
  }
  function scheduleSave() {
    $('saved').textContent = 'Saqlanmoqda…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) saveNow(); });

  // ---- akkauntlar jadvali --------------------------------------------------------------------
  function stateText(a) {
    if (a.lastStatus === 'ok') return { cls: 'ok', text: '✓ ' + (a.lastTime ? hhmm(new Date(a.lastTime)) : '') + (a.lastMessage ? ' ' + a.lastMessage : '') };
    if (a.lastStatus === 'error') return { cls: 'er', text: '✗ ' + (a.lastMessage || 'xato') };
    return { cls: 'muted', text: '—' };
  }

  function paintState(a, cell) {
    const s = stateText(a);
    cell.className = 'state ' + s.cls;
    cell.textContent = s.text;
    cell.title = s.text;
  }

  function rowEl(a) {
    const tr = document.createElement('tr');
    tr._a = a;

    const chk = document.createElement('td'); chk.className = 'chk';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = a.enabled;
    cb.onchange = () => { a.enabled = cb.checked; updateCount(); scheduleSave(); };
    chk.appendChild(cb);

    const login = document.createElement('td');
    const li = document.createElement('input'); li.type = 'text'; li.value = a.login; li.placeholder = 'login'; li.autocomplete = 'off'; li.spellcheck = false;
    li.oninput = () => { a.login = li.value; markDuplicates(); updateCount(); scheduleSave(); };
    login.appendChild(li);

    const pass = document.createElement('td');
    const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.gap = '4px';
    const pi = document.createElement('input'); pi.type = 'password'; pi.value = a.password; pi.placeholder = 'parol'; pi.autocomplete = 'new-password';
    pi.oninput = () => { a.password = pi.value; updateCount(); scheduleSave(); };
    const eye = document.createElement('button'); eye.className = 'icon'; eye.textContent = '👁'; eye.title = "Parolni ko'rsatish / yashirish"; eye.tabIndex = -1;
    eye.onclick = () => { pi.type = pi.type === 'password' ? 'text' : 'password'; };
    wrap.append(pi, eye);
    pass.appendChild(wrap);

    const note = document.createElement('td');
    const ni = document.createElement('input'); ni.type = 'text'; ni.value = a.note; ni.placeholder = 'izoh (ixtiyoriy)';
    ni.oninput = () => { a.note = ni.value; scheduleSave(); };
    note.appendChild(ni);

    const state = document.createElement('td'); paintState(a, state); tr._state = state;

    const act = document.createElement('td'); act.className = 'act';
    const web = document.createElement('button'); web.className = 'icon'; web.textContent = '🌐'; web.title = 'cabinet.het.uz ni shu akkaunt bilan ochish';
    web.onclick = async () => {
      if (!a.login.trim() || !a.password) return showInfo('Login va parolni kiriting.', 'er');
      await saveNow();
      const r = await rpc({ type: 'cabinet.open', login: a.login.trim() });
      if (r && r.error) showInfo(r.error, 'er');
    };
    const del = document.createElement('button'); del.className = 'icon'; del.textContent = '✕'; del.title = "Qatorni o'chirish";
    del.onclick = () => {
      if (usable(a) && !confirm(`«${a.login}» akkaunti o'chirilsinmi?`)) return;
      accounts = accounts.filter((x) => x !== a);
      tr.remove(); markDuplicates(); updateCount(); scheduleSave();
    };
    act.append(web, ' ', del);

    tr.append(chk, login, pass, note, state, act);
    return tr;
  }

  function markDuplicates() {
    const seen = new Map();
    for (const a of accounts) { const k = a.login.trim(); if (k) seen.set(k, (seen.get(k) || 0) + 1); }
    for (const tr of $('rows').children) tr.classList.toggle('dup', (seen.get(tr._a.login.trim()) || 0) > 1);
  }

  function applyFilter() {
    const q = $('filter').value.trim().toLowerCase();
    for (const tr of $('rows').children) {
      const a = tr._a;
      tr.hidden = !!q && !(a.login.toLowerCase().includes(q) || a.note.toLowerCase().includes(q));
    }
  }

  function updateCount() {
    const ready = accounts.filter((a) => a.enabled && usable(a)).length;
    $('count').textContent = `${accounts.length} ta akkaunt, ${ready} tasi ishlashga tayyor`;
    $('allChk').checked = accounts.length > 0 && accounts.every((a) => a.enabled);
    updateStart();
  }

  function updateStart() { $('start').disabled = running || !tablePath || !modulesReady || !accounts.some((a) => a.enabled && usable(a)); }

  function render() {
    const tb = $('rows');
    tb.replaceChildren(...accounts.map(rowEl));
    markDuplicates(); applyFilter(); updateCount();
  }

  $('addRow').onclick = () => {
    const a = newAccount();
    accounts.push(a);
    const tr = rowEl(a);
    $('rows').appendChild(tr);
    $('filter').value = ''; applyFilter();
    updateCount(); scheduleSave();
    tr.scrollIntoView({ block: 'nearest' });
    tr.querySelector('input[type=text]').focus();
  };
  $('filter').oninput = applyFilter;
  $('allChk').onchange = () => { accounts.forEach((a) => { a.enabled = $('allChk').checked; }); render(); scheduleSave(); };

  // ---- Jadvaldan login/parol yuklash -------------------------------------------------------------
  $('importBtn').onclick = async () => {
    const f = await rpc({ type: 'file.pick', title: 'Login va parollar (Kamunalka) jadvalini tanlang', withData: true });
    if (!f || f.canceled) return;
    if (f.error) return showInfo(f.error, 'er');
    let creds;
    try { creds = window.HetBatch.parseCreds(window.XLSX, b64ToBytes(f.base64)); }
    catch (e) { return showInfo('Faylni o\'qib bo\'lmadi: ' + e.message, 'er'); }
    if (!creds.length) return showInfo('Faylda login/parol topilmadi («Логин» va «Парол» ustunlarini tekshiring).', 'er');
    const byLogin = new Map(accounts.map((a) => [a.login.trim(), a]));
    let added = 0, updated = 0, same = 0;
    for (const c of creds) {
      const ex = byLogin.get(c.login);
      if (!ex) { const a = newAccount(c.login, c.password); accounts.push(a); byLogin.set(c.login, a); added++; }
      else if (ex.password !== c.password) { ex.password = c.password; updated++; }
      else same++;
    }
    render();
    await saveNow();
    showInfo(`${f.name}: ${added} ta qo'shildi, ${updated} ta paroli yangilandi, ${same} ta o'zgarishsiz.`, 'ok');
  };

  // ---- Kamunalka jadvali -------------------------------------------------------------------------
  function paintTable(info) {
    if (!tablePath) { $('tableName').textContent = 'Jadval tanlanmagan'; return; }
    $('tableName').textContent = '📄 ' + tableName + (info && info.exists === false ? '  (fayl topilmadi!)' : '');
    $('tableName').title = tablePath;
    $('tableName').className = info && info.exists === false ? 'er' : 'muted';
  }
  $('pickTable').onclick = async () => {
    const f = await rpc({ type: 'file.pick', title: "To'ldiriladigan Kamunalka jadvalini tanlang" });
    if (!f || f.canceled) return;
    if (f.error) return showInfo(f.error, 'er');
    tablePath = f.path; tableName = f.name;
    paintTable({ exists: true }); updateStart(); scheduleSave();
  };

  // ---- Yig'ish -------------------------------------------------------------------------------------
  function setRunning(on) {
    running = on;
    $('cancel').hidden = !on;
    $('start').disabled = on;
    $('pickTable').disabled = on;
    if (!on) updateStart();
  }

  function applyResult(r) {
    const a = accounts.find((x) => x.login.trim() === r.login && x.enabled);
    if (!a) return;
    a.lastStatus = r.status === 'ok' ? 'ok' : 'error';
    a.lastMessage = r.status === 'ok' ? '' : String(r.message || '').slice(0, 200);
    a.lastTime = new Date().toISOString();
    for (const tr of $('rows').children) if (tr._a === a) paintState(a, tr._state);
  }

  // ---- Oylar bo'yicha tarix ------------------------------------------------------------------------
  // history = { 'YYYY-MM': { <login>: { login, status:'ok', parts, at } } }; shifrlangan holda diskda saqlanadi,
  // dastur yangilanganda ham joyida qoladi.
  let history = {};
  const MAX_MONTHS = 13;
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prevMonthKey = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return monthKey(d); };
  const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
  const monthLabel = (k) => { const [y, m] = k.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; };

  async function loadHistory() {
    try {
      const r = await rpc({ type: 'history.load' });
      const h = r && r.json ? JSON.parse(r.json) : {};
      history = h && typeof h === 'object' ? h : {};
    } catch { history = {}; }
    renderHistory();
  }

  async function recordHistory(results) {
    const key = monthKey(new Date());
    const bucket = history[key] || (history[key] = {});
    let n = 0;
    for (const r of results) {
      if (!r || r.status !== 'ok') continue;
      bucket[r.login] = { login: r.login, status: 'ok', parts: r.parts, at: new Date().toISOString() };
      n++;
    }
    if (!n) return;
    for (const k of Object.keys(history).sort().reverse().slice(MAX_MONTHS)) delete history[k];
    const res = await rpc({ type: 'history.save', json: JSON.stringify(history) });
    if (res && res.ok === false) log('er', "Tarixni saqlab bo'lmadi: " + res.error);
    renderHistory();
  }

  function renderHistory() {
    const sel = $('histMonth');
    const prev = sel.value;
    const keys = Object.keys(history).filter((k) => Object.keys(history[k]).length).sort().reverse();
    sel.replaceChildren(...keys.map((k) => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = `${monthLabel(k)}${k === prevMonthKey() ? " (o'tgan oy)" : ''} — ${Object.keys(history[k]).length} ta akkaunt`;
      return o;
    }));
    if (prev && keys.includes(prev)) sel.value = prev;
    $('histEmpty').hidden = keys.length > 0;
    $('histBar').hidden = keys.length === 0;
  }

  // Saqlangan oy ma'lumotlaridan (internetsiz) jadvalni to'ldirish
  async function fillFromHistory() {
    if (running) return;
    const key = $('histMonth').value;
    const bucket = history[key];
    if (!bucket) return;
    if (!tablePath) return showMsg('Avval Kamunalka jadvalini tanlang.', 'er');
    const creds = accounts.filter((a) => a.enabled && usable(a)).map((a) => ({ login: a.login.trim(), password: a.password }));
    const results = creds.map((c) => bucket[c.login]).filter(Boolean);
    if (!results.length) return showMsg("Bu oyda belgilangan akkauntlar uchun saqlangan ma'lumot yo'q.", 'er');
    const t = await rpc({ type: 'file.readPath', path: tablePath });
    if (!t || t.error) return showMsg("Jadvalni o'qib bo'lmadi: " + ((t && t.error) || "noma'lum xato"), 'er');
    setRunning(true);
    $('log').replaceChildren(); $('showFile').hidden = true; $('resultPath').textContent = '';
    try {
      await produce(results, creds.filter((c) => bucket[c.login]), b64ToBytes(t.base64), Date.now(), `${monthLabel(key)} ma'lumotlaridan`, `_${key}`);
    } catch (e) {
      showMsg('Xato: ' + (e && e.message ? e.message : e), 'er');
    } finally { setRunning(false); }
  }

  // Natijalarni jadvalga yozib, yonida yangi fayl sifatida saqlaydi
  async function produce(results, creds, tableBytes, t0, source = '', suffix = '') {
    const out = window.HetEngine.fill(tableBytes, results, creds);
    const outName = tableName.replace(/\.xlsx$/i, '') + suffix + '_toldirildi.xlsx';
    const saved = await rpc({ type: 'file.saveResult', dir: dirOf(tablePath), name: outName, base64: bytesToB64(new Uint8Array(out.data)) });
    const ok = results.filter((r) => r.status === 'ok').length;
    const checks = out.report.filter((x) => x.status === 'check');
    const mismatched = checks.filter((x) => !x.ok).map((x) => `${x.login}: jadval ${x.table}, kabinet ${x.cabinet} (farq ${x.diff})`);
    const sec = Math.round((Date.now() - t0) / 1000);
    showMsg(`Tugadi${source ? ' (' + source + ')' : ''} (${sec} soniya): ${ok} ta muvaffaqiyatli, ${results.length - ok} ta xato. Jadvalga ${out.rows} ta qator yozildi. Summa tekshiruvi: ${checks.length - mismatched.length}/${checks.length} ta kabinet jami bilan mos.`, ok === results.length ? 'ok' : 'wn');
    for (const m of mismatched) log('er', 'Mos emas — ' + m);
    for (const n of out.report.filter((x) => ['warn', 'info', 'skip'].includes(x.status)).map((x) => `${x.login}: ${x.message}`)) log('wn', n);
    if (saved && saved.path) { $('resultPath').textContent = saved.path; $('showFile').hidden = false; $('showFile').onclick = () => rpc({ type: 'shell.showFile', path: saved.path }); }
    else if (saved && saved.error) showMsg("Natijani saqlab bo'lmadi: " + saved.error, 'er');
  }
  $('histFill').onclick = fillFromHistory;

  async function start() {
    if (running) return;
    const creds = accounts.filter((a) => a.enabled && usable(a)).map((a) => ({ login: a.login.trim(), password: a.password }));
    if (!creds.length) return showMsg("Belgilangan akkaunt yo'q (login va parol to'liq bo'lishi kerak).", 'er');
    if (!tablePath) return showMsg('Avval Kamunalka jadvalini tanlang.', 'er');
    const conc = Math.max(1, Math.min(10, Number($('conc').value) || 4));

    // Jadval har safar diskdan qayta o'qiladi: Excel da qilingan o'zgarishlar hisobga olinadi
    const t = await rpc({ type: 'file.readPath', path: tablePath });
    if (!t || t.error) return showMsg("Jadvalni o'qib bo'lmadi: " + ((t && t.error) || 'noma\'lum xato'), 'er');
    const tableBytes = b64ToBytes(t.base64);

    setRunning(true); cancelled = false;
    $('log').replaceChildren(); $('showFile').hidden = true; $('resultPath').textContent = '';
    $('prog').hidden = false; $('bar').max = creds.length; $('bar').value = 0;
    showMsg(`0 / ${creds.length} (${conc} ta oqim)`);
    await saveNow();
    const t0 = Date.now();
    try {
      const results = await window.HetEngine.collect(creds, {
        concurrency: conc, apiBase,
        isCancelled: () => cancelled,
        onProgress: ({ done, total, result }) => {
          $('bar').value = done; $('msg').textContent = `${done} / ${total}`; $('msg').className = '';
          log(result.status === 'ok' ? 'ok' : 'er', result.login + (result.status === 'ok' ? ' — olindi' : ' — ' + result.message));
          applyResult(result); scheduleSave();
        },
      });
      // Olingan ma'lumotlar jadvalga yozilishidan oldin ham saqlanadi (to'xtatilsa ham, jadval xato bersa ham yo'qolmaydi)
      await recordHistory(results);
      if (cancelled) { showMsg(`To'xtatildi (${results.length} ta ishlandi, olinganlari saqlandi). Jadval o'zgartirilmadi.`, 'wn'); return; }
      await produce(results, creds, tableBytes, t0);
    } catch (e) {
      showMsg('Xato: ' + (e && e.message ? e.message : e), 'er');
    } finally {
      setRunning(false);
      await saveNow();
    }
  }
  $('start').onclick = start;
  $('cancel').onclick = () => { cancelled = true; showMsg("To'xtatilmoqda…", 'wn'); };

  // ---- Boshlash ------------------------------------------------------------------------------------
  (async () => {
    try { await window.loadElektrModules(); modulesReady = true; }
    catch (e) { showInfo('Modullar yuklanmadi: ' + e.message, 'er'); }

    await loadHistory();
    const s = await rpc({ type: 'state.load' });
    if (s && s.warning) { $('warning').textContent = s.warning; $('warning').hidden = false; }
    accounts = ((s && s.accounts) || []).map(normalize);
    tablePath = (s && s.tablePath) || null;
    $('conc').value = (s && s.concurrency) || 4;
    apiBase = (s && s.apiBase) || undefined;
    render();
    if (tablePath) {
      const info = await rpc({ type: 'file.info', path: tablePath });
      tableName = (info && info.name) || tablePath.split(/[\\/]/).pop();
      paintTable(info);
    }
    updateStart();
  })();
  $('conc').onchange = scheduleSave;
})();
