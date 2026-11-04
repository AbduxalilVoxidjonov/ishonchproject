// Markirovka ko‘chirish — panel and step engine running inside the 1C web client page.
//
// Flow (one inventory item at a time):
//   Olish (capture)  : read every row of the open "Инвентаризация товаров" table (Номенклатура, Кол-во факт)
//   Per item         : Реализация → Подбор → tick "По остаткам расширенный коды маркировки" → type the name
//                      into "Найти" (key by key) + Enter → for as many marking codes as the inventory quantity:
//                      Enter, "1", Enter, ↓ in the "Количество" column → "Перенести в документ"
//
// 1C element ids look like "form13_СтрокаПоиска_i0": the form number changes, the element name does not,
// so every lookup matches on the id suffix and takes the visible element.

(() => {
  const VERSION = chrome.runtime.getManifest?.().version || '1.0.0';
  const previous = window.__mkKochirishInstance;
  try { if (previous?.version === VERSION && previous.alive()) return; } catch { /* invalidated extension context */ }
  try { previous?.dispose(); } catch { /* invalidated old runtime must not prevent replacement */ }
  let disposed = false;
  let restored = false;
  const timers = new Map();
  const alive = () => {
    try { return !disposed && !!chrome.runtime?.id; } catch { return false; }
  };
  const instance = { version: VERSION, alive, dispose() {
    if (disposed) return;
    disposed = true;
    for (const [id, resolve] of timers) { clearTimeout(id); clearInterval(id); resolve?.(); }
    timers.clear();
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch { /* runtime invalidated */ }
    try { chrome.runtime.onConnect?.removeListener(onConnect); } catch { /* runtime invalidated */ }
    for (const port of ports) { try { port.disconnect(); } catch { /* already gone */ } }
    ports.clear();
    host.remove();
  }};
  window.__mkKochirishInstance = instance;
  // Pre-0.9.4 repair timers consult this global; retire them permanently.
  // This instance uses its captured alive() and the versioned singleton above.
  window.__mkKochirishAlive = () => false;
  const assertAlive = () => { if (!alive()) throw new StopError(); };
  const HOST_ID = 'mk-kochirish-host';
  document.getElementById(HOST_ID)?.remove();

  const IS_MAC = /Mac/i.test(navigator.platform);
  // The Ishonch desktop app (not the Chrome extension) can sell through E-POS: its bridge has this runtime id
  const IS_DESKTOP = (() => { try { return chrome.runtime?.id === 'ishonch-desktop'; } catch { return false; } })();
  const STORE_KEY = 'mk1c_state';
  const timerSleep = (ms) => new Promise((resolve) => {
    assertAlive();
    const id = setTimeout(() => { timers.delete(id); resolve(); }, ms);
    timers.set(id, resolve);
  });
  // In a background tab Chrome throttles page timers (to once a second, later once a minute):
  // wait on the extension's service worker instead, falling back to a page timer
  const sleep = async (ms) => {
    if (!document.hidden && document.hasFocus()) return timerSleep(ms);
    try {
      await chrome.runtime.sendMessage({ type: 'sleep', ms });
    } catch {
      await timerSleep(ms);
    }
  };

  // Timing (ms); 1C round-trips to the server after most actions
  const T = {
    poll: 200,
    afterClick: 400,
    afterType: 300,
    afterCell: 350,
    afterScroll: 500,
    openForm: 15000,
    search: 15000,
  };

  class StopError extends Error {}

  // ---------------------------------------------------------------------------
  // State (persisted, so a page reload does not lose progress)
  // ---------------------------------------------------------------------------
  const emptyState = () => ({
    version: VERSION,
    schemaVersion: globalThis.ReceiptStateMigration.SCHEMA_VERSION,
    status: 'idle', // idle | running | paused | stopped | done
    stepMode: false, // pause automatically after each item
    mode: 'marked', // retained for saved-state compatibility
    legacyModeBlocked: false,
    plan: null, // { target, total } when the quantities come from a sum plan
    captureLimit: '', // optional first N physical inventory rows
    perItemLimit: '2', // units per product: a whole number, or empty for the whole stock
    stir: '', // our STIR: a code is taken only when its last operation is wholesale to this STIR
    clock: null, // WorkClock of the current task
    badCodes: [], // marking codes skipped in this receipt: { name, rows, position, code, reason, time }
    seenCodes: {}, // every marking code met in Подбор: code → { name, rows, position }
    usedCodes: {}, // marking codes transferred to a receipt: code → { name, receiptId, time }
    badDb: {}, // codes soliq.uz definitively refused (sold / another STIR), kept across receipts: code → { name, product, reason, stir, time, seen }
    pendingCodes: [], // codes given 1 for the item being transferred, not yet confirmed
    receiptId: null, // tells this receipt's codes from earlier receipts' ones
    source: null, // { title, rowCount, capturedAt }
    items: [], // { name, stock, price, qty (to sell), rowNumbers, placed, status: 'pending'|'ok'|'kam'|'xato'|'skip', note }
    inFlight: null,
    document: null,
    documentNeedsAck: false,
    previousPrefix: null,
    history: [],
    phase: 'transfer',
    index: 0,
    current: null, // item being worked on: { name, need, placed } — shown while paused
    log: [],
  });
  let state = emptyState();
  let activeTask = null; // 'capture' | 'run' while one of them is executing (never both)
  let captureProgress = null; // { read, total } while «Olish» runs: rows read so far (shown, also while paused)
  let resumeCount = 0; // grows every time a pause ends: steps use it to re-check the cursor

  const startClock = (task) => { state.clock = globalThis.WorkClock?.start(task) ?? null; };
  const syncClock = () => globalThis.WorkClock?.sync(state.clock, state.status);

  const save = () => {
    assertAlive();
    if (!restored) throw new Error('Saved state is not ready');
    syncClock();
    return chrome.storage.local.set({ [STORE_KEY]: state });
  };

  const log = (text, level = 'info') => {
    if (!alive()) return;
    const time = new Date().toLocaleTimeString('ru-RU');
    state.log.push({ time, text, level });
    if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
    save();
    render();
  };

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  const isVisible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /** First visible element whose id ends with `suffix` (optionally restricted to a tag). */
  const bySuffix = (suffix, tag = '') =>
    [...document.querySelectorAll(`${tag}[id$="${suffix}"]`)].find(isVisible) || null;

  const formPrefix = (el) => el?.id?.match(/^form\d+/)?.[0] || '';

  const center = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  };

  /** Synthetic click: enough for 1C buttons and checkboxes. */
  const domClick = (el) => {
    assertAlive();
    const { x, y } = center(el);
    const o = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  };

  /** Trusted input through chrome.debugger (typing, Enter, grid cells, scrolling). */
  const cdp = async (action) => {
    assertAlive();
    const res = await chrome.runtime.sendMessage({ type: 'cdp', version: VERSION, action });
    assertAlive();
    if (!res?.ok) throw new Error(res?.error || 'chrome.debugger javob bermadi');
  };
  // With a browser zoom other than 100% the debugger's coordinates may not be the page's CSS pixels.
  // A trusted mouse move shows where a point really lands; the ratio is kept until the page is resized.
  let coordScale = null;
  window.addEventListener?.('resize', () => { coordScale = null; });
  const measureScale = async (x, y) => {
    let seen = null;
    const onMove = (e) => { if (e.isTrusted) seen = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMove, true);
    try {
      await cdp({ type: 'move', x, y });
      for (let i = 0; i < 10 && !seen; i++) await timerSleep(30);
    } finally {
      window.removeEventListener('mousemove', onMove, true);
    }
    if (!seen || !(seen.x > 0)) return 1;
    const scale = seen.x / x;
    return Math.abs(scale - 1) < 0.02 ? 1 : scale;
  };
  const realClick = async (el, count = 1) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const { x, y } = center(el);
    if (coordScale === null) {
      coordScale = await measureScale(x, y);
      if (coordScale !== 1) log(`Brauzer masshtabi 100% emas (${Math.round(100 / coordScale)}%): bosish joyi moslashtirildi. Yaxshisi Ctrl+0 bosing.`, 'warn');
    }
    await cdp({ type: 'click', x: Math.round(x / coordScale), y: Math.round(y / coordScale), count });
  };

  /** Pause / stop gate between every atomic step. */
  const checkpoint = async () => {
    assertAlive();
    if (state.status === 'paused') {
      while (state.status === 'paused') { assertAlive(); await sleep(250); }
      assertAlive();
      if (state.status !== 'stopped') resumeCount++;
    }
    if (state.status === 'stopped') throw new StopError();
    if (activeTask === 'run') assertDocument();
  };

  /**
   * Polls `fn` until it returns something truthy. The time spent in a pause does not count towards
   * the timeout. `pausable: false` is for the few moments that must not be interrupted (an open cell editor).
   */
  const waitFor = async (fn, timeout, what, { pausable = true } = {}) => {
    let end = Date.now() + timeout;
    while (Date.now() < end) {
      if (pausable) {
        const t0 = Date.now();
        await checkpoint();
        end += Date.now() - t0;
      }
      const v = fn();
      if (v) return v;
      await sleep(T.poll);
    }
    throw new Error(`Kutish vaqti tugadi: ${what}`);
  };

  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const parseNumber = (text, decimal) => globalThis.ReceiptMath?.parseNumber(text, decimal) ?? NaN;
  // "1" written into Подбор shows as "1", "1,000" or "1.000" depending on the 1C locale: each reading is >= 1
  const atLeastOne = (text) => parseNumber(text) >= 1 || parseNumber(text, ',') >= 1 || parseNumber(text, '.') >= 1;
  // Receipt inputs deliberately live outside persisted state.
  let receiptReady = false;
  // No markup: prices stay as 1C has them (the inventory price), so the percentage is always 0
  const percentValue = () => 0;
  const validPercent = () => true;
  const validPrice = (i) => Number.isFinite(i.price) && i.price > 0;
  const qtyCap = (i) => Math.floor(i.stock) + (i.placed || 0);
  // Units of one product per receipt: a positive whole number, or 'all' (the whole stock).
  // A smaller stock is always taken whole. Saved state from before this setting means 2.
  function parsePerItem(value) {
    const text = String(value ?? '2').trim();
    if (!text || /^(hammasi|max|all|все)$/i.test(text)) return 'all';
    if (!/^[0-9]+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) <= 0) return null;
    return Number(text);
  }
  const capOf = (perItem) => perItem === 'all' ? Infinity : Number.isSafeInteger(perItem) && perItem > 0 ? perItem : 2;
  const receiptCap = () => capOf(state.plan?.perItem);
  const capText = (perItem) => perItem === 'all' ? 'hammasi (butun qoldiq)' : `ko‘pi bilan ${capOf(perItem)} dona`;
  const validUnits = (n) => Number.isInteger(n) && n >= 1 && n <= receiptCap();
  const resetReceipt = () => {
    receiptReady = false;
    state.plan = null;
    if (typeof el === 'function') el('target').value = '';
  };

  // A receipt into which nothing was transferred yet can be dropped even if its 1C document still needs confirming
  // (e.g. the program was closed and that document no longer exists): the ledger loses nothing
  const nothingTransferred = () => !(state.pendingCodes || []).length && state.items.every(i => i.placed === (i.deducted || 0));
  const clearBlockReason = () => activeTask
      ? 'joriy ish bajarilmoqda'
      : state.inFlight
        ? 'o‘tkazish natijasi noaniq'
        : state.documentNeedsAck && !nothingTransferred()
          ? 'joriy hujjatni tasdiqlash kerak'
          : state.status === 'running'
            ? 'chek ishlamoqda'
            : state.items.some(i => i.placed !== (i.deducted || 0))
              ? 'o‘tkazilgan miqdor hali tasdiqlanmagan'
              : null;

  async function clearReceipt({ warehouse = false } = {}) {
    const blocked = clearBlockReason();
    if (blocked) return log(`Tozalash mumkin emas: ${blocked}. Qotib qolgan bo‘lsa «⛔ To‘liq to‘xtatish» ni bosing.`, 'error');
    resetReceiptState({ warehouse });
    await save();
    render();
    log(warehouse ? 'Ombor ma’lumotlari tozalandi.' : 'Joriy chek tozalandi. Ombor qoldig‘i saqlandi.');
  }

  /** The current receipt back to zero (confirmed quantities stay deducted); with `warehouse` the read stock too. */
  function resetReceiptState({ warehouse = false } = {}) {
    if (state.items.some(i => i.placed > 0 || i.deducted > 0)) {
      snapshotReceipt();
      state.items.forEach(i => globalThis.ReceiptLedger.next(i));
    }

    if (warehouse) {
      state.items = [];
      state.source = null;
      state.seenCodes = {};
      state.usedCodes = {};
    }
    state.plan = null;
    state.log = [];
    state.documentNeedsAck = false;
    state.document = null;
    state.legacyModeBlocked = false;
    state.previousPrefix = null;
    state.phase = 'transfer';
    state.index = 0;
    state.current = null;
    state.receiptTarget = null;
    state.pricingPercent = null;
    state.pricingResult = null;
    state.incomplete = false;
    state.receiptArchived = false;
    state.badCodes = [];
    state.status = 'idle';
    resetReceipt();
  }

  // ⛔ Emergency stop for anything that hangs (Olish, a receipt, an uncertain transfer, a document to
  // confirm): the current receipt goes back to zero and the panel starts over, so «Tozalash»,
  // «Omborni tozalash» and «Olish» work again. Quantities already confirmed as transferred stay
  // deducted (they are in the 1C document); unconfirmed ones are dropped. The read warehouse is kept.
  let abortArmedUntil = 0;
  async function abortAll() {
    if (Date.now() > abortArmedUntil) {
      abortArmedUntil = Date.now() + 5000; // a second click within 5 s confirms
      render();
      setTimeout(() => { if (alive()) render(); }, 5100);
      return;
    }
    abortArmedUntil = 0;
    // First retire this instance: a stuck step that wakes up now stops at its next check and can no
    // longer change or save the state. A fresh instance is loaded below with the clean saved state.
    instance.dispose();
    activeTask = null;
    state.inFlight = null;
    state.documentNeedsAck = false;
    state.pendingCodes = [];
    state.current = null;
    for (const i of state.items) if (i.placed !== (i.deducted || 0)) i.placed = i.deducted || 0;
    try {
      resetReceiptState();
    } catch {
      // a broken ledger must not keep the panel stuck: the receipt is dropped, «Olish» reads afresh
      Object.assign(state, { status: 'idle', phase: 'transfer', index: 0, plan: null, document: null, legacyModeBlocked: false, log: [] });
    }
    state.clock = null;
    state.log.push({ time: new Date().toLocaleTimeString('ru-RU'), level: 'warn',
      text: '⛔ To‘liq to‘xtatildi: joriy amal tugatildi, chek nolga qaytdi. Endi «Olish», «Tozalash» yoki «Omborni tozalash» ishlaydi. 1C da ochiq qolgan «Подбор» oynasini qo‘lda yoping.' });
    // save() refuses once disposed, so the clean state is written directly
    await chrome.storage.local.set({ [STORE_KEY]: JSON.parse(JSON.stringify(state)) });
    chrome.runtime.sendMessage({ type: 'restartContent' }).catch(() => {});
  }

  async function clearUnstarted() {
    return clearReceipt();
  }

  async function clearWarehouse() {
    return clearReceipt({ warehouse: true });
  }

  // ---------------------------------------------------------------------------
  // 1C grid helpers (virtualized: only the visible rows exist in the DOM)
  // ---------------------------------------------------------------------------
  /** Map of header text → colindex for a grid. */
  const gridColumns = (grid) => {
    const map = {};
    grid.querySelectorAll('.gridHead .gridBox[colindex]').forEach((box) => {
      const text = box.textContent.trim();
      if (text && !(text in map)) map[text] = box.getAttribute('colindex');
    });
    return map;
  };

  // Column titles in a Russian and an English 1C interface (platform columns such as the row number
  // follow the interface language; configuration columns may be translated too)
  const COLUMN_NAMES = {
    rowNumber: ['N', '#', '№'],
    item: ['Номенклатура', 'Наименование', 'Nomenclature', 'Item', 'Products', 'Product', 'Goods', 'Name', 'Description'],
    qtyActual: ['Кол-во факт', 'Количество факт', 'Qty actual', 'Actual qty', 'Quantity actual', 'Actual quantity'],
    markingCode: ['Код маркировки', 'Marking code', 'Labeling code', 'Label code'],
    quantity: ['Количество', 'Quantity', 'Qty'],
    price: ['Цена', 'Price'],
    ikpu: ['ИКПУ', 'IKPU', 'МХИК', 'MXIK', 'ИКПУ (МХИК)'],
    lineTotal: ['Всего', 'Total'],
    lineSum: ['Сумма', 'Sum', 'Amount'],
    writeOff: ['Сумма списания', 'Write-off amount'],
    vatSum: ['НДС', 'VAT'],
    vatRate: ['% НДС', 'НДС %', 'VAT %', '% VAT'],
    balance: ['Остаток', 'Остаток на складе', 'Balance', 'Stock', 'In stock'],
  };

  // Headers differ between 1C builds and locales in spacing and punctuation: "Кол-во факт", "Кол-во (факт)",
  // "Количество факт." or a header wrapped onto two lines are the same column
  const headerKey = (text) => String(text).toLowerCase().replace(/ё/g, 'е').replace(/[\s.\-()_:]+/g, '');
  // Last resort when no exact name matches (only for columns that have one unmistakable word)
  const COLUMN_HINTS = { qtyActual: /факт|actual/ };

  /** colindex of the first header that matches one of the column's names (case-insensitive). */
  const colOf = (cols, key) => {
    const wanted = COLUMN_NAMES[key].map(headerKey);
    let hit = Object.keys(cols).find((title) => wanted.includes(headerKey(title)));
    if (hit === undefined && COLUMN_HINTS[key]) hit = Object.keys(cols).find((title) => COLUMN_HINTS[key].test(headerKey(title)));
    return hit === undefined ? undefined : cols[hit];
  };

  const gridRows = (grid) => [...grid.querySelectorAll('.gridBody .gridLine')];

  const cellOf = (row, colindex) => row.querySelector(`.gridBox[colindex="${colindex}"]`);
  const cellText = (row, colindex) => cellOf(row, colindex)?.textContent.trim() || '';

  /**
   * Ustun matni: sarlavha colindex idan keyingi sarlavhagacha bo'lgan barcha kataklar. 1C ba'zan qiymatni yashirin
   * qo'shni katakka chizadi (sarlavhada «ИКПУ» 2, qatorda qiymat 3 da).
   */
  const spanText = (row, cols, colindex) => {
    if (colindex === undefined) return '';
    const next = Math.min(...Object.values(cols).map(Number).filter((n) => n > +colindex), Infinity);
    return [...row.querySelectorAll('.gridBox[colindex]')]
      .filter((b) => +b.getAttribute('colindex') >= +colindex && +b.getAttribute('colindex') < next)
      .map((b) => b.textContent.trim()).filter(Boolean).join(' ');
  };

  const gridBody = (grid) => grid.querySelector('.gridBody') || grid;

  // ---------------------------------------------------------------------------
  // Step 1: capture the inventory table
  // ---------------------------------------------------------------------------
  const findInventoryGrid = () =>
    [...document.querySelectorAll('div.grid[id$="_Товары"]')].find((g) => {
      if (!isVisible(g)) return false;
      const cols = gridColumns(g);
      return colOf(cols, 'item') !== undefined && colOf(cols, 'qtyActual') !== undefined;
    }) || null;

  const inventoryTitle = (grid) => {
    const prefix = formPrefix(grid);
    const header = [...document.querySelectorAll('.openedItem.select .openedItemTitle')].find(isVisible);
    const tab = [...document.querySelectorAll(`[id^="${prefix}_"]`)].find((e) => /^(Товары|Goods|Products|Items)\s*\([\d\s]+\)$/.test(e.textContent.trim()));
    return {
      title: header ? header.textContent.trim() : 'Инвентаризация товаров / Inventory',
      rowCount: tab ? +tab.textContent.trim().match(/\(([\d\s]+)\)/)[1].replace(/\s/g, '') : null,
    };
  };

  // "100" → first 100 rows (a number); "4-20" → rows 4 to 20 ({ from, to }); empty → all rows (null)
  function parseCaptureLimit(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const bad = () => new Error('Qatorlar: musbat butun son (masalan 100) yoki oraliq (masalan 4-20) kiriting yoki bo‘sh qoldiring.');
    const range = text.match(/^([0-9]+)\s*[-–—]\s*([0-9]+)$/);
    if (range) {
      const from = Number(range[1]), to = Number(range[2]);
      if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from <= 0 || to < from) throw bad();
      return { from, to };
    }
    if (!/^[0-9]+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) <= 0) throw bad();
    return Number(text);
  }
  const captureBounds = (limit) => limit === null || limit === undefined ? null
    : typeof limit === 'object' ? { from: limit.from, to: limit.to } : { from: 1, to: limit };

  async function capture() {
    // After a finished receipt the next one starts from a fresh Olish: the finished receipt is archived
    // first (its quantities are already deducted), so «Tozalash» is not needed in between
    if (state.status === 'done' && !activeTask && !state.inFlight && !state.legacyModeBlocked) {
      await clearReceipt();
      if (state.status !== 'idle') return;
    }
    if (state.legacyModeBlocked || activeTask || state.status === 'paused' || state.inFlight || hasProgress()) return log('Avval joriy chekni yakunlang va noaniq o‘tkazishni aniqlang.', 'error');
    const requestedLimit = parseCaptureLimit(el('captureLimit').value);
    state.captureLimit = el('captureLimit').value;
    activeTask = 'capture';
    render();
    try {
      await captureRows(requestedLimit);
    } finally {
      captureProgress = null;
      activeTask = null;
      if (state.status === 'running' || state.status === 'paused') state.status = 'idle';
      save();
      render();
    }
  }

  /** «Olish» while reading: the same button pauses it and resumes it (the loop waits in checkpoint()). */
  function toggleCapturePause() {
    if (activeTask !== 'capture') return;
    if (state.status === 'running') {
      state.status = 'paused';
      log(`Olish pauzaga olindi: ${captureProgress?.read ?? 0} qator o‘qildi.`, 'warn');
    } else if (state.status === 'paused') {
      state.status = 'running';
      log('Olish davom etmoqda.');
    }
    save();
    render();
  }

  async function captureRows(requestedLimit = null) {
    if (typeof globalThis.ReceiptMath?.parseNumber !== 'function' || typeof globalThis.ReceiptLedger?.normalizeItem !== 'function') {
      throw new Error('Hisoblash moduli yuklanmagan. Kengaytmani Reload qilib, 1C sahifasini yangilang.');
    }
    resetReceipt();
    const grid = findInventoryGrid();
    if (!grid) {
      log('Инвентаризация товаров hujjatini oching (Товары jadvali ko‘rinib tursin).', 'error');
      return;
    }
    const cols = gridColumns(grid);
    // Row-number column: "N" in a Russian 1C interface, "#" in English; else the first column
    const colN = colOf(cols, 'rowNumber') ?? grid.querySelector('.gridHead .gridBox[colindex]')?.getAttribute('colindex');
    const colName = colOf(cols, 'item');
    const colQty = colOf(cols, 'qtyActual');
    const colPrice = colOf(cols, 'price');
    const { title, rowCount } = inventoryTitle(grid);
    const bounds = captureBounds(requestedLimit);
    if (bounds && rowCount && bounds.from > rowCount) {
      throw new Error(`Jadvalda ${rowCount} qator bor, ${bounds.from}-qatordan boshlab bo‘lmaydi.`);
    }
    state.status = 'running';
    startClock('capture');
    log(`Olish boshlandi:${title}${rowCount ? ` (${rowCount} qator)` : ''}${bounds ? ` • ${bounds.from}–${bounds.to}-qatorlar` : ''}`);

    const totalExpected = bounds
      ? Math.max(0, Math.min(rowCount || bounds.to, bounds.to) - bounds.from + 1)
      : rowCount || null;
    captureProgress = { read: 0, total: totalExpected || null };
    const rows = new Map(); // N → { name, qty, price } as text: numbers are read once the whole column is known
    const collect = () => {
      let added = 0;
      for (const line of gridRows(grid)) {
        // "1 000" from row 1000 on: group separators must not turn it into row 1
        const n = parseInt(cellText(line, colN).replace(/[\s\u00a0\u202f,.]/g, ''), 10);
        const name = cellText(line, colName);
        if (!n || !name || (bounds && (n < bounds.from || n > bounds.to)) || rows.has(n)) continue;
        rows.set(n, { name, qty: cellText(line, colQty), price: colPrice !== undefined ? cellText(line, colPrice) : '' });
        added++;
      }
      if (captureProgress) captureProgress.read = rows.size;
      return added;
    };

    try {
      // Select a row by its "N" cell (never opens an editor), then page through the virtual table:
      // Full capture: PageDown to the end, PageUp back to the start. Rows are keyed by N, so the starting
      // position does not matter (Ctrl+Home is not reliable on every keyboard layout).
      const firstLine = gridRows(grid)[0];
      if (!firstLine) throw new Error('Товары jadvali bo‘sh');
      const focusInGrid = () => !!grid.querySelector('.gridBody .gridBox.focus') && grid.contains(document.activeElement);
      // Inventarizatsiya endigina provesti qilingan bo'lsa 1C bir oz band: birinchi bosish yutilishi mumkin — bir necha marta
      for (let attempt = 0; attempt < 5 && (attempt === 0 || !focusInGrid()); attempt++) {
        const line = gridRows(grid)[0] || firstLine;
        await realClick(cellOf(line, colN) || line);
        await sleep(T.afterClick + attempt * 400);
      }
      if (!focusInGrid()) throw new Error('Jadval tanlanmadi — brauzer masshtabi 100% ekanini tekshiring (Ctrl+0) va «Olish» ni qayta bosing');
      const targetCount = !bounds ? rowCount : rowCount ? Math.min(rowCount, bounds.to) : bounds.to;
      const complete = () => {
        if (!bounds) return !!rowCount && rows.size >= rowCount;
        if (!targetCount || rows.size < targetCount - bounds.from + 1) return false;
        for (let n = bounds.from; n <= targetCount; n++) if (!rows.has(n)) return false;
        return true;
      };
      const viewport = () => gridRows(grid).map(line => cellText(line, colN)).join(',');
      // After a pause (or when 1C takes the focus for a moment) the cursor may be elsewhere:
      // click the table's current cell (or the first row) again. Rows are keyed by N, so any row will do.
      const restoreCursor = async () => {
        const cell = grid.querySelector('.gridBody .gridBox.focus') || cellOf(gridRows(grid)[0], colN);
        if (!cell) throw new Error('Jadval topilmadi — «Olish» ni qayta bosing');
        await realClick(cell);
        await sleep(T.afterClick);
        if (!focusInGrid()) throw new Error('Jadvalni tanlab bo‘lmadi — «Olish» ni qayta bosing');
        log('Kursor jadvalga qaytarildi.');
      };
      const ensureCursor = async () => {
        if (!focusInGrid()) await restoreCursor();
      };
      // The edge of the virtual table is where the viewport stops moving. 1C redraws after a server
      // round trip, so an unchanged viewport gets extra time before it counts as the edge.
      const moved = async (previous) => {
        for (let wait = 0; wait < 3; wait++) {
          if (viewport() !== previous) return true;
          await sleep(T.afterScroll);
        }
        return viewport() !== previous;
      };
      // Limited capture must first reach the top, even when many pages are outside N.
      // Movement, rather than eligible additions, detects the edge of a virtual table.
      if (bounds) {
        let idle = 0;
        while (idle < 3 && !gridRows(grid).some(line => Number(cellText(line, colN)) === 1)) {
          await checkpoint();
          await ensureCursor();
          const previous = viewport();
          await cdp({ type: 'key', key: 'PageUp' });
          await sleep(T.afterScroll);
          idle = (await moved(previous)) ? 0 : idle + 1;
        }
        if (!gridRows(grid).some(line => Number(cellText(line, colN)) === 1)) {
          throw new Error('Jadval boshiga o‘tib bo‘lmadi — birinchi qator ko‘rinmayapti. «Olish» ni qayta bosing.');
        }
      }
      collect();
      // Full capture: down to the end, then back up to the very top. Going back passes rows that are
      // already read, so "no new rows" must not stop it — only a viewport that no longer moves does.
      // Qator soni noma'lum bo'lsa (yorliqda «Товары (N)» yo'q) pastga oxirigacha tushilgach hammasi o'qilganini bilmaymiz — lekin
      // 1, 2, 3 … max qatorlar uzluksiz o'qilgan bo'lsa (boshidan boshlangan), yuqoriga qaytish kerak emas
      const readFromTop = () => {
        if (!rows.has(1)) return false;
        let max = 0;
        for (const n of rows.keys()) if (n > max) max = n;
        return rows.size === max;
      };
      for (const key of !bounds ? ['PageDown', 'PageUp'] : ['PageDown']) {
        if (key === 'PageUp' && !rowCount && readFromTop()) {
          log(`Jadval 1-qatordan boshlab o‘qildi (${rows.size} qator) — yuqoriga qaytish kerak emas.`, 'info');
          continue;
        }
        let idle = 0;
        while (idle < 3 && !complete()) {
          await checkpoint();
          await ensureCursor();
          const previous = viewport();
          await cdp({ type: 'key', key });
          await sleep(T.afterScroll);
          idle = (await moved(previous)) ? 0 : idle + 1;
          collect();
          render(`O‘qilmoqda: ${rows.size}${rowCount ? ` / ${rowCount}` : ''} qator`);
        }
      }
    } catch (e) {
      if (e instanceof StopError) {
        log('Olish to‘xtatildi.', 'warn');
        state.status = 'idle';
        save();
        render();
        return;
      }
      state.status = 'idle';
      save();
      throw e;
    }

    // 1C prints numbers in the user's locale ("5,000" is 5 in a Russian 1C, 5000 in an English one):
    // the separator is told by the whole column, the other column breaking a tie
    const detect = (values) => globalThis.ReceiptMath?.detectDecimal?.(values) || '';
    const qtyDecimal = detect([...rows.values()].map((r) => r.qty));
    const priceDecimal = detect([...rows.values()].map((r) => r.price));
    const loose = (text, decimal) => (globalThis.ReceiptMath.parseLoose || parseNumber)(text, decimal);
    const rawQty = new Map();
    for (const [n, r] of rows) {
      rawQty.set(n, r.qty);
      r.qty = loose(r.qty, qtyDecimal || priceDecimal);
      r.price = r.price === '' ? NaN : loose(r.price, priceDecimal || qtyDecimal);
    }

    // Same nomenclature on several rows → one item with the summed quantity.
    // A malformed quantity belongs to one source row; it must not discard the
    // rest of the inventory capture.
    const byName = new Map();
    let invalidQtyCount = 0;
    for (const [n, r] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      if (!Number.isFinite(r.qty) || r.qty < 0) {
        invalidQtyCount++;
        // The raw text with its character codes shows what this browser's 1C really printed
        if (invalidQtyCount <= 5) log(`⚠ ${r.name}: miqdor o‘qilmadi (${n}-qator, matn: ${JSON.stringify(rawQty.get(n))}), tovar tashlab ketildi.`, 'warn');
        continue;
      }
      if (r.qty === 0) continue;
      const key = norm(r.name);
      const item = byName.get(key) || { name: r.name, stock: 0, amount: 0, qty: 0, price: 0, sourceRows: [], rowNumbers: [], placed: 0, status: 'pending', note: '' };
      item.stock += r.qty; // available in the inventory
      item.amount += r.qty * r.price;
      item.rowNumbers.push(n);
      item.sourceRows.push({ row: n, price: Number.isFinite(r.price) ? r.price : null, qty: r.qty });
      byName.set(key, item);
    }
    if (!byName.size && invalidQtyCount) {
      const sample = [...rawQty.values()].slice(0, 3).map((t) => JSON.stringify(t) + ' [' + [...String(t)].map((c) => c.charCodeAt(0).toString(16)).join(' ') + ']').join('; ');
      throw new Error(`Yaroqli miqdorli tovar topilmadi. Miqdor ustuni o‘qilgan matnlar: ${sample || 'bo‘sh'}. Shu qatorni dasturchiga yuboring.`);
    }
    if (invalidQtyCount) log(`${invalidQtyCount} ta qator miqdori noto‘g‘ri bo‘lgani uchun tashlab ketildi.`, 'warn');
    // qty = how many to sell: everything, until a sum plan says otherwise; price = average over the rows
    state.items = [...byName.values()].map(({ amount, ...i }) => globalThis.ReceiptLedger.normalizeItem({ ...i, qty: i.stock, price: i.stock ? amount / i.stock : 0 }));
    if (state.items.some(i => i.rowNumbers.length > 1)) log('Bir xil nomlar birlashtirildi: narx miqdor bo‘yicha o‘rtacha hisoblangan.', 'warn');
    state.plan = null;
    state.index = 0;
    state.document = null;
    state.source = { title, warehouse: document.getElementById(`${formPrefix(grid)}_Склад_i0`)?.value?.trim() || '', rowCount: rows.size, requestedLimit: bounds ? bounds.to : null, requestedFrom: bounds && bounds.from > 1 ? bounds.from : null, totalRowCount: rowCount, capturedAt: new Date().toLocaleString('ru-RU') };
    state.status = 'idle';
    const units = state.items.reduce((a, i) => a + i.qty, 0);
    const expectedRows = (bounds ? Math.min(rowCount || bounds.to, bounds.to) - bounds.from + 1 : rowCount);
    if (rowCount && rows.size < expectedRows) log(`Diqqat: ${expectedRows} qatordan ${rows.size} tasi o‘qildi.`, 'warn');
    log(`Saqlandi: ${rows.size} qator → ${state.items.length} xil tovar, jami ${units} dona.`, 'ok');
  }

  // ---------------------------------------------------------------------------
  // Sum plan: how many of each item to sell so the total is closest to a target amount
  // ---------------------------------------------------------------------------
  const round2 = (n) => Math.round(n * 100) / 100;

  const hasProgress = () => state.items.some((i) => i.placed > 0);

  function applyPlan(target) {
    if (state.inFlight) return log('Avval o‘tkazish natijasini tasdiqlang.', 'error');
    if (!state.items.length) return log('Avval Инвентаризация hujjatida «Olish» ni bosing.', 'error');
    if (hasProgress()) return log('Joriy chek boshlangan. Uni davom ettirib yakunlang.', 'error');
    receiptReady = false;
    state.plan = null;
    if (!Number.isFinite(target) || !(target > 0)) return log('Summani kiriting (masalan: 150000000).', 'error');
    if (!state.items.some((i) => validPrice(i))) return log('Инвентаризация jadvalida «Цена» topilmadi — qayta «Olish» qiling.', 'error');
    const perItem = parsePerItem(state.perItemLimit);
    if (perItem === null) return log('Bir tovardan: musbat butun son kiriting yoki hammasini olish uchun bo‘sh qoldiring.', 'error');
    let result;
    try { result = globalThis.ReceiptPair.plan(state.items, target, percentValue(), capOf(perItem)); }
    catch (e) { receiptReady = false; return log(e.message, 'error'); }
    const { qty, total } = result;
    receiptReady = false;
    state.items.forEach((i, n) => {
      i.qty = qty[n];
      i.status = qty[n] > 0 ? 'pending' : 'skip';
      i.note = '';
    });
    state.index = 0;
    state.plan = { target, total, minTotal: result.minFeasibleTotal, maxTotal: result.maxFeasibleTotal, perItem };
    prepareReceipt();
    const count = qty.filter((q) => q > 0).length;
    const diff = round2(total - target);
    if (state.items.every((i, n) => !(i.price > 0) || qty[n] === i.stock) && total < target) {
      log(`Diqqat: Инвентаризацияdagi hamma tovarlar jami ${fmtSum(total)} — kiritilgan summadan kam.`, 'warn');
    }
    log(`Reja: ${count} xil tovar, ${qty.reduce((a, b) => a + b, 0)} dona, jami ${fmtSum(total)} (maqsad ${fmtSum(target)}, farq ${diff >= 0 ? '+' : ''}${fmtSum(diff)}).`, 'ok');
    if (Number.isFinite(result.minFeasibleTotal) && Number.isFinite(result.maxFeasibleTotal) &&
        (target < result.minFeasibleTotal || target > result.maxFeasibleTotal)) {
      log(`Maqsad ${fmtSum(target)} mumkin bo‘lgan ${fmtSum(result.minFeasibleTotal)}–${fmtSum(result.maxFeasibleTotal)} oralig‘idan tashqarida; eng yaqin mumkin summa ${fmtSum(total)}, farq ${fmtSum(diff)}.`, 'warn');
    }
  }

  function applyAllPlan() {
    if (state.inFlight) return log('Avval o‘tkazish natijasini tasdiqlang.', 'error');
    if (!state.items.length) return log('Avval Инвентаризация hujjatida «Olish» ni bosing.', 'error');
    if (hasProgress()) return log('Joriy chek boshlangan. Uni davom ettirib yakunlang.', 'error');
    receiptReady = false;
    state.plan = null;
    if (!validPercent()) return log('Har yangi chek uchun ustama foizini kiriting (0 ham mumkin).', 'error');
    const perItem = parsePerItem(state.perItemLimit);
    if (perItem === null) return log('Bir tovardan: musbat butun son kiriting yoki hammasini olish uchun bo‘sh qoldiring.', 'error');

    state.items.forEach((item) => {
      const qty = validPrice(item) ? Math.min(capOf(perItem), Math.floor(item.stock)) : 0;
      item.qty = qty;
      item.status = qty > 0 ? 'pending' : 'skip';
      item.note = qty ? '' : (!validPrice(item) ? 'Narxi yo‘q yoki noto‘g‘ri.' : 'Qoldiq yo‘q.');
    });
    const selected = state.items.filter((item) => item.qty > 0);
    if (!selected.length) return log('Qo‘shish uchun narxi va qoldig‘i bor tovar topilmadi.', 'error');
    const total = round2(selected.reduce((sum, item) => sum + globalThis.ReceiptMath.lineTotals(item, percentValue()).total, 0));
    state.index = 0;
    state.receiptTarget = null;
    if (typeof el === 'function') el('target').value = '';
    state.plan = { target: null, total, minTotal: total, maxTotal: total, all: true, perItem };
    prepareReceipt();
    log(`Barcha mahsulotlar: ${selected.length} xil tovar, ${selected.reduce((sum, item) => sum + item.qty, 0)} dona, jami ${fmtSum(total)}.`, 'ok');
  }

  function prepareReceipt() {
    if (state.legacyModeBlocked) return log('Eski markirovkasiz chek davom ettirilmaydi. Noaniq o‘tkazish bo‘lsa avval natijasini tasdiqlang; so‘ng yangi bo‘sh Реализация hujjatini ochib «Yangi chekni boshlash» ni bosing.', 'error');
    receiptReady = false;
    if (!state.items.length || !validPercent()) return log('Tovarlar va yangi chek uchun ustama foizini kiriting.', 'error');
    const selected = state.items.filter(i => i.qty > 0);
    const selectedNames = new Set(selected.map(i => norm(String(i.name || '').normalize('NFKC'))));
    if (!selected.length || selected.some(i => !validUnits(i.qty)) || selectedNames.size !== selected.length) return log(`Har chekda kamida 1 xil tovar bo‘lsin; har bir tovardan ${capText(state.plan?.perItem)}, turlar soni cheklanmagan.`, 'error');
    if (selected.some(i => !validPrice(i))) return log('Narxi yo‘q/noto‘g‘ri tovar bor — chek tayyorlanmadi.', 'error');
    if (state.items.some(i => !Number.isFinite(i.stock) || !Number.isFinite(i.qty) || i.qty < 0 || i.qty < (i.placed || 0) || i.qty > qtyCap(i) || !Number.isInteger(i.qty))) return log(`Har bir tovardan ${capText(state.plan?.perItem)} olinsin va mavjud qoldiqdan oshmasin.`, 'error');
    if (selected.some(i => !Number.isFinite(globalThis.ReceiptMath.lineTotals(i, percentValue()).total))) return log('Hisoblash chegarasidan oshdi.', 'error');
    receiptReady = true;
    log('Chek lokal tayyorlandi. 1C hujjatiga yozilmadi.', 'ok');
  }

  const fmtSum = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

  // ---------------------------------------------------------------------------
  // Step 2: process one item in Реализация → Подбор
  // ---------------------------------------------------------------------------
  // Recipe verified on the 1C web client:
  //   • Подбор button and the marking checkbox react to plain DOM clicks
  //   • "Найти" needs the text typed key by key (trusted keypress), then Enter
  //   • a grid cell is chosen by clicking a row and moving with →; Enter opens the editor,
  //     "1" + Enter writes it, ↓ goes to the next marking code (the grid scrolls by itself)
  //   • Escape closes the whole Подбор window, so it is never used; the × button is
  const podborCheckbox = () => bySuffix('_ПоОстаткамРасширенныйКодыМаркировки');
  const markingGrid = () => bySuffix('_СписокНоменклатурыРасширенныйКодыМаркировки', 'div');
  const searchInput = () => bySuffix('_СтрокаПоиска_i0', 'input');

  // MXIK Qidiruv (soliq.uz) checks the last operation on my.soliq.uz. Results
  // are cached for this run because a code can be encountered again after a
  // pause or when a document is resumed.
  // Fixed by the "key" in MXIK's manifest.json, so it is the same on every computer and folder
  const MXIK_EXTENSION_ID = 'miockbfbngeadklmkfmcjicjlcnjlpof';
  const markingVerdictCache = new Map();
  async function checkMarkingCode(code) {
    const value = String(code || '').replace(/[\x00-\x1f\x1d\s]/g, '');
    if (!value) return { verdict: 'unknown', reason: 'kod bo‘sh' };
    const stir = String(state.stir || '').replace(/\D/g, '');
    const key = `${stir}|${value}`;
    if (markingVerdictCache.has(key)) return markingVerdictCache.get(key);
    const promise = new Promise((resolve) => {
      let settled = false;
      const finish = result => { if (!settled) { settled = true; resolve(result); } };
      try {
        chrome.runtime.sendMessage(MXIK_EXTENSION_ID, { type: 'mxik-check-marking', code: value, stir }, response => {
          const error = chrome.runtime.lastError;
          if (error) return finish({ verdict: 'unknown', reason: error.message });
          if (!response?.ok) return finish({ verdict: 'unknown', reason: response?.error || 'MXIK javob bermadi' });
          finish({ verdict: response.verdict || 'unknown', operation: response.operation || '', reason: response.reason || '',
            notLoggedIn: !!response.notLoggedIn, notFound: !!response.notFound,
            lastStir: response.lastStir || '', stirMatch: response.stirMatch ?? null,
            product: response.history?.product || '', mxik: ikpuDigits(response.history?.mxik),
            steps: response.history?.steps?.length || 0, last: response.history?.last || null });
        });
      } catch (error) {
        finish({ verdict: 'unknown', reason: String(error?.message || error) });
      }
      setTimeout(() => finish({ verdict: 'unknown', reason: 'MXIK tekshiruvi vaqti tugadi' }), 45000);
    });
    markingVerdictCache.set(key, promise);
    const result = await promise;
    if (result.verdict === 'unknown') markingVerdictCache.delete(key);
    return result;
  }

  /** Remembers which product and place in the Подбор list a marking code belongs to (for the manual check). */
  function rememberCode(item, code, position) {
    if (!state.seenCodes || typeof state.seenCodes !== 'object') state.seenCodes = {};
    delete state.seenCodes[code]; // newest last
    state.seenCodes[code] = { name: item.name, rows: [...(item.rowNumbers || [])], position };
    const codes = Object.keys(state.seenCodes);
    for (const old of codes.slice(0, Math.max(0, codes.length - 5000))) delete state.seenCodes[old];
  }

  // Manual check in the panel: soliq.uz verdict and product, and where 1C showed the code
  let checkResults = []; // newest first; kept only while the page is open
  let checking = false;
  const cleanMarkingCode = (code) => String(code || '').replace(/[\x00-\x1f\x1d]/g, '');
  const checkBusyReason = () => activeTask === 'run' && state.status === 'running'
    ? 'chek ishlayapti — soliq.uz sahifasi band. Avval «Pauza» bosing.' : null;
  async function checkCodesManually() {
    if (checking) return;
    const busy = checkBusyReason();
    if (busy) return log(`Markirovkani tekshirib bo‘lmaydi: ${busy}`, 'error');
    const codes = String(el('checkCode').value || '').split(/[\s,;]+/).map(cleanMarkingCode).filter(Boolean);
    if (!codes.length) return log('Tekshirish uchun markirovka kodini kiriting.', 'error');
    checking = true;
    render();
    try {
      for (const code of [...new Set(codes)].slice(0, 50)) {
        const entry = { code, pending: true };
        checkResults = [entry, ...checkResults.filter((r) => r.code !== code)].slice(0, 50);
        render();
        Object.assign(entry, await checkMarkingCode(code), { pending: false });
        render();
      }
      el('checkCode').value = '';
    } finally {
      checking = false;
      render();
    }
  }

  /** Remembers a skipped marking code: the product, its inventory rows and the code's place in the Подбор list. */
  function noteBadCode(item, code, position, reason) {
    if (!Array.isArray(state.badCodes)) state.badCodes = [];
    const known = state.badCodes.find((b) => b.code === code);
    if (known) return Object.assign(known, { position, reason });
    state.badCodes.push({ name: item.name, rows: [...(item.rowNumbers || [])], position, code, reason,
      time: new Date().toLocaleTimeString('ru-RU') });
    if (state.badCodes.length > 500) state.badCodes.splice(0, state.badCodes.length - 500);
  }

  const stirDigits = () => String(state.stir || '').replace(/\D/g, '');

  /** 17 xonali IKPU (MXIK): matndagi birinchi 17 ta ketma-ket raqam («08516999043000000, Сув …» → «08516999043000000»). */
  const ikpuDigits = (text) => String(text ?? '').match(/\d{17}/)?.[0] || '';

  /**
   * Tovarning to'g'ri IKPU si: 1C hujjatining «ИКПУ» ustunidan o'rganilgani (doimiy saqlanadi); hali noma'lum bo'lsa —
   * shu chekda shu tovarning birinchi yaroqli kodining MXIK i (o'tkazishdan keyin 1C dagisi bilan solishtiriladi).
   */
  const expectedIkpu = (item) => state.ikpuByName?.[norm(item.name)] || state.ikpuGuess?.[norm(item.name)] || '';

  /**
   * Ochiq Реализация hujjatining «ИКПУ» ustunidan «tovar → IKPU» ni o'rganadi. Taxmin qilingan IKPU 1C dagidan farq qilsa —
   * shu tovar kodlari noto'g'ri IKPU bilan olingan bo'lishi mumkin: ogohlantiriladi.
   */
  function learnIkpu(prefix) {
    const grid = prefix && document.getElementById(`${prefix}_Товары`);
    if (!grid) return;
    const cols = gridColumns(grid);
    const colName = colOf(cols, 'item');
    const colIkpu = colOf(cols, 'ikpu');
    if (colName === undefined || colIkpu === undefined) return;
    if (!state.ikpuByName || typeof state.ikpuByName !== 'object') state.ikpuByName = {};
    for (const line of gridRows(grid)) {
      const key = norm(cellText(line, colName));
      const ikpu = ikpuDigits(spanText(line, cols, colIkpu));
      if (!key || !ikpu) continue;
      const guess = state.ikpuGuess?.[key];
      if (guess && guess !== ikpu) log(`TEKSHIRING: «${cellText(line, colName)}» kodlari IKPU ${guess} bo‘yicha olingan, 1C da tovar IKPU si ${ikpu}.`, 'error');
      if (state.ikpuGuess) delete state.ikpuGuess[key];
      state.ikpuByName[key] = ikpu;
    }
  }

  /**
   * A definitive refusal (sold at retail, or the last receiver is another STIR) is kept for good together with
   * the product name: when the same code shows up again it is skipped at once, without asking soliq.uz.
   * A check that merely failed (no answer, not logged in) is never stored.
   */
  function rememberBadDb(item, code, reason, checked) {
    if (!state.badDb || typeof state.badDb !== 'object' || Array.isArray(state.badDb)) state.badDb = {};
    state.badDb[code] = { name: item.name, product: checked?.product || '', reason, stir: stirDigits(),
      time: new Date().toLocaleString('ru-RU'), seen: 1 };
    const keys = Object.keys(state.badDb);
    for (const old of keys.slice(0, Math.max(0, keys.length - 20000))) delete state.badDb[old];
  }

  /** The stored refusal for a code, valid only for the STIR it was made for (a different STIR asks soliq.uz again). */
  function knownBadCode(code) {
    const known = state.badDb && typeof state.badDb === 'object' ? state.badDb[code] : null;
    return known && (known.stir ?? '') === stirDigits() ? known : null;
  }

  /** Подбор button of the visible Реализация form (the one that has the "Товар маркирован" checkbox). */
  const salesPodborButton = () =>
    [...document.querySelectorAll('a[id$="_ТоварыПодборТовары"]')].find(
      (a) => isVisible(a) && document.getElementById(`${formPrefix(a)}_ЕстьМаркировка`)
    ) || null;

  /** Stops the run instead of typing into the wrong place (e.g. a field of the document itself). */
  const assertFocus = (ok, where) => {
    if (!ok(document.activeElement)) throw new Error(`Kursor kutilgan joyda emas (${where}) — xavfsizlik uchun to‘xtatildi`);
  };
  const focusInMarkingGrid = (el) => !!el && !!markingGrid()?.contains(el);

  /** The Подбор form is on screen (its title) even if its marking checkbox has not been drawn yet. */
  const podborFormVisible = () =>
    [...document.querySelectorAll('div,span')].some((e) => e.children.length === 0 && isVisible(e) && /^Подбор номенклатуры/.test(e.textContent.trim()));

  /** The question / error dialog 1C shows over the page: its text and button labels (null when there is none). */
  const oneCDialog = () => {
    const messages = [...document.querySelectorAll('[id$="_Message"]')].filter(isVisible);
    if (!messages.length) return null;
    const text = String(messages[messages.length - 1].textContent || '').replace(/\s+/g, ' ').trim();
    const buttons = [...document.querySelectorAll('.pressButton')].filter(isVisible).map((b) => b.textContent.trim()).filter(Boolean);
    return { text, buttons };
  };

  /** What the screen shows right now: shown in the timeout error so a stuck run can be understood from the log alone. */
  const screenReport = () => {
    const tab = document.querySelector('#openedCell_cont .openedItem.select')?.textContent?.trim() || '?';
    const button = salesPodborButton();
    const dialog = oneCDialog();
    // Dialog matni topilmasa ham: 1C ning modal qatlami, ko'rinib turgan formalar va 1C xabarlar oynasidagi oxirgi xatolar
    // (1C ko'pincha xatoni dialogda emas, shu xabarlar oynasida yozadi: «Не заполнено поле …»)
    const surface = [...document.querySelectorAll('[id^="modalSurface"]')].some(isVisible);
    const forms = [...new Set([...document.querySelectorAll('[id^="form"]')].filter(isVisible).map((e) => formPrefix(e)).filter(Boolean))].join(',');
    const messages = [...document.querySelectorAll('[id^="msg"].gridLine')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(-3);
    return `tab «${tab.slice(0, 50)}», Подбор tugmasi ${button ? 'bor' : 'yo‘q'}, oyna ${podborFormVisible() ? 'chizilgan' : 'yo‘q'}, formalar: ${forms || '—'}` +
      (dialog ? `, 1C dialogi: «${dialog.text.slice(0, 300)}» [${dialog.buttons.join(' | ')}]` : surface ? ', 1C modal qatlami ochiq' : '') +
      (messages.length ? `, 1C xabarlari: «${messages.join('» «').slice(0, 400)}»` : '');
  };

  /**
   * 1C asked to write the new document before it opens Подбор («Данные еще не записаны … записать?»). Writing the draft is
   * part of the normal flow: «Да» is pressed, 1C re-opens the form under a new prefix (same number and date) and the run
   * follows it. Any other dialog is not guessed at: the run stops and shows its text.
   */
  async function answerPodborDialog() {
    const dialog = oneCDialog();
    if (!dialog) return false;
    const isWrite = /записа|не записан|запис/i.test(dialog.text) && !/провед|удал|закры/i.test(dialog.text);
    const yes = isWrite ? [...document.querySelectorAll('.pressButton')].filter(isVisible).find((b) => /^(Да|Записать|Yes)$/i.test(b.textContent.trim())) : null;
    if (!yes) throw docError(`1C dialogi ochiq: «${dialog.text.slice(0, 300)}» [${dialog.buttons.join(' | ')}] — dialogga o‘zingiz javob bering va «Davom» ni bosing.`);
    log(`1C so‘radi: «${dialog.text.slice(0, 200)}» — «${yes.textContent.trim()}» bosildi (hujjat qoralama sifatida yoziladi).`, 'info');
    const before = state.document?.prefix;
    await realClick(yes);
    // 1C hujjatni yozib, formani qayta ochadi (yangi prefiks): raqam va sana o'sha bo'lsa — shu hujjat; umumiy tekshiruvsiz kutiladi
    await waitFor(() => !oneCDialog() && salesPodborButton(), 30000, 'hujjat yozilishi', { pausable: false });
    const now = formPrefix(salesPodborButton());
    if (state.document && now && now !== before) {
      const id = documentIdentity(now);
      if (id.number === state.document.number && id.date === state.document.date) state.document = id;
      else throw docError('Joriy chek uchun tanlangan hujjat o‘zgardi.');
      log(`Hujjat yozildi, forma qayta ochildi (${before} → ${now}) — shu hujjatda davom etilmoqda.`, 'info');
      await save();
    }
    return true;
  }

  /**
   * Opens Подбор. A click that 1C swallows (right after a tab switch or while the page is busy) used to cost the whole product:
   * the click is repeated (the second and third one trusted) as long as no Подбор form is on screen, so two forms never open.
   */
  async function openPodbor() {
    if (podborCheckbox()) return;
    // Sekin 1C da Подбор oynasi 20–40 soniyada ochilishi mumkin (ombor qoldig'i yuklanadi): shu paytda qayta bosish ikkinchi oyna
    // ochib yuborardi. Shuning uchun birinchi bosishdan keyin uzoq kutiladi; ochilmasa — haqiqiy bosish bilan bir marta takrorlanadi
    for (let attempt = 1; attempt <= 2; attempt++) {
      await answerPodborDialog(); // oldingi bosishdan qolgan 1C savoli bo'lsa — javob beriladi yoki ish to'xtaydi
      const btn = await waitFor(salesPodborButton, 8000, 'Реализация hujjatidagi «Подбор» tugmasi');
      if (!podborFormVisible()) { if (attempt === 1) domClick(btn); else await realClick(btn); }
      if (attempt > 1) log(`«Подбор» ochilmadi — ${attempt}-urinish (${screenReport()}).`, 'warn');
      try {
        await waitFor(() => podborCheckbox() || oneCDialog(), attempt === 1 ? 25000 : 60000, '«Подбор» oynasi');
        if (podborCheckbox()) return;
        // Bosishdan keyin 1C savol berdi (hujjatni yozish): javob beriladi va Подбор qayta ochiladi
        await answerPodborDialog();
        await waitFor(podborCheckbox, 60000, '«Подбор» oynasi');
        return;
      } catch (e) {
        if (e?.document || attempt === 2) throw e?.document ? e : new Error(`${e.message} (${screenReport()})`);
      }
    }
  }

  async function enableMarkingMode() {
    // 1C replaces controls while rendering. Reacquire on every poll and never
    // repeat a dispatched click: a delayed response could otherwise toggle off.
    let clicked = false;
    await waitFor(() => {
      const cb = podborCheckbox();
      if (!cb || cb.isConnected === false) return false;
      if (cb.classList.contains('select')) {
        const grid = markingGrid();
        const input = searchInput();
        const prefix = formPrefix(cb);
        return grid && input && grid.isConnected !== false && input.isConnected !== false &&
          formPrefix(grid) === prefix && formPrefix(input) === prefix && grid;
      }
      if (!clicked && !cb.disabled && cb.getAttribute('aria-disabled') !== 'true' &&
          !cb.classList.contains('disabled')) {
        clicked = true;
        domClick(cb);
      }
      return false;
    }, T.openForm, 'markirovka kodlari jadvali va «Найти» maydoni');
  }

  const rowsOfItem = (grid, cols, item) =>
    gridRows(grid).filter((l) => norm(cellText(l, colOf(cols, 'item'))) === norm(item.name));

  /** Types the item name into "Найти". After a pause the user may have clicked elsewhere: then start over. */
  async function typeSearch(name) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const startedAt = resumeCount;
      const input = await waitFor(searchInput, 5000, '«Найти» maydoni');
      await realClick(input);
      await sleep(T.afterClick);
      assertFocus((el) => el === searchInput(), '«Найти» maydoni');
      await cdp({ type: 'selectAll', mac: IS_MAC });
      await cdp({ type: 'key', key: 'Backspace' });
      // Type in chunks and re-check the focus between them
      let interrupted = false;
      for (let i = 0; i < name.length; i += 12) {
        await checkpoint();
        if (resumeCount !== startedAt) {
          interrupted = true;
          break;
        }
        assertFocus((el) => el === searchInput(), '«Найти» maydoni');
        await cdp({ type: 'text', text: name.slice(i, i + 12) });
      }
      if (interrupted) {
        log('Pauzadan keyin «Найти» ga nom qaytadan yozilmoqda.');
        continue;
      }
      await sleep(T.afterType);
      if (norm(searchInput()?.value) !== norm(name)) {
        throw new Error(`«Найти» ga noto‘g‘ri yozildi: «${searchInput()?.value}»`);
      }
      return;
    }
    throw new Error('«Найти» ga nomni yozib bo‘lmadi');
  }

  async function searchItem(item, gridFn = markingGrid) {
    await typeSearch(item.name);
    await cdp({ type: 'key', key: 'Enter' });

    // Done when the list shows only this item (or nothing at all)
    const grid = await waitFor(gridFn, 5000, 'Подбор ro‘yxati');
    const cols = gridColumns(grid);
    await sleep(T.afterClick);
    await waitFor(
      () => {
        const lines = gridRows(grid).filter((l) => cellText(l, colOf(cols, 'item')));
        // 1C searches by the start of the name: once every row starts with it, the filter is applied
        return lines.length === 0 || lines.every((l) => norm(cellText(l, colOf(cols, 'item'))).startsWith(norm(item.name)));
      },
      T.search,
      `«${item.name}» bo‘yicha qidiruv natijasi`
    );
    await sleep(T.afterClick);
  }

  /** Row (gridLine) that holds the grid's focused cell, and that cell's column. */
  const focusedCell = (grid) => {
    const box = grid.querySelector('.gridBody .gridBox.focus');
    return box ? { line: box.closest('.gridLine'), col: box.getAttribute('colindex') } : null;
  };

  /** Puts 1 into "Количество" for `need` marking codes, going down the list with the keyboard. */
  async function fillQuantities(item, need) {
    const grid = markingGrid();
    const cols = gridColumns(grid);
    const colCode = colOf(cols, 'markingCode');
    const colQty = colOf(cols, 'quantity');
    if (!colCode || !colQty) throw new Error('«Код маркировки» yoki «Количество» ustuni topilmadi');

    const first = rowsOfItem(grid, cols, item)[0];
    if (!first) return 0;

    // Focus the first row, then walk right/left to the "Количество" column
    const firstCell = [...first.querySelectorAll('.gridBox')].find((b) => {
      const r = b.getBoundingClientRect();
      const body = gridBody(grid).getBoundingClientRect();
      return r.width > 0 && r.left >= body.left && r.right <= body.right;
    });
    await realClick(firstCell || first);
    await sleep(T.afterClick);
    for (let i = 0; i < 20; i++) {
      const f = focusedCell(grid);
      if (!f) throw new Error('Jadvalda tanlangan katak topilmadi');
      if (f.col === colQty) break;
      await cdp({ type: 'key', key: +f.col < +colQty ? 'ArrowRight' : 'ArrowLeft' });
      await sleep(150);
    }
    if (focusedCell(grid)?.col !== colQty) throw new Error('«Количество» ustuniga o‘tib bo‘lmadi');

    // After a pause the user may have clicked elsewhere: click the grid's current cell again
    const restoreCursor = async () => {
      const f = focusedCell(grid);
      if (!f || f.col !== colQty) throw new Error('Pauzadan keyin jadvaldagi joy topilmadi');
      await realClick(cellOf(f.line, colQty));
      await sleep(T.afterClick);
      log('Pauzadan keyin kursor jadvalga qaytarildi.');
    };

    const seen = new Set();
    state.pendingCodes = [];
    let placed = 0;
    for (;;) {
      const before = resumeCount;
      await checkpoint();
      if (resumeCount !== before && !(document.activeElement === gridBody(grid) || focusInMarkingGrid(document.activeElement))) {
        await restoreCursor();
      }
      const f = focusedCell(grid);
      if (!f || f.col !== colQty) throw new Error('Jadvaldagi fokus yo‘qoldi');
      if (norm(cellText(f.line, colOf(cols, 'item'))) !== norm(item.name)) break; // left this item's codes
      const code = cellText(f.line, colCode);
      if (seen.has(code)) break; // ↓ did not move: end of the list
      seen.add(code);
      const position = seen.size; // place of the code in this product's Подбор list, from 1
      rememberCode(item, code, position);

      // A code already transferred to an earlier receipt is never taken again (1C may still list it
      // in Подбор while that document is not posted)
      const used = state.usedCodes?.[code];
      if (used && used.receiptId !== state.receiptId) {
        noteBadCode(item, code, position, 'oldingi chekda ishlatilgan');
        log(`↷ ${item.name}: ${position}-kod oldingi chekda ishlatilgan, qayta olinmadi.`, 'warn');
        await cdp({ type: 'key', key: 'ArrowDown' });
        await sleep(T.afterCell);
        continue;
      }

      const knownBad = knownBadCode(code);
      if (knownBad) {
        knownBad.seen = (knownBad.seen || 1) + 1;
        noteBadCode(item, code, position, `xato bazasida: ${knownBad.reason}`);
        log(`↷ ${item.name}: ${position}-kod xato bazasida (${knownBad.reason}), soliq.uz tekshirilmadi.`, 'info');
        await cdp({ type: 'key', key: 'ArrowDown' });
        await sleep(T.afterCell);
        continue;
      }

      const checked = await checkMarkingCode(code);
      // my.soliq.uz ga ERI kalit bilan kirilmagan: kodlarni tashlab ketish befoyda — Подбор yopiladi va ish pauza qilinadi
      if (checked.notLoggedIn) {
        try { await closePodbor(); } catch { /* yopilmasa ham pauza qilinadi */ }
        state.pendingCodes = [];
        throw docError('Avval my.soliq.uz ga yuridik shaxs sifatida kiring: ERI kalitdan birini tanlang, keyin tekshirishni boshlaymiz («Davom» ni bosing)');
      }
      if (checked.verdict !== 'available') {
        const sold = checked.verdict === 'sold';
        const reason = sold
          ? checked.stirMatch === false
            ? `boshqa STIR da (${checked.lastStir || '?'}${checked.operation ? `, ${checked.operation}` : ''})`
            : `sotilgan${checked.operation ? ` (${checked.operation})` : ''}`
          : `tekshirilmadi${checked.reason ? ` (${checked.reason})` : ''}`;
        noteBadCode(item, code, position, reason);
        // Sotilgan yoki soliqda umuman topilmagan kod keyingi cheklarda ham olinmaydi — qayta so'ralmasligi uchun bazaga yoziladi
        const permanent = sold || !!checked.notFound;
        if (permanent) rememberBadDb(item, code, sold ? reason : 'markirovka topilmadi', checked);
        log(`↷ ${item.name}: ${position}-kod ${reason}, tashlandi${permanent ? ' (xato bazasiga yozildi)' : ''}.`, permanent ? 'info' : 'warn');
        await cdp({ type: 'key', key: 'ArrowDown' });
        await sleep(T.afterCell);
        continue;
      }
      // Bir chekdagi tovar bitta IKPU bilan sotiladi: kodning MXIK i tovar IKPU sidan farq qilsa, uni sotib bo'lmaydi —
      // kod olinmaydi (o'rniga keyingi kod olinadi) va xato bazasiga yoziladi
      const codeIkpu = ikpuDigits(checked.mxik);
      const itemIkpu = expectedIkpu(item);
      if (codeIkpu && itemIkpu && codeIkpu !== itemIkpu) {
        // 1C dagi IKPU hali noma'lum (faqat birinchi kodning MXIK i taxmin) — kodlar bir-biriga zid: avval 1C dan so'raladi
        if (!state.ikpuByName?.[norm(item.name)] && canLookupIkpu(item))
          throw Object.assign(new Error('Kodlar turli IKPU da'), { needIkpu: true, codeIkpu, itemIkpu });
        const reason = `boshqa IKPU (${codeIkpu}, tovarniki ${itemIkpu})`;
        noteBadCode(item, code, position, reason);
        rememberBadDb(item, code, reason, checked);
        if (atLeastOne(cellText(f.line, colQty))) {
          // Pauzadan oldin 1 yozilgan bo'lsa — 0 ga qaytariladi, aks holda o'tkazishga tushadi
          await cdp({ type: 'key', key: 'Enter' });
          await waitFor(() => document.activeElement?.tagName === 'INPUT' && focusInMarkingGrid(document.activeElement), 4000,
            '«Количество» tahrir maydoni', { pausable: false });
          await cdp({ type: 'selectAll', mac: IS_MAC });
          await cdp({ type: 'text', text: '0' });
          await cdp({ type: 'key', key: 'Enter' });
          await waitFor(() => document.activeElement?.tagName !== 'INPUT', 4000, `«${code}» kodidan 1 olib tashlanishi`, { pausable: false });
        }
        log(`↷ ${item.name}: ${position}-kod ${reason} — olinmadi, keyingisi olinadi (xato bazasiga yozildi).`, 'warn');
        await cdp({ type: 'key', key: 'ArrowDown' });
        await sleep(T.afterCell);
        continue;
      }
      if (codeIkpu && !itemIkpu) {
        if (!state.ikpuGuess || typeof state.ikpuGuess !== 'object') state.ikpuGuess = {};
        state.ikpuGuess[norm(item.name)] = codeIkpu;
      }
      if (codeIkpu) {
        if (!state.codeIkpu || typeof state.codeIkpu !== 'object') state.codeIkpu = {};
        state.codeIkpu[code] = codeIkpu;
        const keys = Object.keys(state.codeIkpu);
        for (const old of keys.slice(0, Math.max(0, keys.length - 20000))) delete state.codeIkpu[old];
      }
      // A code that failed only for a moment (e.g. soliq.uz did not answer) is fine now
      if (state.badCodes?.some((b) => b.code === code)) state.badCodes = state.badCodes.filter((b) => b.code !== code);
      if (state.badDb?.[code]) delete state.badDb[code];

      if (atLeastOne(cellText(f.line, colQty))) {
        placed++; // already 1 (e.g. after a resume)
        state.pendingCodes.push(code);
      } else {
        // Enter → "1" → Enter runs without pause points: a pause takes effect right after it
        await cdp({ type: 'key', key: 'Enter' }); // opens the cell editor
        await waitFor(
          () => document.activeElement?.tagName === 'INPUT' && focusInMarkingGrid(document.activeElement),
          4000,
          '«Количество» tahrir maydoni',
          { pausable: false }
        );
        await cdp({ type: 'text', text: '1' });
        await cdp({ type: 'key', key: 'Enter' });
        await waitFor(
          () => {
            const line = gridRows(grid).find((l) => cellText(l, colCode) === code);
            return line && atLeastOne(cellText(line, colQty)) && document.activeElement?.tagName !== 'INPUT';
          },
          4000,
          `«${code}» kodiga 1 yozilishi`,
          { pausable: false }
        );
        placed++;
        state.pendingCodes.push(code);
        if (state.current) state.current.placed = placed;
        render(`${item.name}: ${placed} / ${need}`);
      }
      if (placed >= need) break;
      assertFocus((el) => el === gridBody(grid) || focusInMarkingGrid(el), 'markirovka jadvali');
      await cdp({ type: 'key', key: 'ArrowDown' });
      await sleep(T.afterCell);
    }
    return placed;
  }

  /** Price as typed into a 1C cell: no thousands separator, decimal comma only when there are kopecks. */
  const priceText = (n) => (Math.round(n * 100) % 100 === 0 ? String(Math.round(n)) : n.toFixed(2).replace('.', ','));

  /** Natsenka, % — Ishonch panelidagi maydondan (Chrome kengaytmasida — 0). */
  async function markupPercent() {
    if (!IS_DESKTOP) return 0;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'markupPercent', version: VERSION });
      const p = Number(res?.percent);
      return Number.isFinite(p) && p >= 0 ? p : 0;
    } catch { return 0; }
  }

  /**
   * «Товары, услуги, комиссия» hujjatida 1C narxni o'zi qo'ymaydi: «Цена» ga tegilmaydi, har qatorning «Сумма» katagiga
   * «Сумма списания» × (1 + natsenka/100) yoziladi — narxni 1C o'zi hisoblaydi, QQS ustiga qo'shiladi. «Сумма списания» bo'sh
   * qator yoki summasi allaqachon to'g'ri qator o'zgartirilmaydi. Natija: 1C dagi «Всего».
   */
  async function fillPrices(prefix, markup = 0) {
    const grid = document.getElementById(`${prefix}_Товары`);
    if (!grid || !isVisible(grid)) throw new Error('Реализация jadvali topilmadi');
    const cols = gridColumns(grid);
    const colName = colOf(cols, 'item');
    const colPrice = colOf(cols, 'price');
    const colTarget = colOf(cols, 'lineSum');
    const colWriteOff = colOf(cols, 'writeOff');
    const colN = colOf(cols, 'rowNumber');
    if (!colName || !colTarget || colWriteOff === undefined) throw new Error('Реализация jadvalida «Номенклатура», «Сумма» yoki «Сумма списания» ustuni topilmadi');
    const sumFor = (line) => {
      const base = parseNumber(spanText(line, cols, colWriteOff), ',');
      return base > 0 ? round2(base * (1 + markup / 100)) : NaN;
    };
    const rows = gridRows(grid);
    if (!rows.length) throw new Error('Реализация jadvali bo‘sh');

    // Birinchi qatorning ko'rinib turgan katagini bosib, «Сумма» ustuniga strelkalar bilan o'tiladi (jadval o'zi suriladi)
    const toPrice = async () => {
      for (let i = 0; i < 40; i++) {
        const f = focusedCell(grid);
        if (!f) throw new Error('Реализация jadvalida tanlangan katak topilmadi');
        if (f.col === colTarget) return f;
        await cdp({ type: 'key', key: +f.col < +colTarget ? 'ArrowRight' : 'ArrowLeft' });
        await sleep(120);
      }
      throw new Error('«Сумма» ustuniga o‘tib bo‘lmadi');
    };
    const body = gridBody(grid).getBoundingClientRect();
    const firstCell = [...rows[0].querySelectorAll('.gridBox')].find((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.left >= body.left && r.right <= body.right;
    });
    await realClick(firstCell || rows[0]);
    await sleep(T.afterClick);
    for (let i = 0; i < rows.length + 2 && focusedCell(grid)?.line !== gridRows(grid)[0]; i++) {
      await cdp({ type: 'key', key: 'ArrowUp' });
      await sleep(120);
    }

    // Oxirgi qatordan keyin ↓ bosilsa 1C yangi bo'sh qator qo'shadi — shuning uchun qatorlar soni oldindan olinadi
    const filled = rows.filter((l) => cellText(l, colName));
    const lastId = colN !== undefined ? cellText(filled[filled.length - 1], colN) : null;
    let written = 0;
    const seen = new Set();
    for (let step = 0; step < filled.length; step++) {
      await checkpoint();
      const f = await toPrice();
      const id = colN !== undefined ? cellText(f.line, colN) : String(gridRows(grid).indexOf(f.line));
      if (seen.has(id)) break; // ↓ joyidan siljimadi: jadval oxiri
      seen.add(id);
      if (!cellText(f.line, colName)) throw new Error('Реализация jadvalida bo‘sh qator paydo bo‘ldi — hujjatni tekshiring');
      const want = sumFor(f.line);
      const have = parseNumber(spanText(f.line, cols, colTarget), ',');
      if (!(want > 0)) log(`${cellText(f.line, colName)}: «Сумма списания» bo‘sh — «Сумма» yozilmadi, tekshiring.`, 'warn');
      else if (!(Math.abs(have - want) < 0.005)) {
        await cdp({ type: 'key', key: 'Enter' }); // katak tahrirlagichi
        await waitFor(() => document.activeElement?.tagName === 'INPUT' && grid.contains(document.activeElement), 4000,
          '«Сумма» tahrir maydoni', { pausable: false });
        await cdp({ type: 'selectAll', mac: IS_MAC });
        await cdp({ type: 'text', text: priceText(want) });
        await cdp({ type: 'key', key: 'Enter' });
        await waitFor(() => document.activeElement?.tagName !== 'INPUT' || !grid.contains(document.activeElement), 4000,
          '«Сумма» yozilishi', { pausable: false });
        await sleep(T.afterCell);
        written++;
      }
      await toPrice();
      if (lastId !== null ? id === lastId : step === filled.length - 1) break;
      await cdp({ type: 'key', key: 'ArrowDown' });
      await sleep(T.afterCell);
    }
    if (gridRows(grid).some((l) => !cellText(l, colName))) throw new Error('Реализация jadvalida bo‘sh qator paydo bo‘ldi — hujjatni tekshiring');
    const total = await captureDocLines(prefix);
    log(`«Сумма» yozildi: ${written} ta qator («Сумма списания» + ${markup}% natsenka). 1C dagi jami: ${fmtSum(total)}.`, 'info');
    return total;
  }

  /**
   * Narxlar qo'yilgandan keyin hujjatdan: «tovar → IKPU» o'rganiladi va E-POS uchun har tovarning 1C dagi «Цена», «Сумма»,
   * «НДС», «Всего», miqdori va QQS foizi eslab qolinadi. Natija: 1C dagi «Всего».
   */
  async function captureDocLines(prefix) {
    const grid = document.getElementById(`${prefix}_Товары`);
    if (!grid) throw new Error('Реализация jadvali topilmadi');
    const cols = gridColumns(grid);
    const colName = colOf(cols, 'item');
    const colPrice = colOf(cols, 'price');
    learnIkpu(prefix);
    const total = await waitFor(() => {
      const v = parseNumber(document.getElementById(`${prefix}_ИтогиВсего_i0`)?.value, ',');
      return Number.isFinite(v) ? { v } : null;
    }, 5000, '«Всего» summasi', { pausable: false });
    // E-POS cheki 1C hujjati bilan bir xil bo'lishi uchun: har tovarning 1C dagi «Всего» (QQS bilan), miqdori va QQS foizi
    const byName = {};
    for (const line of gridRows(grid)) {
      const key = norm(cellText(line, colName));
      if (!key) continue;
      const qty = parseNumber(spanText(line, cols, colOf(cols, 'quantity')), ',');
      const sum = parseNumber(spanText(line, cols, colOf(cols, 'lineTotal')), ',');
      const vat = parseNumber(String(spanText(line, cols, colOf(cols, 'vatRate'))).replace('%', ''), ',');
      const net = parseNumber(spanText(line, cols, colOf(cols, 'lineSum')), ',');
      const vatSum = parseNumber(spanText(line, cols, colOf(cols, 'vatSum')), ',');
      const price = parseNumber(spanText(line, cols, colPrice), ',');
      const prev = byName[key] || { qty: 0, total: 0, net: 0, vatSum: 0, vat: NaN, price: NaN };
      byName[key] = { qty: prev.qty + (qty || 0), total: round2(prev.total + (sum || 0)), net: round2(prev.net + (net || 0)),
        vatSum: round2(prev.vatSum + (vatSum || 0)), vat: Number.isFinite(vat) ? vat : prev.vat, price: Number.isFinite(price) ? price : prev.price };
    }
    state.docLines = { receiptId: state.receiptId, byName };
    return total.v;
  }

  /**
   * 1C hujjatni yozgan/provesti qilganda formani yangi raqam bilan qayta ochadi (form31 → form32). Ko'rinib turgan forma
   * o'sha chek bo'lsa (sklad va tovarlar shu chekniki) — yangi forma prefiksi qaytadi va hujjat belgisi yangilanadi;
   * boshqa hujjat bo'lsa — to'xtatiladi.
   */
  function followReceiptDocument(prefix) {
    const now = formPrefix(salesPodborButton());
    if (now && now === prefix) return prefix;
    const grid = now && document.getElementById(`${now}_Товары`);
    const cols = grid ? gridColumns(grid) : {};
    const colName = colOf(cols, 'item');
    const ours = new Set(state.items.filter((i) => i.placed > 0).map((i) => norm(i.name)));
    const names = grid && colName !== undefined ? gridRows(grid).map((l) => norm(cellText(l, colName))).filter(Boolean) : [];
    const warehouse = document.getElementById(`${now}_Склад_i0`)?.value || '';
    if (!names.length || !names.every((n) => ours.has(n)) || norm(warehouse) !== norm(state.source?.warehouse))
      throw docError('Joriy chek uchun tanlangan hujjat o‘zgardi.');
    log(`1C hujjatni yozib, formani qayta ochdi (${prefix} → ${now}) — shu hujjatda davom etilmoqda.`, 'info');
    if (state.document) state.document = documentIdentity(now);
    return now;
  }

  /** Tanlangan 1C tabining sarlavhasi (hujjat o'zgartirilgan bo'lsa oxirida «*»). */
  const selectedTabTitle = () => document.querySelector('#openedCell_cont .openedItem.select')?.textContent?.trim() || '';

  /**
   * «Провести» (hujjat yopilmaydi): 1C tannarxni («Сумма списания») provesti paytida hisoblaydi — natsenka shundan keyin
   * «Заполнить цены (себестоимость + %)» bilan qo'yiladi. 1C provesti qila olmasa (xabar chiqarsa) ish to'xtatiladi.
   */
  async function postKeepOpen(prefix) {
    const btn = document.getElementById(`${prefix}_ФормаПровести`);
    if (!btn || !isVisible(btn)) throw docError('Hujjatda «Провести» tugmasi topilmadi');
    await realClick(btn);
    let current = prefix;
    await waitFor(() => {
      try { current = followReceiptDocument(current); } catch { return false; }
      const number = document.getElementById(`${current}_Номер_i0`)?.value?.trim();
      const title = selectedTabTitle();
      return number && title && !title.endsWith('*');
    }, 90000, '«Провести» (1C xabarini tekshiring)', { pausable: false }); // forma qayta chizilayotganda hujjat tekshiruvi yo'q
    if (state.document) state.document = documentIdentity(current);
    log(`Hujjat provesti qilindi (№ ${document.getElementById(`${current}_Номер_i0`)?.value?.trim() || '?'}) — endi natsenka qo‘yiladi.`, 'info');
    return current;
  }

  /**
   * Natsenka 1C ning o'zi bilan: «Заполнить» → «Заполнить цены (себестоимость + %)» → foiz → «Заполнить» (OK).
   * Dialogdagi «Заполнить» tugmasi faqat haqiqiy (trusted) bosishga javob beradi — shu tugma realClick bilan bosiladi.
   * 1C narx qo'ya olmasa (jami 0) yoki buyruq ishlamasa — «Сумма» = «Сумма списания» + natsenka qo'lda yoziladi.
   */
  async function applyMarkup(prefix, markup) {
    const followDocument = () => (prefix = followReceiptDocument(prefix));
    const sameForm = async () => followDocument();
    const adapter = {
      document, isVisible, realClick, cdp, parseNumber, mac: IS_MAC, timeout: 15000,
      // 1C formani qayta chizayotganda umumiy hujjat tekshiruvi (checkpoint) xato bermasin — hujjatni followDocument kuzatadi
      waitFor: (fn, timeout, what) => waitFor(fn, timeout, what, { pausable: false }),
      domClick: async (el) => (/_ФормаЗаполнить$/.test(el?.id || '') ? realClick(el) : domClick(el)),
      assertDocument: sameForm,
    };
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await globalThis.ReceiptMarkup.apply({ prefix, percent: markup }, adapter);
        followDocument();
        if (state.document?.prefix === prefix) state.document = documentIdentity(prefix); // 1C yozgan bo'lsa — yangi raqam/sana
        if (r.total > 0) {
          const total = await captureDocLines(prefix);
          log(`Natsenka ${markup}% «Заполнить цены (себестоимость + %)» bilan qo‘yildi. 1C dagi jami: ${fmtSum(total)}.`, 'info');
          return total;
        }
        log('«Заполнить цены» narx qo‘ymadi (jami 0) — «Сумма» = «Сумма списания» + natsenka qo‘lda yoziladi.', 'warn');
        break;
      } catch (e) {
        if (e?.code === 'MARKUP_SUBMIT_UNKNOWN') throw e; // natija noaniq — qayta urinib bo'lmaydi, hujjatni tekshirish kerak
        await sleep(1500);
        followDocument();
        if (state.document?.prefix === prefix) state.document = documentIdentity(prefix);
        if (attempt === 1) {
          // Menyu ochiq qolgan bo'lsa yopiladi va 1C hujjatni yozib bo'lgach yana uriniladi
          const menu = [...document.querySelectorAll(`[id^="${prefix}_"][id$="_submenu"]`)].find(isVisible);
          const toolbar = document.getElementById(`${prefix}_ТоварыЗаполнить`) || document.getElementById(`${prefix}_ГруппаТоварыЗаполнить`);
          if (menu && toolbar) domClick(toolbar);
          log(`«Заполнить цены» birinchi urinishda ochilmadi (${e?.message || e}) — qayta urinilmoqda…`, 'warn');
          await sleep(2000);
          continue;
        }
        log(`«Заполнить цены» ishlamadi (${e?.message || e}) — «Сумма» = «Сумма списания» + natsenka qo‘lda yoziladi.`, 'warn');
      }
    }
    return fillPrices(prefix, markup);
  }

  /** IKPU lookups through the 1C nomenclature that failed in a row (two in a row switch the lookups off until the page reloads). */
  let ikpuLookupFailures = 0;

  /** The × button of the Подбор window (closes it without transferring anything). */
  const podborCloseButton = () => {
    let el = podborCheckbox();
    while (el && el !== document.body) {
      const btn = [...el.querySelectorAll('[title="Закрыть"], [title="Close"], [class*="Close"], [id$="_Close"]')].find(isVisible);
      if (btn) return btn;
      el = el.parentElement;
    }
    return null;
  };

  async function closePodbor() {
    const btn = podborCloseButton();
    if (!btn) throw new Error('«Подбор» oynasining yopish tugmasi topilmadi');
    domClick(btn);
    await waitFor(() => !podborCheckbox(), T.openForm, '«Подбор» oynasining yopilishi');
  }

  async function transfer() {
    const btn = await waitFor(() => bySuffix('_ПеренестиВДокумент', 'a'), 5000, '«Перенести в документ» tugmasi');
    assertDocument();
    domClick(btn);
    await waitFor(() => !podborCheckbox(), T.openForm, '«Подбор» oynasining yopilishi', { pausable: false });
    await sleep(T.afterClick);
  }

  /** IKPU lookups through the 1C nomenclature already tried for a product (one try per product and page load). */
  const ikpuLookedUp = new Set();

  /** The nomenclature lookup is allowed for a product: desktop app, not tried yet for it, not switched off after failures. */
  const canLookupIkpu = (item) => IS_DESKTOP && !ikpuLookedUp.has(norm(item.name)) && ikpuLookupFailures < 2;

  /**
   * The product's IKPU from its 1C nomenclature card (about 30 s on a slow 1C, so it runs only when a product's codes
   * disagree on the MXIK). The Подбор form must be closed: the lookup switches 1C tabs. Remembered once found.
   */
  async function lookupIkpu(item) {
    ikpuLookedUp.add(norm(item.name));
    if (!IS_DESKTOP || ikpuLookupFailures >= 2) return '';
    let res = null;
    const t0 = Date.now();
    try { res = await chrome.runtime.sendMessage({ type: 'ikpuLookup', version: VERSION, name: item.name }); } catch { /* bo'lmasa — birinchi kod bo'yicha */ }
    log(`IKPU qidiruvi ${Math.round((Date.now() - t0) / 1000)} s davom etdi.`, 'info');
    const ikpu = ikpuDigits(res?.ikpu);
    if (ikpu) {
      if (!state.ikpuByName || typeof state.ikpuByName !== 'object') state.ikpuByName = {};
      state.ikpuByName[norm(item.name)] = ikpu;
      if (state.ikpuGuess) delete state.ikpuGuess[norm(item.name)];
      await save();
      ikpuLookupFailures = 0;
      log(`${item.name}: IKPU ${ikpu} (1C nomenklaturasidan).`, 'info');
      return ikpu;
    }
    // Ketma-ket ikki marta olinmasa, qidiruv shu ishga tushirishda to'xtatiladi: har tovarga 30 s yo'qotilmasin
    if (++ikpuLookupFailures >= 2) log('IKPU nomenklaturadan ketma-ket 2 marta olinmadi — qidiruv shu ishga tushirishda o‘chirildi (IKPU birinchi kod bo‘yicha aniqlanadi).', 'warn');
    log(`${item.name}: IKPU 1C nomenklaturasidan olinmadi${res?.error ? ` (${res.error})` : ''} — birinchi kod bo‘yicha aniqlanadi.`, 'warn');
    return '';
  }

  async function processItem(item) {
    if (state.legacyModeBlocked) throw docError('Eski markirovkasiz chek bloklangan: yangi bo‘sh hujjatda «Yangi chekni boshlash» kerak.');
    if (state.inFlight) throw docError('O‘tkazish natijasini tasdiqlang; qayta o‘tkazish bloklangan.');
    assertDocument();
    const need = Math.max(0, Math.round((item.qty - item.placed) * 10000) / 10000);
    if (!need) return;
    state.current = { name: item.name, need, placed: 0 };
    log(`▶ ${item.name} — kerak: ${need} dona`);
    await openPodbor();
    await enableMarkingMode();
    await searchItem(item);
    let placed;
    try {
      placed = await fillQuantities(item, need);
    } catch (e) {
      if (!e?.needIkpu) throw e;
      // Bir tovarning kodlari turli IKPU da: qaysi biri to'g'riligini 1C nomenklaturasi aytadi. Hech narsa o'tkazilmagan —
      // Подбор yopiladi (yozilgan «1» lar tashlanadi), IKPU o'qiladi va tovar qaytadan olinadi
      log(`${item.name}: kodlar turli IKPU da (${e.codeIkpu} va ${e.itemIkpu}) — to‘g'risi 1C nomenklaturasidan aniqlanadi, tovar qayta olinadi.`, 'warn');
      state.pendingCodes = [];
      await closePodbor();
      await lookupIkpu(item);
      assertDocument();
      state.current = { name: item.name, need, placed: 0 };
      await openPodbor();
      await enableMarkingMode();
      await searchItem(item);
      placed = await fillQuantities(item, need);
    }
    if (placed < need) {
      item.status = 'kam';
      item.note = `Markirovka kodi yetmadi: ${placed} / ${need}`;
      log(`⚠ ${item.name}: faqat ${placed} dona (${need} kerak).`, 'warn');
    }
    if (placed === 0) {
      await closePodbor(); // nothing to transfer
      return;
    }
    assertDocument();
    if (!Number.isFinite(placed) || placed < 0 || placed > need) throw new Error('O‘tkazish miqdori noto‘g‘ri');
    state.inFlight = { index: state.index, confirmedPlaced: item.placed + placed, prefix: state.document.prefix };
    await save(); // durable intent BEFORE any transfer click
    await transfer();
    assertDocument();
    globalThis.ReceiptLedger.commit(item, state.inFlight.confirmedPlaced);
    markCodesUsed(item);
    state.inFlight = null;
    await save();
    if (item.status !== 'kam') {
      item.status = 'ok';
      item.note = '';
    }
    log(`✓ ${item.name}: ${placed} dona o‘tkazildi.`, 'ok');
    try { learnIkpu(state.document?.prefix); } catch { /* IKPU ni o'rganib bo'lmasa ham chek davom etadi */ }
  }

  /** The transfer is confirmed: its codes belong to this receipt and are skipped by later ones. */
  function markCodesUsed(item) {
    if (!state.usedCodes || typeof state.usedCodes !== 'object') state.usedCodes = {};
    const time = new Date().toLocaleString('ru-RU');
    for (const code of state.pendingCodes || []) state.usedCodes[code] = { name: item.name, receiptId: state.receiptId, time };
    state.pendingCodes = [];
  }

  /** An error of the document or of the run itself: skipping the product would not help, the run pauses. */
  function docError(message) {
    return Object.assign(new Error(message), { document: true });
  }

  /** This many products failing one after another means something global is wrong (1C, debugger): pause. */
  const MAX_SKIPS_IN_ROW = 3;

  /**
   * A product failed before anything was transferred: close Подбор (dropping the 1s typed in it) and go on
   * with the next product. Returns false when Подбор could not be closed — it must not be reused.
   */
  async function skipFailedItem(item, error) {
    state.pendingCodes = [];
    if (podborCheckbox()) {
      try { await closePodbor(); } catch { return false; }
    }
    item.status = 'skip';
    item.note = `Xato, tashlab ketildi: ${String(error?.message || error)}`;
    state.current = null;
    log(`↷ ${item.name}: ${String(error?.message || error)}. Tovar tashlab ketildi, keyingisiga o‘tildi.`, 'warn');
    return true;
  }

  async function runLoop() {
    if (state.legacyModeBlocked) return log('Eski markirovkasiz chek davom ettirilmaydi. Noaniq o‘tkazish bo‘lsa avval natijasini tasdiqlang; so‘ng yangi bo‘sh Реализация hujjatini ochib «Yangi chekni boshlash» ni bosing.', 'error');
    if (activeTask || state.status === 'done') return;
    if (state.inFlight || state.documentNeedsAck) return log('Avval o‘tkazish natijasini va joriy hujjatni tasdiqlang.', 'error');
    if (!receiptReady) return log('Chek tayyor emas: maqsad summani tekshiring.', 'error');
    if (!state.items.length) {
      log('Avval Инвентаризация hujjatida «Olish» ni bosing.', 'error');
      return;
    }
    try { assertDocument(true); } catch (e) { return log(e.message, 'error'); }
    state.pricingPercent = 0;
    state.receiptTarget ??= state.plan?.all ? null : state.plan?.target ?? null;
    // A new receipt gets a new clock and an empty list of bad codes; a resumed one keeps both
    if (state.clock?.task !== 'run' || state.clock.endedAt != null) {
      startClock('run');
      // To'xtatilib qayta davom ettirilgan chek o'z belgisini saqlaydi — aks holda oldin olingan kodlari E-POS ga chiqmay qoladi
      if (!hasProgress() || state.receiptId == null) {
        state.badCodes = [];
        state.receiptId = Date.now();
      }
    }
    activeTask = 'run';
    state.status = 'running';
    save();
    render();
    let skipsInRow = 0;
    try {
      while (state.index < state.items.length) {
        await checkpoint();
        const item = state.items[state.index];
        if (item.status === 'pending' || (item.status === 'xato' && item.placed < item.qty)) {
          try {
            await processItem(item);
            skipsInRow = 0;
          } catch (e) {
            if (e instanceof StopError) throw e;
            // An error while searching / filling this product (nothing transferred yet): skip just this product
            if (!e?.document && !state.inFlight && skipsInRow < MAX_SKIPS_IN_ROW - 1 && await skipFailedItem(item, e)) {
              skipsInRow++;
              state.index++;
              save();
              render();
              continue;
            }
            skipsInRow = 0;
            if (!e?.document && !state.inFlight) log(`${MAX_SKIPS_IN_ROW} ta tovar ketma-ket xato berdi yoki «Подбор» yopilmadi — 1C ni tekshiring.`, 'error');
            item.status = 'xato';
            item.note = String(e.message || e);
            log(`✗ ${item.name}: ${item.note}. Pauza qilindi — tekshirib, «Davom» ni bosing.`, 'error');
            state.status = 'paused';
            save();
            render();
            if (state.inFlight) break; // uncertain outcome must never auto-retry
            await checkpoint();
            continue; // retry the same item after resume
          }
        }
        state.index++;
        state.current = null;
        save();
        render();

      }
      if (state.inFlight || state.index < state.items.length) return;
      state.phase = 'pricing';
      await save();
      await checkpoint();
      const pricePrefix = assertDocument();
      // Markup through 1C «Заполнить цены (себестоимость + %)» (fallback: «Сумма» = «Сумма списания» + markup); the total is 1C's own
      const lineTotal = (i) => (i.placed > 0 ? globalThis.ReceiptMath.lineTotals({ ...i, qty: i.placed }, 0).total : 0);
      const localTotal = round2(state.items.reduce((sum, i) => sum + (Number.isFinite(lineTotal(i)) ? lineTotal(i) : 0), 0));
      // Avval «Провести» (1C tannarxni hisoblaydi), keyin «Заполнить цены (себестоимость + %)» bilan natsenka
      const postedPrefix = IS_DESKTOP ? await postKeepOpen(pricePrefix) : pricePrefix;
      const oneCTotal = await applyMarkup(postedPrefix, await markupPercent());
      state.pricingResult = { total: oneCTotal > 0 ? round2(oneCTotal) : localTotal, local: !(oneCTotal > 0) };
      const plannedItems = state.items.filter(i => i.qty > 0 && (i.status !== 'skip' || i.placed > 0));
      const placedItems = state.items.filter(i => i.placed > 0);
      const plannedNames = new Set(plannedItems.map(i => norm(String(i.name || '').normalize('NFKC'))));
      const placedNames = new Set(placedItems.map(i => norm(String(i.name || '').normalize('NFKC'))));
      state.incomplete = !plannedNames.size
        || placedNames.size !== plannedNames.size
        || [...plannedNames].some(name => !placedNames.has(name))
        || placedItems.some(i => !validUnits(i.placed))
        || plannedItems.some(i => !validUnits(i.placed) || i.placed > i.qty);
      snapshotReceipt();
      state.phase = 'complete';
      state.status = 'done';
      receiptReady = false;
      el('target').value = '';
      log(`Jami${state.pricingResult.local ? ' (lokal hisob)' : ' (1C)'}: ${fmtSum(state.pricingResult.total)}${state.receiptTarget != null ? `; maqsaddan farq: ${fmtSum(round2(state.pricingResult.total - state.receiptTarget))}` : ''}. Yakuniy summa 1C da hujjat o‘tkazilganda (QQS, 1C narxi) farq qilishi mumkin.`, 'warn');
      const ok = state.items.filter((i) => i.status === 'ok').length;
      const short = state.items.filter((i) => i.status === 'kam').length;
      const skipped = state.items.filter((i) => i.status === 'skip' && i.qty > 0).length;
      if (state.incomplete) log(`CHEK TO‘LIQ EMAS: kamida 1 xil turli tovar, har biridan ${capText(state.plan?.perItem)}, turlar soni cheklanmagan sharti bajarilmadi. Faqat haqiqiy o‘tkazilgan miqdor qoldiqdan ayrildi; qo‘shimcha tovar qo‘shilmadi.`, 'warn');
      log(`${state.incomplete ? 'To‘liq bo‘lmagan qoralama' : 'Yig‘ib bo‘lindi'}: ${ok} ta tovar to‘liq, ${short} ta tovarda kod yetmadi${skipped ? `, ${skipped} ta tovar xato sababli tashlab ketildi` : ''}. ${state.incomplete ? 'To‘liq bo‘lmagan chekni tekshiring.' : 'Chek yig‘ildi, hujjatni o‘zingiz o‘tkazasiz.'} Keyingi chek: Инвентаризация oynasida «Olish» ni bosing (sotilganlari chiqqan yangi qoldiq o‘qiladi), yangi bo‘sh Реализация oching, summa va ustamani kiriting, «Boshlash» ni bosing. Oldingi cheklardagi markirovkalar qayta olinmaydi.`, 'ok');
    } catch (e) {
      if (e instanceof StopError) log('To‘xtatildi.', 'warn');
      else {
        state.status = 'paused';
        log(`Xato: ${e.message || e}`, 'error');
      }
    } finally {
      activeTask = null;
      if (state.status !== 'paused') cdp({ type: 'detach' }).catch(() => {});
      save();
      render();
    }
  }

  /** Continue after a pause: the running loop picks it up, or a new loop starts (e.g. after a page reload). */
  const resume = () => {
    if (state.legacyModeBlocked) return log('Eski markirovkasiz chek davom ettirilmaydi. Noaniq o‘tkazish bo‘lsa avval natijasini tasdiqlang; so‘ng yangi bo‘sh Реализация hujjatini ochib «Yangi chekni boshlash» ni bosing.', 'error');
    if (state.status === 'done') return;
    if (state.inFlight || state.documentNeedsAck) return log('Avval noaniq natija / hujjatni tasdiqlang.', 'error');
    if (!receiptReady) return log('Chek tayyor emas: maqsad summani tekshiring.', 'error');
    state.status = 'running';
    save();
    render();
    if (!activeTask) runLoop();
  };

  /**
   * The receipt as the E-POS sale window needs it: what was really transferred into the 1C document
   * (placed units) and the marking codes used for those units in this receipt.
   */
  function buildEposReceipt() {
    const codesByName = new Map();
    for (const [code, info] of Object.entries(state.usedCodes || {})) {
      if (state.receiptId != null && info?.receiptId !== state.receiptId) continue;
      const key = norm(info?.name);
      if (!key) continue;
      if (!codesByName.has(key)) codesByName.set(key, []);
      codesByName.get(key).push(code);
    }
    const lines = state.items
      .filter((i) => i.placed > 0)
      .map((i) => {
        const codes = codesByName.get(norm(i.name)) || [];
        // Narx — 1C hujjatidagi «Всего» ÷ miqdor (QQS bilan, 1C bilan bir xil); bo'lmasa — inventarizatsiya narxi
        const doc = state.docLines?.receiptId === state.receiptId ? state.docLines.byName?.[norm(i.name)] : null;
        const unitPrice = doc?.qty > 0 && doc.total > 0 ? Math.round((doc.total / doc.qty) * 100) / 100 : Number(i.price) || 0;
        // 1C dagi qator jami (QQS bilan): fiskal chek tiyingacha 1C bilan bir xil bo'lishi uchun (miqdor mos bo'lsa)
        const same = doc?.total > 0 && doc.qty === i.placed;
        const lineTotal = same ? doc.total : null;
        // 1C dagi kabi ko'rsatish uchun: narx va summa QQS'siz, QQS summasi (miqdor mos bo'lsa)
        const netPrice = same && Number.isFinite(doc.price) ? doc.price : null;
        const netSum = same && doc.net > 0 ? doc.net : null;
        const vatSum = same && Number.isFinite(doc.vatSum) ? doc.vatSum : null;
        return { name: i.name, quantity: i.placed, unitPrice, lineTotal, netPrice, netSum, vatSum, vatPercent: Number.isFinite(doc?.vat) ? doc.vat : null, codes,
          ikpu: state.ikpuByName?.[norm(i.name)] || '', codeIkpu: Object.fromEntries(codes.map((c) => [c, state.codeIkpu?.[c] || ''])) };
      });
    return { receiptId: String(state.receiptId ?? ''), finished: state.status === 'done', lines };
  }

  const EPOS_SALE_ENABLED = true;
  const eposSaleBlockReason = () => !EPOS_SALE_ENABLED
    ? 'E-POS orqali sotish hozircha o‘chirilgan'
    : !IS_DESKTOP ? 'E-POS orqali sotish faqat Ishonch dasturida ishlaydi'
    : activeTask || state.status === 'running' ? 'joriy ish bajarilmoqda'
      : state.inFlight ? 'o‘tkazish natijasi noaniq'
        : !state.items.some((i) => i.placed > 0) ? '1C ga o‘tkazilgan tovar yo‘q'
          : null;

  async function eposSale() {
    const blocked = eposSaleBlockReason();
    if (blocked) return log(`E-POS orqali sotib bo‘lmaydi: ${blocked}.`, 'error');
    const receipt = buildEposReceipt();
    if (!receipt.finished) log('Diqqat: chek hali «Yig‘ib bo‘lindi» holatida emas, hujjat to‘liq bo‘lmasligi mumkin.', 'warn');
    log('E-POS: sotish oynasi ochilmoqda…');
    let res;
    try { res = await chrome.runtime.sendMessage({ type: 'eposSale', receipt }); }
    catch (e) { return log(`E-POS bilan aloqa yo‘q: ${e?.message || e}`, 'error'); }
    if (!res?.ok) return log(`E-POS: ${res?.error || 'javob kelmadi'}`, 'error');
    if (res.sold) log(`✓ E-POS: fiskal chek №${res.receiptSeq}, fiskal belgi ${res.fiscalSign}`, 'ok');
    else log('E-POS: sotuv amalga oshmadi (oyna yopildi).', 'warn');
  }

  async function primaryAction() {
    if (activeTask === 'capture') return log('«Olish» hali tugamagan — «Boshlash» keyinroq bosiladi.', 'warn');
    if (state.status === 'running' && activeTask === 'run') {
      state.status = 'paused';
      save(); render();
      return;
    }
    if (state.inFlight) return log('Avval o‘tkazish natijasini tasdiqlang.', 'error');
    const next = state.status === 'done' || state.legacyModeBlocked;
    if (next) {
      const target = el('target').value;
      await nextReceipt();
      if (state.status !== 'idle' || state.legacyModeBlocked) return;
      el('target').value = target;
    }
    if (state.documentNeedsAck) return log('Avval joriy hujjatni tasdiqlang.', 'error');
    state.stepMode = false;
    const resumable = hasProgress() || !!state.document || !!state.current || state.phase === 'pricing' || activeTask === 'run';
    if (resumable) {
      const pinnedTarget = state.receiptTarget ?? state.plan?.target;
      if (pinnedTarget != null && parseNumber(el('target').value) !== pinnedTarget) return log(`Joriy chek maqsadi ${fmtSum(pinnedTarget)}; shu summani kiriting yoki yangi chek boshlang.`, 'error');
      if (!receiptReady) prepareReceipt();
      if (receiptReady) resume();
    } else {
      if (state.plan?.all && receiptReady) {
        await runLoop();
      } else {
        receiptReady = false;
        applyPlan(parseNumber(el('target').value));
        if (receiptReady) await runLoop();
      }
    }
  }

  function assertDocument(bind = false) {
    const prefix = formPrefix(salesPodborButton());
    if (!prefix) throw docError('Ochiq Реализация hujjatini tanlang.');
    const warehouse = document.getElementById(`${prefix}_Склад_i0`)?.value?.trim() || '';
    if (!norm(state.source?.warehouse)) throw docError('Manba ombori yo‘q: inventarizatsiyani qayta o‘qing.');
    if (!norm(warehouse) || norm(warehouse) !== norm(state.source.warehouse)) throw docError('Реализация ombori manba ombori bilan bir xil bo‘lsin.');
    if (state.documentNeedsAck) throw docError('Sahifa yangilangan: hujjatni tekshirib tasdiqlang.');
    if (!state.document && bind) {
      if (!emptyDocument(prefix)) throw docError('Birinchi o‘tkazish uchun bo‘sh Реализация hujjati kerak.');
      state.document = documentIdentity(prefix);
    }
    if (!state.document || prefix !== state.document.prefix) throw docError('Joriy chek uchun tanlangan hujjat o‘zgardi.');
    if (state.document.number && state.document.number !== documentIdentity(prefix).number) throw docError('Hujjat raqami o‘zgardi.');
    if (state.document.date && state.document.date !== documentIdentity(prefix).date) throw docError('Hujjat sanasi o‘zgardi.');
    return prefix;
  }

  function documentIdentity(prefix) {
    return { prefix, number: document.getElementById(`${prefix}_Номер_i0`)?.value?.trim() || '',
      date: document.getElementById(`${prefix}_Дата_i0`)?.value?.trim() || '' };
  }

  function emptyDocument(prefix) {
    const grid = document.getElementById(`${prefix}_Товары`);
    if (!grid || gridRows(grid).some(row => row.textContent.trim())) return false;
    return ![...document.querySelectorAll(`[id^="${prefix}_"]`)].some(e => /^(Товары|Goods|Products|Items) \([1-9]\d*\)$/.test(e.textContent.trim()));
  }

  function snapshotReceipt() {
    if (state.receiptArchived) return;
    const items = state.items.filter(i => i.placed > 0).map(i => ({ name: i.name, qty: i.placed,
      total: globalThis.ReceiptMath.lineTotals({ ...i, qty: i.placed }, 0).total }));
    state.history.push({ incomplete: !!state.incomplete, document: state.document, actualTotal: state.pricingResult?.total ?? null, difference: state.receiptTarget != null && state.pricingResult ? round2(state.pricingResult.total - state.receiptTarget) : null, items, total: round2(items.reduce((a,i) => a + i.total, 0)), target: state.receiptTarget ?? state.plan?.target ?? null });
    state.receiptArchived = true;
  }

  async function reconcileTransfer(added) {
    if (activeTask || !state.inFlight) return;
    const intent = state.inFlight;
    // User confirms after inspecting the actual document, including after reload.
    if (added) {
      globalThis.ReceiptLedger.commit(state.items[intent.index], intent.confirmedPlaced);
      markCodesUsed(state.items[intent.index]);
    } else {
      state.pendingCodes = [];
    }
    state.items[intent.index].status = 'pending';
    state.inFlight = null;
    state.current = null;
    state.status = 'paused';
    await save();
    render();
  }

  async function nextReceipt() {
    const legacy = !!state.legacyModeBlocked;
    if (activeTask || state.inFlight || (!legacy && state.status === 'paused')) return log('Avval joriy o‘tkazishni aniqlang/yakunlang.', 'error');
    if (!legacy && hasProgress() && state.status !== 'done') return log('Joriy chekni avval yakunlang.', 'error');
    const prefix = formPrefix(salesPodborButton());
    // Says exactly why the next receipt cannot start, so the user knows what to do
    if (!prefix) return log('Keyingi chek: ochiq Реализация hujjati topilmadi. Yangi Реализация ochib, uni oldinga chiqaring.', 'error');
    if (!emptyDocument(prefix)) return log('Keyingi chek: ochiq Реализация hujjati bo‘sh emas. Yangi bo‘sh Реализация oching.', 'error');
    if (state.document && prefix === state.document.prefix && (!state.documentNeedsAck || (legacy && !state.document.number))) {
      return log('Keyingi chek: bu oldingi chekning o‘sha oynasi (1C forma raqami bir xil). Oldingi hujjatni yoping va yangi Реализация ni alohida oching.', 'error');
    }
    if (state.document?.number && documentIdentity(prefix).number === state.document.number && documentIdentity(prefix).date === state.document.date) {
      return log('Keyingi chek: hujjat raqami va sanasi oldingi chek bilan bir xil. Yangi Реализация oching.', 'error');
    }
    if (legacy) {
      state.history.push({ legacy: true, status: 'stopped', document: state.document,
        items: state.items.filter(i => i.placed > 0).map(i => ({ name: i.name, qty: i.placed })) });
    }
    state.previousPrefix = state.document?.prefix || null;
    state.items.forEach(i => globalThis.ReceiptLedger.next(i));
    resetReceipt();
    state.document = null;
    state.documentNeedsAck = false;
    state.legacyModeBlocked = false;
    state.mode = 'marked';
    state.receiptArchived = false;
    state.phase = 'transfer';
    state.pricingPercent = null;
    state.receiptTarget = null;
    state.pricingResult = null;
    state.incomplete = false;
    state.index = 0;
    state.current = null;
    state.status = 'idle';
    await save(); render();
    log('Qolgan qoldiq saqlandi. Yangi ustama foizi va maqsad summani kiriting.');
  }

  // ---------------------------------------------------------------------------
  // Panel UI: shown in Chrome's side panel (sidepanel.html)
  // ---------------------------------------------------------------------------
  // This shadow DOM is the panel's model and is never put into the 1C page. render() fills it,
  // and the side panel mirrors it: it gets PANEL_HTML once, then every rendered view, and sends back
  // clicks and typed values, which go through the same handlers as before.
  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .panel { min-height: 100vh; display: flex; flex-direction: column; font: 13px/1.45 -apple-system, Segoe UI, Roboto, sans-serif;
        color: #1e293b; background: #fff; }
      .head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #4f46e5; color: #fff; user-select: none; }
      .head b { font-size: 14px; }
      .body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
      .body > * { flex-shrink: 0; }
      .field { flex: 1 1 120px; min-width: 0; flex-direction: column; align-items: stretch; gap: 3px; }
      .field .inp { flex: 0 0 auto; width: 100%; box-sizing: border-box; }
      .row { display: flex; gap: 6px; flex-wrap: wrap; }
      button.b { flex: 1 1 auto; padding: 7px 8px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; cursor: pointer; font-weight: 600; font-size: 12px; }
      button.b:hover:not(:disabled) { background: #eef2ff; border-color: #a5b4fc; }
      button.b:disabled { opacity: .45; cursor: default; }
      button.primary { background: #4f46e5; color: #fff; border-color: #4f46e5; }
      button.primary:hover:not(:disabled) { background: #4338ca; }
      .muted { color: #64748b; }
      .clock { font-weight: 600; color: #3730a3; background: #eef2ff; border-radius: 8px; padding: 6px 8px; font-variant-numeric: tabular-nums; }
      .bar { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
      .bar > i { display: block; height: 100%; background: #4f46e5; width: 0; transition: width .3s; }
      .list { max-height: 260px; overflow: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
      .item { display: flex; justify-content: space-between; gap: 8px; padding: 4px 8px; border-bottom: 1px solid #f1f5f9; }
      .item.cur { background: #eef2ff; font-weight: 600; }
      .item span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .badbox summary { cursor: pointer; font-weight: 600; color: #b91c1c; }
      .bad { margin-top: 6px; max-height: 300px; overflow: auto; border: 1px solid #fecaca; background: #fef2f2; border-radius: 8px; }
      .bad .entry { padding: 6px 8px; border-bottom: 1px solid #fee2e2; }
      .bad code { display: block; font: 11px ui-monospace, Menlo, Consolas, monospace; color: #7f1d1d; word-break: break-all; }
      .check .res { margin-top: 6px; padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 8px; }
      .check .res.good { border-color: #86efac; background: #f0fdf4; } .check .res.sold { border-color: #fecaca; background: #fef2f2; }
      .check .res.unknown { border-color: #fde68a; background: #fffbeb; }
      .check code { display: block; font: 11px ui-monospace, Menlo, Consolas, monospace; word-break: break-all; }
      .log { max-height: 260px; overflow: auto; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 6px 8px; }
      .log .warn { color: #fbbf24; } .log .error { color: #f87171; } .log .ok { color: #4ade80; }
      label { display: flex; align-items: center; gap: 6px; }
      [hidden] { display: none !important; }
      .inp { flex: 1 1 140px; min-width: 0; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
      .inp:focus { outline: 2px solid #a5b4fc; border-color: #6366f1; }
      button.small { flex: 0 0 auto; }
      .receipt { flex:0 0 auto; min-height:120px; max-height:320px; overflow:auto; } table { border-collapse:collapse; width:100%; min-width:680px; } th,td { padding:4px; text-align:right; border-bottom:1px solid #e2e8f0; } th:first-child,td:first-child { text-align:left; } .qty { width:76px; }
      .item.skip { color: #94a3b8; }
      /* Bosqichlar: oq karta, raqamli sarlavha */
      .body { background: #f8fafc; }
      .head .hstat { font-size: 11px; opacity: .85; text-align: right; margin-left: 8px; }
      .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
      .card .st { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #1e1b4b; font-size: 13px; }
      .card .st .n { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: #4f46e5; color: #fff; font-size: 11px; flex: 0 0 auto; }
      details.fold { gap: 0; }
      details.fold > summary { cursor: pointer; list-style: none; }
      details.fold > summary::-webkit-details-marker { display: none; }
      details.fold > summary::after { content: '▸'; margin-left: auto; color: #94a3b8; }
      details.fold[open] > summary::after { content: '▾'; }
      details.fold .sub { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
    </style>
    <div class="panel">
      <div class="head"><b>Markirovkali chek <small>v${VERSION}</small></b><span class="hstat" data-el="source">Ma’lumot olinmagan</span></div>
      <div class="body">
        <section class="card">
          <div class="st"><span class="n">1</span>Sozlamalar</div>
          <div class="auto-slot" id="ishAutoSettingsSlot"></div>
          <div class="row">
            <label class="field"><span>Maqsad summa, UZS</span><input class="inp" data-el="target" type="text" inputmode="decimal" placeholder="umumiy summa"></label>
            <label class="field" title="Har bir tovardan nechta dona olinadi. Qoldiq kam bo‘lsa boricha olinadi. Bo‘sh qoldirilsa tovarning hammasi olinadi."><span>Bir tovardan, dona</span><input class="inp" data-el="perItem" type="text" inputmode="numeric" placeholder="hammasi"></label>
          </div>
          <div class="row">
            <label class="field" title="100 — boshidan 100 qator; 4-20 — 4-qatordan 20-qatorgacha (17 qator); bo‘sh — hammasi"><span>Inventarizatsiyadan qatorlar</span><input class="inp" data-el="captureLimit" type="text" inputmode="text" placeholder="hammasi (yoki 100, 4-20)"></label>
            <label class="field" title="Kod faqat oxirgi operatsiyasi ulgurji va oxirgi olgan STIR shu bo‘lsa olinadi. Bo‘sh qoldirilsa faqat operatsiya turi tekshiriladi."><span>Bizning STIR</span><input class="inp" data-el="stir" type="text" inputmode="numeric" placeholder="masalan 123456789"></label>
          </div>
        </section>

        <section class="card">
          <div class="st"><span class="n">2</span>Ishga tushirish</div>
          <div class="auto-slot" id="ishAutoActionsSlot"></div>
          <div class="clock" data-el="clock" hidden></div>
          <div data-el="receiptSummary"></div>
          <div><div class="bar"><i data-el="bar"></i></div><div class="muted" data-el="progress"></div></div>
          <div data-el="message" role="status"></div>
          <div class="row"><button class="b" data-a="eposSale" hidden title="Tayyor chekni E-POS orqali fiskal chek qilib sotadi">E-POS orqali sotish</button></div>
          <div class="row" data-el="recovery" hidden><button class="b" data-a="confirmAdded" hidden>Qo‘shilganini tasdiqlash</button><button class="b" data-a="confirmNotAdded" hidden>Qo‘shilmaganini tasdiqlash</button><button class="b" data-a="confirmDocument" hidden>Joriy hujjatni tasdiqlash</button></div>
        </section>

        <!-- Qo'lda boshqarish: Ishonch dasturida ko'rinmaydi (hammasini avtomatika bajaradi, tugmalarni ichkaridan bosadi);
             Chrome kengaytmasida — oddiy tugmalar -->
        <section class="card" data-el="manual"${IS_DESKTOP ? ' hidden' : ''}>
          <div class="st"><span class="n">3</span>Boshqaruv</div>
          <div class="row"><button class="b" data-a="capture" title="Ochiq inventarizatsiyadan tovarlarni o‘qish">Olish</button><button class="b primary" data-a="start">Boshlash</button></div>
          <div class="row"><button class="b" data-a="all">Barcha mahsulotlarni qo‘shish</button></div>
          <div class="row"><button class="b small" data-a="clear" title="Joriy chekni tozalash">Tozalash</button><button class="b small" data-a="clearWarehouse" title="O‘qilgan ombor ma’lumotlarini tozalash">Omborni tozalash</button><button class="b small" data-a="abort" title="Qotib qolgan amalni tugatadi va joriy chekni nolga qaytaradi (ombor qoldig‘i saqlanadi)">⛔ To‘liq to‘xtatish</button></div>
        </section>

        <div class="badbox" data-el="badBox" hidden><details open><summary data-el="badTitle">Xato markirovkalar</summary><div class="bad" data-el="bad"></div><div class="row"><button class="b small" data-a="clearBadDb" title="Doimiy xato markirovkalar bazasini bo‘shatadi: kodlar qayta soliq.uz da tekshiriladi">Xato bazasini tozalash</button></div></details></div>

        <details class="card fold check">
          <summary class="st"><span class="n">✓</span>Markirovkani tekshirish</summary>
          <div class="sub">
            <div class="row"><input class="inp" data-el="checkCode" data-enter="checkCode" type="text" placeholder="Kodni kiriting yoki skanerlang (bir nechtasini bo‘shliq bilan)"><button class="b small" data-a="checkCode">Tekshirish</button></div>
            <div data-el="checkResult"></div>
          </div>
        </details>

        <details class="card fold" data-el="details">
          <summary class="st"><span class="n">i</span>Tafsilotlar va jurnal</summary>
          <div class="sub">
            <div class="muted" data-el="rules">Faqat markirovkali • har bir tovardan ko‘pi bilan 2 dona (qoldiq kam bo‘lsa boricha) • turlar soni cheklanmagan</div>
            <div class="muted" data-el="fullSource"></div>
            <div class="muted" data-el="plan"></div>
            <div class="receipt" data-el="receipt"></div>
            <div class="list" data-el="list"></div>
            <div class="log" data-el="log"></div>
          </div>
        </details>
      </div>
    </div>`;
  const PANEL_HTML = root.innerHTML;

  const el = (name) => root.querySelector(`[data-el="${name}"]`);
  const btn = (a) => root.querySelector(`[data-a="${a}"]`);
  let liveText = '';

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function render(live) {
    if (!alive()) return;
    if (typeof live === 'string') liveText = live;
    syncClock();
    const busy = activeTask === 'run' && state.status === 'running';
    const paused = state.status === 'paused';
    const capturing = activeTask === 'capture';
    const next = state.status === 'done' || state.legacyModeBlocked;
    const resumable = !next && (hasProgress() || !!state.document || !!state.current || state.phase === 'pricing' || activeTask === 'run');
    const locked = !next && (busy || paused || !!activeTask || hasProgress() || !!state.inFlight || state.phase === 'pricing');
    el('source').textContent = `${state.items.length} xil tovar • jami qoldiq ${fmtSum(state.items.reduce((a, i) => a + i.stock, 0))} dona`;
    el('fullSource').textContent = state.source ? `${state.source.title} • ${state.source.rowCount}${state.source.totalRowCount ? ` / ${state.source.totalRowCount}` : ''} qator${state.source.requestedLimit != null ? (state.source.requestedFrom ? ` • ${state.source.requestedFrom}–${state.source.requestedLimit}-qatorlar` : ` • boshidan ${state.source.requestedLimit}`) : ''} • ${state.source.capturedAt}` : '';
    // While reading, the same button is Pauza / Davom and shows how many rows are read so far
    btn('capture').textContent = capturing
      ? `${paused ? 'Davom' : 'Pauza'} (${captureProgress?.read ?? 0})`
      : 'Olish';
    btn('capture').disabled = capturing
      ? false
      : !!activeTask || paused || !!state.inFlight || (hasProgress() && state.status !== 'done') || !!state.legacyModeBlocked;
    btn('all').disabled = capturing || busy || paused || !!state.inFlight || hasProgress() || !state.items.length || !!state.legacyModeBlocked;
    el('captureLimit').disabled = btn('capture').disabled;
    if (capturing) el('captureLimit').disabled = true; // the button is Pauza/Davom while reading: the limit stays fixed
    el('captureLimit').value = state.captureLimit ?? '';
    btn('start').textContent = next ? 'Yangi chekni boshlash' : busy ? 'Pauza' : resumable ? 'Davom' : 'Boshlash';
    // E-POS orqali sotish (fiskal modul ulanganda); o'chirish uchun EPOS_SALE_ENABLED = false
    btn('eposSale').hidden = !(IS_DESKTOP && EPOS_SALE_ENABLED);
    btn('eposSale').disabled = !!eposSaleBlockReason();
    btn('start').disabled = capturing || !!state.inFlight || (!next && !!state.documentNeedsAck) || !state.items.length ||
      (!busy && !!activeTask && !paused);
    el('target').disabled = locked || capturing;
    el('perItem').disabled = el('target').disabled;
    el('perItem').value = state.perItemLimit ?? '2';
    if (document.activeElement !== el('stir')) el('stir').value = state.stir ?? '';
    // The current receipt keeps its pinned limit; a finished one shows what the next receipt will use
    const perItemNow = (next ? undefined : state.plan?.perItem) ?? parsePerItem(state.perItemLimit) ?? 2;
    el('rules').textContent = `Faqat markirovkali • har bir tovardan ${capText(perItemNow)}${perItemNow === 'all' ? '' : ' (qoldiq kam bo‘lsa boricha)'} • turlar soni cheklanmagan`;
    el('clock').hidden = !state.clock;
    el('clock').textContent = globalThis.WorkClock?.text(state.clock, state.status) || '';
    el('recovery').hidden = !state.inFlight && !state.documentNeedsAck;
    // never disabled: it is the way out when everything else is blocked
    btn('abort').disabled = false;
    btn('abort').textContent = Date.now() < abortArmedUntil ? 'Tasdiqlang: yana bosing' : '⛔ To‘liq to‘xtatish';
    btn('confirmAdded').hidden = btn('confirmNotAdded').hidden = !state.inFlight;
    btn('confirmDocument').hidden = !state.documentNeedsAck || !!state.inFlight;
    btn('confirmAdded').disabled = btn('confirmNotAdded').disabled = !!activeTask;
    btn('confirmDocument').disabled = !!activeTask;
    el('message').textContent = state.inFlight ? 'O‘tkazish natijasini tekshirib tasdiqlang.' : state.documentNeedsAck && !next ? 'Joriy hujjatni tekshirib tasdiqlang.' : state.log.at(-1)?.level === 'error' ? state.log.at(-1).text : '';
    if (!next && state.plan) el('target').value ||= String(state.plan.target);
    el('plan').textContent = state.plan
      ? state.plan.all
        ? `Barcha mahsulotlar: jami ${fmtSum(state.plan.total)} • bir tovardan ${capText(state.plan.perItem)} • narx: ustamali sotuv narxi`
        : `Reja: jami ${fmtSum(state.plan.total)} (maqsad ${fmtSum(state.plan.target)}, farq ${state.plan.total - state.plan.target >= 0 ? '+' : ''}${fmtSum(round2(state.plan.total - state.plan.target))}) • bir tovardan ${capText(state.plan.perItem)} • narx: ustamali sotuv narxi (taxminiy reja)`
      : state.items.length
        ? 'Qo‘lda tanlangan miqdorlar (avtomatik reja yo‘q)'
        : '';

    const rows = state.items.map(i => i.qty === 0 ? {costTotal:0,markupTotal:0,total:0} : validPrice(i) ? globalThis.ReceiptMath.lineTotals(i, 0) : null);
    el('receipt').innerHTML = `<table><thead><tr><th>Tovar / qoldiq</th><th>Miqdor</th><th>Asl narx</th><th>Sotuv narxi</th><th>Tannarx</th><th>Ustama</th><th>Jami</th></tr></thead><tbody>${state.items.map((i,n) => {
      const t = rows[n];
      const money = v => Number.isFinite(v) ? fmtSum(v) : '—';
      return `<tr><td>${escapeHtml(i.name)} / boshida ${fmtSum(i.initialStock ?? i.stock)}, qoldiq ${fmtSum(i.stock)}, o‘tkazilgan ${fmtSum(i.totalUsed ?? i.placed)}${!validPrice(i) ? ' ⚠ Narx yo‘q/noto‘g‘ri' : ''}</td><td><input class="qty" data-qty="${n}" type="text" inputmode="decimal" value="${Number.isFinite(i.qty) ? i.qty : ''}" disabled></td><td>${validPrice(i) ? money(i.price) : '—'}</td><td>${money(t?.saleUnitPrice)}</td><td>${money(t?.costTotal)}</td><td>${money(t?.markupTotal)}</td><td>${money(t?.total)}</td></tr>`;
    }).join('')}</tbody></table>`;
    const validTotals = rows.length && rows.every(t => t && Number.isFinite(t.total));
    const sum = key => round2(rows.reduce((a,t) => a + Math.round(t[key] * 100), 0) / 100);
    const currentTarget = state.receiptTarget ?? state.plan?.target ?? parseNumber(el('target').value);
    const hasTarget = Number.isFinite(currentTarget) && currentTarget > 0;
    const outsideRange = state.plan && !state.plan.all && Number.isFinite(state.plan.minTotal) && Number.isFinite(state.plan.maxTotal) &&
      (state.plan.target < state.plan.minTotal || state.plan.target > state.plan.maxTotal);
    const showSummary = receiptReady || hasProgress() || state.status === 'done';
    el('receiptSummary').hidden = !showSummary;
    el('receiptSummary').textContent = showSummary && validTotals
      ? `${outsideRange ? 'Maqsad oralig‘idan tashqarida • eng yaqin mumkin' : 'Reja'}: ${fmtSum(sum('total'))} so‘m${outsideRange ? ` • mumkin: ${fmtSum(state.plan.minTotal)}–${fmtSum(state.plan.maxTotal)} • maqsad ${fmtSum(state.plan.target)}` : ''}${hasTarget ? ` • farq ${fmtSum(round2(sum('total') - currentTarget))}` : ''}`
      : hasProgress() ? `Tayyorlanmoqda: ${fmtSum(state.items.reduce((a, i) => a + (i.placed || 0), 0))} dona` : '';
    if (state.status === 'done' && state.pricingResult) el('receiptSummary').textContent = `${state.incomplete ? 'TO‘LIQ EMAS • ' : 'Yig‘ib bo‘lindi • '}Jami: ${fmtSum(state.pricingResult.total)} so‘m${state.receiptTarget != null ? ` • farq ${fmtSum(round2(state.pricingResult.total - state.receiptTarget))}` : ''}`;

    const totalUnits = state.items.reduce((a, i) => a + i.qty, 0); // planned units (skipped items have 0)
    const doneUnits = state.items.reduce((a, i) => a + Math.min(i.placed, i.qty), 0);
    el('bar').style.width = totalUnits ? `${(doneUnits / totalUnits) * 100}%` : '0';
    const statusText = { idle: 'Tayyor', running: 'Ishlamoqda…', paused: 'Pauza', stopped: 'To‘xtatilgan', done: 'Tugadi' }[state.status];
    // While paused, show exactly what is being held
    const held =
      paused && state.current
        ? ` • ushlab turilibdi: «${state.current.name}» — ${state.current.placed} / ${state.current.need} kod belgilangan, Подбор ochiq`
        : paused && capturing
          ? ' • «Olish» to‘xtab turibdi'
          : '';
    const readNote = capturing && captureProgress
      ? ` • Olish: ${captureProgress.read}${captureProgress.total ? ` / ${captureProgress.total}` : ''} qator o‘qildi`
      : '';
    el('progress').textContent = (state.items.length
      ? `${statusText} • tovar ${Math.min(state.index + (busy ? 1 : 0), state.items.length)} / ${state.items.length} • dona ${doneUnits} / ${totalUnits}${liveText && busy ? ` • ${liveText}` : ''}`
      : `${statusText}${liveText && busy ? ` • ${liveText}` : ''}`) + readNote + held;

    const icon = { pending: '•', ok: '✓', kam: '⚠', xato: '✗', skip: '–' };
    el('list').innerHTML = state.items
      .map(
        (i, n) =>
          `<div class="item${n === state.index && state.status !== 'done' ? ' cur' : ''}${i.status === 'skip' ? ' skip' : ''}" title="${escapeHtml(i.note || `${i.name} — omborda ${i.stock ?? i.qty}, narx ${fmtSum(i.price || 0)}`)}"><span>${icon[i.status] || '•'} ${escapeHtml(i.name)}</span><span>${i.placed}/${i.qty}</span></div>`
      )
      .join('');
    const cur = el('list').querySelector('.cur');
    if (cur) cur.scrollIntoView({ block: 'nearest' });

    el('log').innerHTML = state.log
      .slice(-80)
      .map((l) => `<div class="${l.level}">[${l.time}] ${escapeHtml(l.text)}</div>`)
      .join('');
    el('log').scrollTop = el('log').scrollHeight;

    btn('checkCode').disabled = checking || !!checkBusyReason();
    btn('checkCode').textContent = checking ? 'Tekshirilmoqda…' : 'Tekshirish';
    el('checkResult').innerHTML = checkResults.map((r) => {
      const seen = state.seenCodes?.[r.code];
      const used = state.usedCodes?.[r.code];
      const verdict = r.pending ? '… tekshirilmoqda'
        : r.verdict === 'available' ? `✓ Sotsa bo‘ladi — oxirgi operatsiya ulgurji${r.stirMatch ? `, STIR ${escapeHtml(r.lastStir)} bizniki` : ''}`
          : r.verdict === 'sold' ? (r.stirMatch === false
            ? `✗ Sotib bo‘lmaydi — oxirgi egasi boshqa STIR: ${escapeHtml(r.lastStir || '?')}`
            : '✗ Sotilgan — oxirgi operatsiya chakana')
            : `? Aniqlanmadi${r.reason ? `: ${escapeHtml(r.reason)}` : ''}`;
      const soliq = r.pending ? '' : `<div class="muted">soliq.uz: ${r.product ? `«${escapeHtml(r.product)}»` : 'mahsulot nomi topilmadi'}${r.steps ? ` • ${r.steps} ta operatsiya, oxirgisi ${r.steps}-o‘rinda: ${escapeHtml(r.last?.operation || r.operation || '')}${r.last?.date ? ` (${escapeHtml(r.last.date)}${r.last.company ? `, ${escapeHtml(r.last.company)}` : ''})` : ''}` : ''}</div>`;
      const oneC = (used ? `<div class="muted">1C: bu kod chekka o‘tkazilgan («${escapeHtml(used.name)}», ${escapeHtml(used.time)}) — keyingi cheklarga olinmaydi</div>` : '') + (seen
        ? `<div class="muted">1C: «${escapeHtml(seen.name)}» • inventarizatsiya qatori: ${seen.rows?.length ? seen.rows.map((n) => `№${escapeHtml(n)}`).join(', ') : '—'} • Podbor ro‘yxatida ${escapeHtml(seen.position)}-o‘rin</div>`
        : used ? '' : '<div class="muted">1C: bu kod Podborda hali uchramagan</div>');
      const cls = r.pending ? '' : r.verdict === 'available' ? ' good' : r.verdict === 'sold' ? ' sold' : ' unknown';
      return `<div class="res${cls}"><code>${escapeHtml(r.code)}</code><b>${verdict}</b>${soliq}${oneC}</div>`;
    }).join('');

    const bad = Array.isArray(state.badCodes) ? state.badCodes : [];
    const badDbCount = state.badDb && typeof state.badDb === 'object' ? Object.keys(state.badDb).length : 0;
    el('badBox').hidden = !bad.length && !badDbCount;
    el('badTitle').textContent = `Xato markirovkalar: ${bad.length} ta (olinmadi) • bazada jami ${badDbCount} ta`;
    el('bad').innerHTML = bad.map((b, n) => `<div class="entry"><b>${n + 1}. ${escapeHtml(b.name)}</b><div class="muted">Inventarizatsiya qatori: ${b.rows?.length ? b.rows.map((r) => `№${escapeHtml(r)}`).join(', ') : '—'} • Podbor ro‘yxatida ${escapeHtml(b.position)}-o‘rin • ${escapeHtml(b.reason)}</div><code>${escapeHtml(b.code)}</code></div>`).join('');
    pushView();
  }

  // Clicking the panel must not move the keyboard focus out of 1C (the run continues from where it was)
  root.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });

  root.addEventListener('click', async (e) => {
    if (!alive() || !restored) return;
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    switch (a) {
      case 'confirmAdded':
      case 'confirmNotAdded':
        await reconcileTransfer(a === 'confirmAdded');
        break;
      case 'confirmDocument': {
        if (activeTask || state.inFlight) break;
        const prefix = formPrefix(salesPodborButton());
        if (!prefix) break;
        const identity = documentIdentity(prefix);
        if (state.document?.number && (identity.number !== state.document.number || identity.date !== state.document.date)) { log('Saqlangan hujjat raqami/sanasi mos emas.', 'error'); break; }
        state.document = identity;
        state.documentNeedsAck = false;
        await save(); render();
        break;
      }
      case 'capture':
        if (activeTask === 'capture') toggleCapturePause();
        else capture().catch((err) => log(`Xato: ${err.message || err}`, 'error'));
        break;
      case 'all':
        applyAllPlan();
        save(); render();
        break;
      case 'clear':
        await clearUnstarted();
        break;
      case 'clearWarehouse':
        await clearWarehouse();
        break;
      case 'abort':
        await abortAll().catch((err) => log(`Xato: ${err.message || err}`, 'error'));
        break;
      case 'checkCode':
        await checkCodesManually().catch((err) => log(`Xato: ${err.message || err}`, 'error'));
        break;
      case 'clearBadDb': {
        if (activeTask) { log('Xato bazasini hozir tozalab bo‘lmaydi: joriy ish bajarilmoqda.', 'error'); break; }
        const n = state.badDb && typeof state.badDb === 'object' ? Object.keys(state.badDb).length : 0;
        state.badDb = {};
        log(`Xato markirovkalar bazasi tozalandi (${n} ta).`, 'warn');
        await save(); render();
        break;
      }
      case 'eposSale':
        await eposSale().catch((err) => log(`Xato: ${err.message || err}`, 'error'));
        break;
      case 'start':
        await primaryAction().catch((err) => log(`Xato: ${err.message || err}`, 'error'));
        break;
    }
  });

  el('captureLimit').addEventListener('input', (e) => {
    if (el('captureLimit').disabled || !restored || !alive()) return;
    state.captureLimit = e.target.value;
    save();
  });

  el('target').addEventListener('input', () => {
    if (el('target').disabled || !restored || !alive()) return;
    if (state.status !== 'done' && !state.legacyModeBlocked) { receiptReady = false; state.plan = null; }
    render();
  });
  for (const type of ['keydown', 'keypress', 'keyup']) root.addEventListener(type, e => {
    if (e.target.matches('input')) e.stopPropagation();
  });
  el('stir').addEventListener('input', (e) => {
    if (!restored || !alive()) return;
    state.stir = String(e.target.value || '').replace(/\D/g, '');
    save();
  });
  el('perItem').addEventListener('input', (e) => {
    if (el('perItem').disabled || !restored || !alive()) return;
    state.perItemLimit = e.target.value;
    if (state.status !== 'done' && !state.legacyModeBlocked) { receiptReady = false; state.plan = null; }
    save();
    render();
  });

  // Side panels connected to this tab (normally one per Chrome window)
  const ports = new Set();
  const sentHtml = new WeakMap(); // port → Map(name → markup it already has)
  let viewQueued = false;

  function sendView(port) {
    if (!sentHtml.has(port)) sentHtml.set(port, new Map());
    const sent = sentHtml.get(port);
    const els = {};
    for (const node of root.querySelectorAll('[data-el]')) {
      const name = node.dataset.el;
      const view = { hidden: !!node.hidden };
      if (node.tagName === 'INPUT') Object.assign(view, { value: node.value, disabled: !!node.disabled });
      // Containers keep their own children in the side panel; only leaves carry markup, and only when it changed
      else if (!node.querySelector('[data-el], [data-a]')) {
        view.style = node.getAttribute('style') || '';
        const html = node.innerHTML;
        if (sent.get(name) !== html) { view.html = html; sent.set(name, html); }
      }
      els[name] = view;
    }
    const buttons = {};
    for (const b of root.querySelectorAll('[data-a]')) buttons[b.dataset.a] = { text: b.textContent, disabled: !!b.disabled, hidden: !!b.hidden };
    try {
      port.postMessage({ type: 'view', version: VERSION, els, buttons, clock: state.clock, status: state.status });
    } catch {
      ports.delete(port);
      sentHtml.delete(port);
    }
  }

  /** Sends the rendered view to the side panel once per burst of renders. */
  function pushView() {
    if (viewQueued || !ports.size) return;
    viewQueued = true;
    Promise.resolve().then(() => {
      viewQueued = false;
      if (alive()) for (const port of ports) sendView(port);
    });
  }

  function onConnect(port) {
    if (port.name !== 'mk-panel' || !alive()) return;
    ports.add(port);
    port.onDisconnect.addListener(() => ports.delete(port));
    port.onMessage.addListener((msg) => {
      if (!alive() || !restored) return;
      if (msg?.type === 'click') {
        const b = btn(msg.a);
        if (b && !b.disabled && !b.hidden) b.click();
        // Bosish bajarilmasa sababi jurnalga yoziladi (Ishonch avtomatikasi tugmalarni ichkaridan bosadi)
        else if (msg.a === 'start' || msg.a === 'capture') log(`«${msg.a}» bosilmadi: ${!b ? 'tugma topilmadi' : b.disabled ? 'tugma o‘chiq' : 'tugma yashirin'} (holat: ${state.status}${activeTask ? ', ' + activeTask : ''})`, 'warn');
      } else if (msg?.type === 'input') {
        const input = el(msg.name);
        if (input?.tagName !== 'INPUT' || input.disabled) return;
        input.value = String(msg.value ?? '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    stateReady.then(() => {
      if (!alive() || !ports.has(port)) return;
      sentHtml.delete(port); // a fresh template has none of the rendered markup
      try { port.postMessage({ type: 'template', version: VERSION, html: PANEL_HTML }); } catch { ports.delete(port); return; }
      if (restored) render();
      sendView(port);
    });
  }

  function onMessage(msg, sender, respond) {
    if (!alive()) return;
    // The toolbar icon opens the side panel itself; these only report the running version
    if (['mkVersion', 'togglePanel', 'openPanel'].includes(msg?.type)) {
      stateReady.then(() => {
        if (!alive()) return;
        respond({ version: VERSION });
      });
      return true;
    }
    if (msg?.type === 'debuggerDetached' && restored && state.status === 'running') {
      state.status = 'paused';
      log('Chrome debugger uzildi. Pauza qilindi.', 'warn');
    }
  }
  chrome.runtime.onMessage.addListener(onMessage);
  chrome.runtime.onConnect?.addListener(onConnect);

  // Restore saved state before accepting any user mutation or toolbar action.
  const stateReady = chrome.storage.local.get([STORE_KEY]).then(async (data) => {
    if (!alive()) return;
    if (data[STORE_KEY]) state = globalThis.ReceiptStateMigration.migrate(data[STORE_KEY], VERSION, emptyState, globalThis.ReceiptLedger);
    // Time between the last save and a page reload is unknown: it is not counted
    if (state.clock) state.clock.since = null;
    // Nothing runs right after loading: a saved «running» (the page or the program was closed mid-run) is a pause,
    // so «Davom» / «Tozalash» work instead of the panel staying locked
    if (state.status === 'running') state.status = 'paused';
    restored = true;
    await save();
    if (!alive()) return;
    render();
  }).catch((error) => {
    if (!alive()) return;
    restored = false; // Leave corrupt evidence untouched; never replace it with an empty ledger.
    el('progress').textContent = `Saqlangan holatni yuklab bo‘lmadi: ${error.message}`;
    pushView();
  });
})();
