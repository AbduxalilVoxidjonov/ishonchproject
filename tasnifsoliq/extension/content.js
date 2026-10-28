// my.soliq.uz: markirovka search + login-state detection
(function () {
  const isLogin = () => location.pathname.startsWith("/login");

  function visibleInputs() {
    const all = root => [...root.querySelectorAll("input[type=search],input[type=text],input:not([type])")]
      .filter(e => e.offsetParent !== null && !e.disabled && !e.readOnly);
    // the code field lives in the page body; a header search box must not win just by coming first
    const main = document.querySelector("main"), list = (main && all(main).length ? all(main) : all(document));
    const hint = e => (e.placeholder || "") + " " + (e.getAttribute("aria-label") || "") + " " + (e.name || "");
    return list.sort((a, b) => /kod|код|markir|маркир/i.test(hint(b)) - /kod|код|markir|маркир/i.test(hint(a)));
  }
  function fill(code) {
    const el = visibleInputs()[0];
    if (!el) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    el.focus(); set.call(el, code);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    for (const t of ["keydown", "keypress", "keyup"])
      el.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    clickSearchButton(el);
    return true;
  }
  // the magnifier button next to the field: look in the input's wrapper, widening up to 4 levels
  function clickSearchButton(input) {
    let box = input.parentElement;
    for (let i = 0; i < 4 && box; i++, box = box.parentElement) {
      const cands = [...box.querySelectorAll("button,[role=button],.ant-input-search-button,[class*=search]")]
        .filter(b => b !== input && !b.contains(input) && b.offsetParent !== null && !b.disabled);
      const btn = cands.find(b => /search|lupa|qidir/i.test(b.className + " " + (b.getAttribute("aria-label") || "")))
        || cands.find(b => b.tagName === "BUTTON" && b.querySelector("svg,img,i,span"));
      if (btn) { setTimeout(() => btn.click(), 150); return true; }
    }
    return false;
  }
  // Timers of a background tab are throttled (down to once a minute after a while); the service
  // worker's are not, so waits go through it. Without it, the plain timer still works.
  const sleep = ms => new Promise(r => {
    try {
      chrome.runtime.sendMessage({ type: "mxik-sleep", ms }, () => { if (chrome.runtime.lastError) setTimeout(r, ms); else r(); });
    } catch (_) { setTimeout(r, ms); }
  });

  // Parse the "Markirovka kodi tarixi" page text: product fields + operation steps (1..N); we need the last step.
  function parseHistory(text) {
    // table/grid layouts put a tab between label and value instead of a line break
    const t = text.replace(/\r/g, "").replace(/\t+/g, "\n").replace(/\u00a0/g, " ");
    const field = label => {
      const m = t.match(new RegExp("(?:^|\\n)\\s*" + label + "\\s*\\n+\\s*([^\\n]+)"));
      return m ? m[1].trim() : "";
    };
    const stepRe = /([^\n]+?)\s*\n\s*([^\n]+)\n\s*STIR:\s*(\d+)\s*\n\s*Operatsiya amalga oshirilgan sana\s*:\s*([\d.\/-]+,?\s+[\d:]+)\s*\n\s*Manzil:\s*([^\n]+)/g;
    const steps = [];
    for (let m; (m = stepRe.exec(t)); )
      steps.push({ company: m[1].trim(), operation: m[2].trim(), stir: m[3], date: m[4].replace(/,/, ""), address: m[5].trim() });
    return {
      product: field("Mahsulot nomi"), size: field("Hajmi"), code: field("Markirovka kodi"),
      importer: field("Importyor nomi"), stir: field("STIR"), mxik: field("MXIK"), barcode: field("Shtrix kodi"),
      steps, last: latestStep(steps),
    };
  }
  // the newest operation by date (the page order is not trusted); ties keep the later one on the page
  function stepTime(d) {
    const m = String(d || "").match(/^(\d{1,4})[-./](\d{1,2})[-./](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return NaN;
    const [y, d2] = m[1].length === 4 ? [m[1], m[3]] : [m[3], m[1]];
    return Date.UTC(+y, +m[2] - 1, +d2, +m[4], +m[5], +(m[6] || 0));
  }
  function latestStep(steps) {
    let best = null, bestT = -Infinity;
    for (const s of steps) {
      const t = stepTime(s.date);
      if (Number.isNaN(t)) return steps[steps.length - 1] || null;
      if (t >= bestT) { best = s; bestT = t; }
    }
    return best;
  }
  if (typeof module !== "undefined") module.exports = { parseHistory };

  // The history parser reads the Latin-Uzbek page only, so the site is switched to it first, whatever language
  // it was left in (Cyrillic Uzbek, Russian, English, Karakalpak). The header dropdown shows every language
  // under its own name, which makes the choice independent of the current one.
  const isLatin = () => /^uz-Latn$/i.test(document.documentElement.lang);
  const LANG_NAMES = /^(Ўзбекча|O[ʻʼ'’‘`´]zbekcha|Qaraqalpaqsha|Русский|English)$/;
  async function ensureLatin() {
    if (isLatin()) return true;
    const trigger = [...document.querySelectorAll("button.ant-dropdown-trigger, .ant-dropdown-trigger")]
      .find(b => LANG_NAMES.test((b.textContent || "").trim()));
    if (trigger) {
      trigger.click();
      for (let i = 0; i < 10 && !document.querySelector(".ant-dropdown-menu-item"); i++) await sleep(200);
      const item = [...document.querySelectorAll(".ant-dropdown-menu-item")]
        .find(e => /^O[ʻʼ'’‘`´]zbekcha$/.test((e.textContent || "").trim()));
      if (item) {
        item.click();
        for (let i = 0; i < 20 && !isLatin(); i++) await sleep(300);
        if (isLatin()) { await sleep(800); return true; }
      }
    }
    // no dropdown found: the site keeps its language in localStorage; set it and reload (the caller retries)
    try {
      localStorage.setItem("i18nextLng", "uz_latn");
      location.reload();
    } catch (_) { /* storage blocked */ }
    return false;
  }

  // only one search at a time: the page has a single search field
  let queue = Promise.resolve();
  async function search(code) {
    if (isLogin()) return { loggedIn: false };
    if (!(await ensureLatin())) return null; // page is reloading in the right language; the caller asks again
    for (let i = 0; i < 20 && !visibleInputs().length; i++) await sleep(500);
    if (!fill(code)) return { loggedIn: true, found: false, history: null, reason: "qidiruv maydoni topilmadi", text: "" };
    // fill() already pressed Enter; wait until the history (steps) is rendered
    // (the page may still show the PREVIOUS code's history: accept only the one whose code matches)
    const norm = x => String(x || "").replace(/[\x00-\x1f\x1d\s]/g, "");
    let text = "", h = null;
    // by the clock, not by a number of tries: a throttled background tab must not stretch the wait
    for (const end = Date.now() + 20000; Date.now() < end; ) {
      await sleep(500);
      text = (document.querySelector("main") || document.body).innerText;
      h = parseHistory(text);
      if (h.steps.length && norm(h.code) === norm(code)) break;
      h = null;
    }
    // A missing history is a real negative result.  Do not leave the caller
    // guessing from the page text (which can still contain a previous search).
    let reason = h ? "" : "markirovka topilmadi";
    // the parser knows the Latin-Uzbek page only
    if (!h && /[А-Яа-яЎўҚқҒғҲҳ]{4}/.test(text) && !/Markirovka|Mahsulot nomi/.test(text))
      reason = "my.soliq.uz tilini O'zbekcha (lotin) ga o'tkazing";
    return { loggedIn: true, found: !!h, history: h, reason, text: h ? "" : text.slice(0, 1500) };
  }

  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m.type !== "mxik-search") return;
    const job = queue.then(() => search(m.code));
    queue = job.catch(() => {});
    job.then(reply, e => reply({ loggedIn: true, found: false, history: null, reason: String(e && e.message || e) }));
    return true;                               // async reply
  });
})();
