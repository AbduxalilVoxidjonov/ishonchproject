// 1C veb-mijozi sahifasida ishlaydigan yordamchi funksiyalar (Markirovkasiz sotish uchun).
// Faqat o'qiydi va koordinatalarni qaytaradi; haqiqiy bosish va yozishni C# (CDP) bajaradi.
(() => {
  if (window.__ish) return;
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const fnum = (e) => { const m = /^form(\d+)/.exec(e.id); return m ? +m[1] : 0; };
  const norm = (s) => String(s == null ? '' : s).replace(/[\s ]+/g, ' ').trim();
  const center = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
  // Eng yuqoridagi (eng katta formN) ko'rinib turgan element
  const bySuffix = (suffix, tag) => {
    const l = [...document.querySelectorAll((tag || '') + '[id$="' + suffix + '"]')].filter(vis);
    l.sort((a, b) => fnum(a) - fnum(b));
    return l[l.length - 1] || null;
  };

  window.__ish = {
    norm,
    pos: (suffix, tag) => { const e = bySuffix(suffix, tag); return e ? center(e) : null; },
    value: (suffix) => { const e = bySuffix(suffix, 'input'); return e ? e.value : null; },
    prefix: (suffix) => { const e = bySuffix(suffix); return e ? (/^form\d+/.exec(e.id) || [''])[0] : null; },
    has: (suffix) => !!bySuffix(suffix),
    // Matn bo'yicha: selector + aniq matn (oxirgi ko'rinadigani)
    posText: (selector, text, startsWith) => {
      const l = [...document.querySelectorAll(selector)].filter((e) => vis(e) && (startsWith ? norm(e.textContent).startsWith(text) : norm(e.textContent) === text));
      const e = l[l.length - 1];
      return e ? center(e) : null;
    },
    // Barg element: matni aniq shu, ichida xuddi shu matnli ko'rinadigan bola yo'q
    posLeaf: (text) => {
      const l = [...document.querySelectorAll('div,a,span,td,li')].filter((e) => vis(e) && norm(e.textContent) === text
        && ![...e.querySelectorAll('*')].some((c) => vis(c) && norm(c.textContent) === text));
      const e = l[l.length - 1];
      return e ? center(e) : null;
    },
    // Ochiq podmenyudagi band (har qanday teg; eng kichik ko'rinadigan element)
    menuItem: (text) => {
      const menus = [...document.querySelectorAll('[id$="_submenu"]')].filter(vis);
      for (const m of menus) {
        const l = [...m.querySelectorAll('*')].filter((e) => vis(e) && norm(e.textContent) === text);
        l.sort((x, y) => x.getBoundingClientRect().width * x.getBoundingClientRect().height - y.getBoundingClientRect().width * y.getBoundingClientRect().height);
        if (l.length) return center(l[0]);
      }
      return null;
    },
    // Chap tomondagi bo'lim (Продажи, Склад …)
    posSection: (text) => {
      const e = [...document.querySelectorAll('[id^="themesCell_theme_"]')].find((x) => vis(x) && norm(x.textContent) === text);
      return e ? center(e) : null;
    },
    modalButton: (text) => {
      const l = [...document.querySelectorAll('.pressButton')].filter((e) => vis(e) && norm(e.textContent) === text);
      const e = l[l.length - 1];
      return e ? center(e) : null;
    },
    // Modal oynadagi savol/xato matni (oxirgi formN_Message)
    modalText: () => {
      const l = [...document.querySelectorAll('[id$="_Message"]')].filter(vis);
      l.sort((a, b) => fnum(a) - fnum(b));
      return l.length ? norm(l[l.length - 1].textContent) : null;
    },
    messages: () => [...document.querySelectorAll('[id^="msg"].gridLine')].map((e) => norm(e.textContent)),
    // Ochiq tablar (1C yuqori qatori)
    openTabs: () => [...document.querySelectorAll('#openedCell_cont .openedItem')].map((e) => {
      const c = e.querySelector('[id$="_cmd_close"]') || document.getElementById(e.id + '_cmd_close');
      return { text: norm(e.textContent), selected: e.classList.contains('select'), pos: center(e), close: c ? center(c) : null };
    }),
    // Jadval: ustun nomlari va to'liq ko'rinib turgan qatorlar (id yoki eng yuqori formadagi "_nom" oxiri bo'yicha)
    grid: (id, bySuffixName) => {
      const g = bySuffixName ? bySuffix("_" + id) : document.getElementById(id);
      if (!g) return null;
      const lines = [...g.querySelectorAll('.gridLine')];
      if (!lines.length) return null;
      const head = {};
      for (const b of lines[0].querySelectorAll('.gridBox')) head[b.getAttribute('colindex')] = norm(b.textContent);
      const gr = g.getBoundingClientRect();
      const hr = lines[0].getBoundingClientRect();
      const top = hr.bottom - 2, bottom = gr.bottom - 14;
      const rows = [];
      for (const l of lines.slice(1)) {
        const r = l.getBoundingClientRect();
        if (r.height <= 0 || r.top < top || r.bottom > bottom + 2) continue; // qisman ko'rinadiganlar o'tkazib yuboriladi
        const cells = {};
        for (const b of l.querySelectorAll('.gridBox')) {
          const br = b.getBoundingClientRect();
          cells[b.getAttribute('colindex')] = { t: norm(b.textContent), x: Math.round(br.left + br.width / 2), y: Math.round(br.top + br.height / 2) };
        }
        rows.push({ y: Math.round(r.top + r.height / 2), sel: /\bselect\b/.test(l.className), cells });
      }
      return { head, rows, cx: Math.round(gr.left + gr.width / 2), cy: Math.round((top + bottom) / 2), rowH: rows.length > 1 ? Math.abs(rows[1].y - rows[0].y) : 31,
        left: Math.round(Math.max(0, gr.left)), right: Math.round(Math.min(innerWidth, gr.right) - 18) };
    },
    // Ro'yxat (ValueList) va ochiladigan ro'yxat (combo) satrlari
    listItems: () => [...document.querySelectorAll('li')].filter((e) => vis(e) && e.querySelector('.eddText')).map((e) => ({ t: norm(e.textContent), selected: e.classList.contains('select'), ...center(e) })),
    valueListRows: (id) => [...document.querySelectorAll('#' + id + ' .gridBoxText')].filter(vis).map((e) => ({ t: norm(e.textContent), selected: !!e.closest('.select'), ...center(e) })),
    watchMove: () => { window.__moved = null; window.addEventListener('mousemove', (e) => { if (e.isTrusted) window.__moved = { x: e.clientX, y: e.clientY }; }, true); },
    moved: () => window.__moved || null,
  };
})();
