// my.soliq.uz: markirovka search + login-state detection
(function () {
  const isLogin = () => location.pathname.startsWith("/login");

  function visibleInputs() {
    return [...document.querySelectorAll("input[type=search],input[type=text],input:not([type])")]
      .filter(e => e.offsetParent !== null && !e.disabled && !e.readOnly);
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
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Parse the "Markirovka kodi tarixi" page text: product fields + operation steps (1..N); we need the last step.
  function parseHistory(text) {
    const t = text.replace(/\r/g, "");
    const field = label => {
      const m = t.match(new RegExp("(?:^|\\n)\\s*" + label + "\\s*\\n+\\s*([^\\n]+)"));
      return m ? m[1].trim() : "";
    };
    const stepRe = /([^\n]+?)\s*\n\s*([^\n]+)\n\s*STIR:\s*(\d+)\s*\n\s*Operatsiya amalga oshirilgan sana\s*:\s*([\d-]+ [\d:]+)\s*\n\s*Manzil:\s*([^\n]+)/g;
    const steps = [];
    for (let m; (m = stepRe.exec(t)); )
      steps.push({ company: m[1].trim(), operation: m[2].trim(), stir: m[3], date: m[4], address: m[5].trim() });
    return {
      product: field("Mahsulot nomi"), size: field("Hajmi"), code: field("Markirovka kodi"),
      importer: field("Importyor nomi"), stir: field("STIR"), mxik: field("MXIK"), barcode: field("Shtrix kodi"),
      steps, last: steps.length ? steps[steps.length - 1] : null,
    };
  }
  if (typeof module !== "undefined") module.exports = { parseHistory };

  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m.type !== "mxik-search") return;
    (async () => {
      if (isLogin()) return reply({ loggedIn: false });
      for (let i = 0; i < 20 && !visibleInputs().length; i++) await sleep(500);
      if (!fill(m.code)) return reply({ loggedIn: true, text: "qidiruv maydoni topilmadi" });
      // fill() already pressed Enter; wait until the history (steps) is rendered
      // (the page may still show the PREVIOUS code's history: accept only the one whose code matches)
      const norm = x => String(x || "").replace(/[\x00-\x1f\x1d\s]/g, "");
      let text = "", h = null;
      for (let i = 0; i < 30; i++) {
        await sleep(500);
        text = (document.querySelector("main") || document.body).innerText;
        h = parseHistory(text);
        if (h.steps.length && norm(h.code) === norm(m.code)) break;
        h = null;
      }
      reply({ loggedIn: true, history: h, text: h ? "" : text.slice(0, 1500) });
    })();
    return true;                               // async reply
  });
})();
