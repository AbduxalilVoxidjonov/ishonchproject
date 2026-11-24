// Ishonch CRM (main.ishonchsale.uz): «Шартнома яратиш» oynasiga «Didox'dan to'ldirish» tugmasini qo'shadi.
// Maydonlarni faqat TO'LDIRADI: «Яратиш» tugmasini va «tasdiqlayman» belgisini hech qachon bosmaydi.
(() => {
  if (window.__ishCrm || !window.chrome || !chrome.webview) return;
  window.__ishCrm = true;
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const vis = (e) => !!e && e.getClientRects().length > 0;

  const dialog = () => [...document.querySelectorAll('[role=dialog]')].filter(vis)
    .find((d) => /Шартнома яратиш|Shartnoma yaratish/i.test(d.textContent));
  // Har qanday ochiq oyna (faqat shartnoma oynasi emas): ochiq turganda sahifaning boshqa joyiga bosilmaydi
  const anyDialog = () => [...document.querySelectorAll('[role=dialog]')].some(vis);
  const diag = (text) => { try { chrome.webview.postMessage({ kind: 'crmDiag', text: String(text).slice(0, 300) }); } catch { /* yopilgan */ } };

  // Label matni bo'yicha maydon bloki (label + uning ostidagi input/tugma)
  const block = (dlg, re) => {
    const lab = [...dlg.querySelectorAll('label')].find((l) => re.test(norm(l.textContent)));
    if (!lab) return null;
    let p = lab.parentElement;
    for (let i = 0; i < 4 && p; i++, p = p.parentElement) if (p.querySelector('input,textarea,button')) return p;
    return null;
  };
  const field = (dlg, re, sel) => { const b = block(dlg, re); return b ? b.querySelector(sel || 'input,textarea') : null; };

  const setValue = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  const waitFor = async (fn, ms = 4000, step = 100) => {
    for (let t = 0; t < ms; t += step) { const r = fn(); if (r) return r; await sl(step); }
    return null;
  };

  // ---- Bank MFO (qidiruvli ro'yxat) ----
  // Haqiqiy sichqoncha bosishi (CDP, C# orqali): bank ro'yxati oddiy JS click() ni qabul qilmaydi
  let clickSeq = 0;
  const clickWaits = new Map();
  // Bosish Ishonch'ga borib qaytguncha sahifa o'zgarishi mumkin (masalan «Шартнома яратиш» oynasi ochiladi): Ishonch
  // bosishdan oldin shu yerdan so'raydi — nuqtada hali o'sha element turibdimi. Aks holda bosish oyna tashqarisiga
  // tushib, ochiq oynani yopib yuboradi.
  const clickTargets = new Map();
  window.__ishCrmClickOk = (id, x, y) => {
    const t = clickTargets.get(id);
    if (!t || !t.el.isConnected || !vis(t.el)) return false;
    if (t.noDialog && anyDialog()) return false;
    const hit = document.elementFromPoint(x, y);
    return !!hit && (t.el === hit || t.el.contains(hit));
  };
  function trustedClick(el, noDialog) {
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    const id = ++clickSeq;
    clickTargets.set(id, { el, noDialog: !!noDialog });
    return new Promise((resolve) => {
      const done = (ok) => { clickTargets.delete(id); resolve(ok); };
      clickWaits.set(id, done);
      chrome.webview.postMessage({ kind: 'crmClick', id, x: r.left + r.width / 2, y: r.top + r.height / 2 });
      setTimeout(() => { if (clickWaits.delete(id)) done(false); }, 4000);
    });
  }

  async function pickMfo(dlg, mfo) {
    const btn = field(dlg, /МФО|MFO/i, 'button');
    if (!btn) return 'MFO maydoni topilmadi';
    const chosen = () => norm(btn.textContent).includes(mfo);
    const re = new RegExp('MFO:\\s*' + mfo + '(?!\\d)');
    const optText = () => [...document.querySelectorAll('[role=option]')].filter(vis).map((o) => o.innerText).join('|');
    let seen = false;
    for (let attempt = 0; attempt < 3 && !chosen(); attempt++) {
      // Ro'yxat ochiq bo'lmasa ochiladi va qidiruvga MFO yoziladi
      let inp = [...document.querySelectorAll('input[role=combobox]')].find(vis);
      if (!inp) { btn.click(); inp = await waitFor(() => [...document.querySelectorAll('input[role=combobox]')].find(vis), 4000, 25); }
      if (!inp) continue;
      if (inp.value !== mfo) setValue(inp, mfo);
      // Natija serverdan keladi: ro'yxat ikki marta ketma-ket bir xil bo'lguncha (tinchlanguncha) kutiladi
      let prev = '';
      for (let i = 0; i < 75; i++) {
        await sl(100);
        const cur = optText();
        if (cur && cur === prev && re.test(cur)) break;
        prev = cur;
      }
      const opt = [...document.querySelectorAll('[role=option]')].filter(vis).find((o) => re.test(o.innerText));
      if (!opt) continue;
      seen = true;
      await trustedClick(opt);
      await waitFor(chosen, 2500, 25);
    }
    if (chosen()) return null;
    return seen ? 'MFO ' + mfo + ' tanlanmadi, qo\'lda tanlang' : 'MFO ' + mfo + ' CRM bank ro\'yxatida topilmadi';
  }

  // ---- Sana (o'zgacha kalendar) ----
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MONTHS_L = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
  const monthOf = (t) => {
    const s = t.toLowerCase();
    for (let i = 11; i >= 0; i--) if (s.startsWith(MONTHS[i]) || s.startsWith(MONTHS_L[i])) return i;
    return -1;
  };
  async function pickDate(dlg, re, iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return "Didox hujjatida yo'q, qo'lda tanlang";
    const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
    const btn = field(dlg, re, 'button');
    if (!btn) return 'sana maydoni topilmadi';
    btn.click();
    const panel = await waitFor(() => [...document.querySelectorAll('[id^=headlessui-popover-panel]')].filter(vis).pop(), 4000, 20);
    if (!panel) return 'kalendar ochilmadi';
    const headOf = () => [...panel.querySelectorAll('span')].map((s) => norm(s.textContent)).find((t) => /^\S+ \d{4}$/.test(t));
    for (let k = 0; k < 400; k++) {
      const head = headOf();
      if (!head) return 'kalendar sarlavhasi topilmadi';
      const [mn, yr] = head.split(' ');
      const cur = +yr * 12 + monthOf(mn), want = y * 12 + mo;
      if (monthOf(mn) < 0) return 'oy nomi tanilmadi: ' + head;
      if (cur === want) break;
      const icon = cur < want ? 'chevron-right' : 'chevron-left';
      const b = [...panel.querySelectorAll('button')].find((x) => x.querySelector('[class*="i-heroicons:' + icon + '"]'));
      if (!b) return 'kalendar tugmasi topilmadi';
      b.click();
      // Belgilangan vaqt emas — sarlavha (oy) almashishi kutiladi
      await waitFor(() => headOf() !== head, 600, 10);
    }
    const day = [...panel.querySelectorAll('button')].filter(vis)
      .find((b) => norm(b.textContent) === String(d) && !/\/50\b/.test(b.className));
    if (!day) return 'kun topilmadi';
    day.click();
    // Kalendar yopilishi kutiladi (keyingi sana maydoni eski panelni topib olmasin)
    await waitFor(() => !vis(panel) || !panel.isConnected, 400, 10);
    return null;
  }

  // ---- Fayl ----
  function putFile(dlg, b64, name) {
    const inp = dlg.querySelector('input[type=file]');
    if (!inp) return 'fayl maydoni topilmadi';
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([arr], name, { type: 'application/pdf' }));
    inp.files = dt.files;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return null;
  }

  async function fill(c, pdf, pdfName) {
    const dlg = dialog();
    if (!dlg) return ['oyna yopilgan'];
    const errs = [];
    const set = (re, v, what) => {
      if (v === undefined || v === null || v === '') return;
      const el = field(dlg, re);
      if (!el) { errs.push(what + ': maydon topilmadi'); return; }
      setValue(el, String(v));
    };
    set(/фирма номи|firma nomi/i, c.partnerName, 'Hamkor nomi');
    set(/ҳисоб рақами|hisob raqami/i, c.partnerAccount, 'Hisob raqam');
    set(/Didox/i, c.docId, 'Didox ID');
    set(/Шартнома рақами|Shartnoma raqami/i, c.number, 'Shartnoma raqami');
    if (c.sum > 0) set(/суммаси|summasi/i, String(c.sum), 'Summa'); else errs.push("Summa: Didox hujjatida yo'q, qo'lda kiriting");
    if (!c.partnerAccount) errs.push("Hisob raqam va MFO: Didox'da topilmadi");
    set(/мақсади|maqsadi/i, c.purpose, 'Maqsad');
    // Avval bir zumda yoziladiganlari (matn maydonlari va fayl) — hammasi birdan; keyin ro'yxat/kalendar talab qiladiganlari
    let e;
    if (pdf) { e = putFile(dlg, pdf, pdfName); if (e) errs.push('Fayl: ' + e); }
    else errs.push('Fayl: Didox PDF olinmadi, qo\'lda yuklang');
    const t0 = Date.now();
    e = await pickDate(dlg, /бошланиш|boshlanish/i, c.date); if (e) errs.push('Boshlanish sanasi: ' + e);
    e = await pickDate(dlg, /амал қилиш|amal qilish/i, c.expireDate); if (e) errs.push('Amal qilish muddati: ' + e);
    const t1 = Date.now();
    if (c.partnerMfo) { e = await pickMfo(dlg, c.partnerMfo); if (e) errs.push('MFO: ' + e); }
    diag('to\'ldirish: sanalar ' + (t1 - t0) + ' ms, MFO ' + (Date.now() - t1) + ' ms');
    return errs;
  }

  // ---- tugma va holat qatori ----
  let bar = null, btn = null, msg = null, idBox = null, busy = false, list = null, lastReq = null;
  // Oyna CRM tomonidan qayta ishlatiladi: o'zi to'ldirish «hamkor STIRi + firma hisobi» o'zgarganda qayta boshlanadi
  let autoKey = '';
  const dialogKey = (dlg) => {
    const v = norm((field(dlg, /СТИР|STIR|ИНН/i) || {}).value).replace(/\D/g, '');
    const a = (/\d{20}/.exec(dlg.textContent) || [''])[0];
    return /^\d{9}$|^\d{14}$/.test(v) && a ? v + '|' + a : '';
  };
  function say(text, kind) {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = kind === 'err' ? '#b91c1c' : kind === 'ok' ? '#166534' : '#374151';
  }

  // Tashxis (Ishonch jurnaliga): oyna tanilmasa, tugma qo'yilmasa yoki oyna ochilib darrov yopilsa — sababi yoziladi
  let seenAt = 0, diagSaid = '';
  const diagOnce = (text) => { if (diagSaid !== text) { diagSaid = text; diag(text); } };
  function ensureBar() {
    const dlg = dialog();
    if (!dlg) {
      if (seenAt && Date.now() - seenAt < 3000) diag('«Шартнома яратиш» oynasi ochilib ' + (Date.now() - seenAt) + ' ms da yopildi');
      seenAt = 0;
      const other = [...document.querySelectorAll('[role=dialog]')].filter(vis).find((d) => /шартнома|shartnoma/i.test(d.textContent));
      if (other) diagOnce('shartnoma oynasi tanilmadi: ' + norm(other.textContent).slice(0, 120));
      bar = btn = msg = idBox = list = null; autoKey = ''; return;
    }
    if (!seenAt) seenAt = Date.now();
    if (!(bar && dlg.contains(bar))) createBar(dlg);
    if (!bar) diagOnce('«Шартнома яратиш» oynasida «фирма номи» maydoni topilmadi: ' + [...dlg.querySelectorAll('label')].map((l) => norm(l.textContent)).join(' | ').slice(0, 200));
    if (!bar || busy) return;
    // Oyna o'zi to'ldirilmaydi: Didox'dan faqat tugma bosilganda olinadi. Oyna boshqa hamkor bilan qayta ishlatilsa —
    // oldingi hamkorning ro'yxati va xabari tozalanadi
    const k = dialogKey(dlg);
    if (k && k !== autoKey) {
      autoKey = k;
      filledId = '';
      if (idBox) idBox.value = '';
      clearList();
      say(HINT);
    }
  }
  const HINT = 'Tugmani bosing: firma Didox\'idan shu hamkor bilan shartnoma olinadi. Yonidagi katakka Didox ID yozilsa — aynan o\'sha shartnoma. «Яратиш» ni o\'zingiz bosasiz.';
  // «Didox ID» maydonidagi qiymat (havola qo'yilgan bo'lsa — undagi ID). O'zimiz to'ldirgan ID hisobga olinmaydi:
  // to'ldirilgandan keyin tugma yana bosilsa ro'yxat qaytadan olinadi
  let filledId = '';
  const idOf = (raw) => (norm(raw).match(/[0-9A-Za-z][0-9A-Za-z-]{14,}[0-9A-Za-z]/g) || []).pop() || '';
  const typedDocId = (dlg) => {
    // Yashil qatordagi katakka yozilgani har doim hisobga olinadi; CRM ning o'z maydonidagisi — o'zimiz to'ldirmagan bo'lsa
    const own = idOf(idBox && idBox.value);
    if (own) return own;
    const id = idOf((field(dlg, /Didox/i) || {}).value);
    return id && id.toUpperCase() !== filledId.toUpperCase() ? id : '';
  };

  function createBar(dlg) {
    const firstLabel = [...dlg.querySelectorAll('label')].find((l) => /фирма номи|firma nomi/i.test(l.textContent));
    if (!firstLabel) return;
    bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:4px 0 10px;padding:8px 10px;border:1px dashed #16a34a;border-radius:8px;background:#f0fdf4;font:13px Inter,Segoe UI,sans-serif';
    btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '⬇ Didox\'dan to\'ldirish';
    btn.style.cssText = 'background:#16a34a;color:#fff;border:0;border-radius:6px;padding:6px 12px;font-weight:600;cursor:pointer;white-space:nowrap';
    // Didox ID katagi: yozilsa (ID yoki Didox havolasi) ro'yxat o'rniga aynan shu hujjat olinadi; Enter — tugma bilan bir xil
    idBox = document.createElement('input');
    idBox.type = 'text';
    idBox.placeholder = 'Didox ID (ixtiyoriy)';
    idBox.title = "Didox'dagi hujjat ID si yoki havolasi. Yozilsa aynan shu shartnoma olinadi; bo'sh bo'lsa hamkor bo'yicha qidiriladi.";
    idBox.autocomplete = 'off';
    idBox.style.cssText = 'width:270px;border:1px solid #86efac;border-radius:6px;padding:5px 8px;font:13px Inter,Segoe UI,sans-serif;background:#fff;color:#14532d';
    idBox.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); start(true); } };
    msg = document.createElement('span');
    msg.style.flexBasis = '100%';
    msg.textContent = HINT;
    bar.append(btn, idBox, msg);
    // «Ҳамкор: … Фирма ҳисоб рақами: …» kartochkasidan keyin (u bo'lmasa — birinchi maydon oldidan)
    const info = [...dlg.querySelectorAll('div')]
      .filter((e) => /Фирма ҳисоб рақами|Firma hisob raqami/i.test(e.textContent) && !e.querySelector('input,textarea,label'))
      .sort((a, b) => b.textContent.length - a.textContent.length)[0];
    if (info) info.insertAdjacentElement('afterend', bar);
    else firstLabel.parentElement.insertAdjacentElement('beforebegin', bar);
    // Qo'lda bosilsa — kesh chetlab o'tiladi va Didox'dan yangidan olinadi
    btn.onclick = () => start(true);
  }

  function start(force) {
    if (busy) return;
    const dlg = dialog();
    if (!dlg) return;
    const inn = norm((field(dlg, /СТИР|STIR|ИНН/i) || {}).value).replace(/\D/g, '');
    if (!/^\d{9}$|^\d{14}$/.test(inn)) { say('Hamkor STIR (9 raqam) bo\'sh yoki noto\'g\'ri', 'err'); return; }
    // «Фирма ҳисоб рақами: EXCELLENT SERVICE TRADE - 20208000905324182001 (ID: 45)»
    const txt = norm(dlg.innerText);
    const m = /(?:Фирма ҳисоб рақами|Firma hisob raqami):?\s*(.+?)\s*-\s*(\d{20})/i.exec(txt);
    if (!m) { say('Oynadan firma nomi va hisob raqami o\'qilmadi', 'err'); return; }
    busy = true; btn.disabled = true; btn.style.opacity = '.6';
    const byId = typedDocId(dlg);
    say(byId ? 'Didox ID ' + byId + ' bo\'yicha shartnoma olinmoqda…' : 'Didox\'dan qidirilmoqda…');
    clearList();
    lastReq = { inn, firm: m[1], account: m[2], force: !!force, key: dialogKey(dlg) };
    chrome.webview.postMessage({ kind: 'crmFill', ...lastReq, ...(byId ? { docId: byId } : {}) });
  }

  function clearList() { closeViewer(); if (list) { list.remove(); list = null; } }

  // Hamkorda bir nechta shartnoma bo'lsa: ro'yxat chiqadi, bosilgani Didox'dan o'qilib maydonlar to'ldiriladi
  function showList(items) {
    clearList();
    if (!bar) return;
    list = document.createElement('div');
    list.style.cssText = 'flex-basis:100%;display:flex;flex-direction:column;gap:4px;max-height:190px;overflow:auto';
    items.forEach((it, i) => {
      const line = document.createElement('div');
      line.style.cssText = 'display:flex;gap:4px;align-items:stretch';
      const row = document.createElement('button');
      row.type = 'button';
      row.textContent = (i + 1) + '.  №' + (it.number || '—') + '  ·  ' + it.date + '  ·  ' + it.status + '  ·  ' + it.type + (i === 0 ? '  (eng yangisi)' : '');
      row.style.cssText = 'flex:1;text-align:left;background:#fff;border:1px solid #86efac;border-radius:6px;padding:6px 10px;cursor:pointer;font:13px Inter,Segoe UI,sans-serif;color:#14532d';
      // 👁 — tanlashdan oldin shartnoma PDF ini alohida oynada ko'rish
      const eye = document.createElement('button');
      eye.type = 'button';
      eye.title = "Shartnomani ko'rish";
      eye.textContent = '👁';
      eye.style.cssText = 'background:#fff;border:1px solid #86efac;border-radius:6px;padding:0 10px;cursor:pointer;font-size:15px';
      eye.onmouseenter = () => { eye.style.background = '#dcfce7'; };
      eye.onmouseleave = () => { eye.style.background = '#fff'; };
      eye.onclick = (e) => { e.stopPropagation(); preview(it); };
      line.append(row, eye);
      row.onmouseenter = () => { row.style.background = '#dcfce7'; };
      row.onmouseleave = () => { row.style.background = '#fff'; };
      row.onclick = () => pick(it);
      list.append(line);
    });
    bar.append(list);
    shownItems = items;
  }

  // ---- shartnomani ko'rish: PDF alohida katta oynada (Ishonch), u yerdan tanlash ham mumkin ----
  let shownItems = [];
  function closeViewer() { /* ko'rish oynasi Ishonch tomonida — sahifada yopiladigan narsa yo'q */ }
  function preview(it) {
    if (!lastReq) return;
    say('№' + (it.number || '—') + " shartnomasi alohida oynada ochilmoqda…");
    chrome.webview.postMessage({ kind: 'crmPreview', docId: it.docId, ...lastReq });
  }
  function pick(it) {
    if (busy || !lastReq) return;
    busy = true; if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }
    say('№' + it.number + " Didox'dan o'qilmoqda…");
    chrome.webview.postMessage({ kind: 'crmPick', docId: it.docId, ...lastReq });
  }
  function showPdf(d) {
    if (d.error) { say(d.error, 'err'); return; }
    if (d.opened) say('№' + d.number + " alohida oynada ochildi. Ko'rib bo'lgach, o'sha oynadagi «Shu shartnomani tanlash» ni yoki ro'yxatdagi qatorni bosing.");
  }

  chrome.webview.addEventListener('message', async (ev) => {
    const d = ev.data || {};
    if (d.kind === 'crmClicked') { const f = clickWaits.get(d.id); if (f) { clickWaits.delete(d.id); f(d.ok !== false); } return; }
    // Oyna yopilib boshqa hamkor bilan ochilgan bo'lsa — eski so'rov javobi yangi oynaga yozilmaydi
    const cur = dialog();
    if (d.key && (!cur || dialogKey(cur) !== d.key)) {
      if (d.kind === 'crmData' || d.kind === 'crmList' || d.done) { busy = false; if (btn) { btn.disabled = false; btn.style.opacity = '1'; } }
      return;
    }
    if (d.kind === 'crmStatus') { say(d.text, d.level); if (d.done) { busy = false; if (btn) { btn.disabled = false; btn.style.opacity = '1'; } } return; }
    if (d.kind === 'crmPdf') { showPdf(d); return; }
    if (d.kind === 'crmChoose') { const it = shownItems.find((x) => x.docId === d.docId); if (it) pick(it); return; }
    if (d.kind === 'crmList') {
      busy = false; if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      showList(d.items || []);
      say('Hamkor bilan ' + (d.items || []).length + " ta shartnoma topildi. Keraklisini tanlang: maydonlar o'shandan to'ldiriladi.");
      return;
    }
    if (d.kind !== 'crmData') return;
    clearList();
    try {
      const errs = await fill(d.contract, d.pdf, d.pdfName);
      filledId = d.contract.docId || '';
      const head = '№' + d.contract.number + ' (' + d.contract.date + ', ' + d.contract.status + ')' + (d.note ? ' — ' + d.note : '');
      if (errs.length) say('To\'ldirildi: ' + head + '. Qo\'lda tekshiring: ' + errs.join('; '), 'err');
      else say('To\'ldirildi: ' + head + '. Tekshirib, «tasdiqlayman» belgisini qo\'yib, «Яратиш» ni o\'zingiz bosing.', /tekshiring/.test(d.note || '') ? 'err' : 'ok');
    } catch (e) { say('To\'ldirishda xato: ' + e, 'err'); }
    busy = false; if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  });

  // ---- Бухгалтерия kuzatuvi: holati o'zgargan arizalar (Ishonch har daqiqada tekshiradi) ----
  let changes = [];
  let banner = null;
  function renderChanges() {
    if (!document.body) return;
    if (!changes.length) { if (banner) { banner.remove(); banner = null; } markRows(); return; }
    if (!banner || !document.body.contains(banner)) {
      banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483000;max-width:760px;width:calc(100% - 40px);'
        + 'background:#fff7ed;border:2px solid #f97316;border-radius:10px;box-shadow:0 6px 24px #0003;font:13px Inter,Segoe UI,sans-serif;color:#7c2d12';
      document.body.append(banner);
    }
    banner.innerHTML = '';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;font-weight:700;cursor:pointer';
    const title = document.createElement('span');
    title.textContent = "🔔 Main'da o'zgarish: " + changes.length + " ta ariza (Бухгалтерия) — qarang, shartnomani ko'ring (holati o'zgarsa o'zi ketadi)";
    const toggle = document.createElement('span');
    toggle.style.cssText = 'margin-left:auto;font-weight:400;color:#9a3412';
    toggle.textContent = banner.dataset.open === '1' ? 'yopish ▲' : "ko'rish ▼";
    // «Ko'rdim» yo'q: ariza holati yana o'zgarsa yoki Бухгалтерия'dan chiqsa, ro'yxatdan o'zi ketadi
    head.append(title, toggle);
    head.onclick = () => { banner.dataset.open = banner.dataset.open === '1' ? '0' : '1'; renderChanges(); };
    banner.append(head);
    if (banner.dataset.open === '1') {
      const listEl = document.createElement('div');
      listEl.style.cssText = 'max-height:300px;overflow:auto;border-top:1px solid #fed7aa;padding:6px 12px';
      for (const c of changes) {
        const row = document.createElement('div');
        row.style.cssText = 'padding:4px 0;border-bottom:1px dashed #fed7aa';
        const when = (c.when || '').replace('T', ' ').slice(0, 16);
        row.textContent = (c.isNew ? '🆕 ' : '🔄 ') + 'T.ID ' + c.partnerId + ' — ' + c.partner + ' (' + c.firm + '): '
          + (c.isNew ? '' : c.oldStatus + ' → ') + c.newStatus + (when ? '  [' + when + ' UTC]' : '');
        listEl.append(row);
      }
      banner.append(listEl);
    }
    markRows();
  }
  // Jadvalda o'zgargan qatorlar to'q sariq chiziq bilan belgilanadi (T.ID bo'yicha)
  // Holati o'zgargan ariza qatori — holati yana o'zgarmaguncha (yoki Бухгалтерия'dan chiqmaguncha) qizil ramkada turadi.
  // Qator «Юник ID» (c_2325) bo'yicha topiladi: bo'lingan arizada birinchi katakda «О: c_2316 Б: c_2322» — o'zinikisi oxirgisi.
  function rowUid(tr) {
    const all = ((tr.cells[0] && tr.cells[0].textContent) || '').match(/c_\d+/g);
    return all ? all[all.length - 1] : '';
  }
  function markRows() {
    const uids = new Set(changes.map((c) => c.uid).filter(Boolean));
    const pids = new Set(changes.filter((c) => !c.uid).map((c) => String(c.partnerId)));
    for (const tr of document.querySelectorAll('tbody tr')) {
      const hit = uids.has(rowUid(tr)) || [...tr.cells].some((td) => pids.has(td.textContent.trim()));
      if (hit && !tr.dataset.ishChanged) {
        tr.dataset.ishChanged = '1';
        tr.style.outline = '3px solid #dc2626';
        tr.style.outlineOffset = '-3px';
        for (const td of tr.cells) { td.dataset.ishBg = td.style.background || ''; td.style.background = '#fef2f2'; }
      }
      if (!hit && tr.dataset.ishChanged) {
        delete tr.dataset.ishChanged;
        tr.style.outline = '';
        for (const td of tr.cells) { td.style.background = td.dataset.ishBg || ''; delete td.dataset.ishBg; }
      }
    }
  }
  chrome.webview.addEventListener('message', (ev) => {
    const d = ev.data || {};
    if (d.kind === 'crmChanges') {
      const grew = (d.items || []).length > changes.length;
      changes = d.items || [];
      renderChanges();
      // Yangi o'zgarish kelsa jadval yangilanadi (forma ochiq bo'lmasa — buxgalter ishiga xalal bermasin)
      if (grew && !dialog()) [...document.querySelectorAll('button')].find((b) => /^\s*(Янгилаш|Yangilash)\s*$/.test(b.textContent))?.click();
    }
  });
  setInterval(() => { if (changes.length) { if (!banner || !document.body.contains(banner)) renderChanges(); else markRows(); } }, 2000);

  // «Масъул бўлим» filtri: sahifa ochilganda bo'sh bo'lsa — o'zi «Бухгалтерияда» qilinadi (foydalanuvchi boshqasini
  // tanlagan bo'lsa tegilmaydi). Ro'yxat oddiy JS bosishini qabul qilmaydi — haqiqiy sichqoncha bosishi (C#) ishlatiladi.
  let filterPath = '', filterBusy = false, filterTries = 0;
  async function autoFilter() {
    // Sahifa ko'rinib turganda (tab faol) — yashirin sahifaga sichqoncha bosishi yetmaydi
    if (filterBusy || document.visibilityState !== 'visible' || !/\/new-payments/.test(location.pathname) || anyDialog()) return;
    if (filterPath === location.pathname) return;
    const b = [...document.querySelectorAll('main button')].find((x) => norm(x.textContent) === 'Масъул бўлим');
    if (!b) {
      // Filtr allaqachon tanlangan (yoki sahifa hali chizilmagan): tanlangan bo'lsa qaytib urinilmaydi
      if ([...document.querySelectorAll('main button')].some((x) => /Бухгалтерияда|Бош офис|Юристда|Таъминотчида|Банк клиентда|Таминотчилар/.test(x.textContent))) filterPath = location.pathname;
      return;
    }
    filterBusy = true;
    try {
      // Ikki marta urinib bo'lmasa (ro'yxatda «Бухгалтерияда» yo'q — boshqa bo'lim xodimi) qayta-qayta bosilmaydi
      if (++filterTries > 2) { filterPath = location.pathname; diag('filtr: «Бухгалтерияда» tanlanmadi, qayta urinilmaydi'); return; }
      const opts = () => [...document.querySelectorAll('[role=option]')].filter(vis);
      if (!(await trustedClick(b, true))) return;
      const o = await waitFor(() => opts().find((x) => norm(x.textContent) === 'Бухгалтерияда'), 3000);
      if (o && !anyDialog()) { if (await trustedClick(o, true)) filterPath = location.pathname; }
      // Topilmasa ochilgan ro'yxat yopiladi (ochiq qolsa keyingi bosishlarni to'sadi)
      else if (opts().length && !anyDialog()) await trustedClick(b, true);
    } finally { filterBusy = false; }
  }
  setInterval(() => { if (!/\/new-payments/.test(location.pathname)) { filterPath = ''; filterTries = 0; } else autoFilter(); }, 1500);
  addEventListener('DOMContentLoaded', () => chrome.webview.postMessage({ kind: 'crmReady' }));

  // Skript hujjat yaratilayotganda ishlaydi (documentElement hali yo'q bo'lishi mumkin): document kuzatiladi, zaxira — taymer
  let pending = false;
  new MutationObserver(() => { if (pending) return; pending = true; setTimeout(() => { pending = false; ensureBar(); }, 150); })
    .observe(document, { childList: true, subtree: true });
  setInterval(ensureBar, 1500);
})();
