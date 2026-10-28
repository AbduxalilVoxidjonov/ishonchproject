(function (root) {
  'use strict';
  const norm = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
  const suffix = '_ПроцентНаценки_i0';
  const label = 'Заполнить цены (себестоимость + %)';

  async function apply({ prefix, percent }, adapter) {
    const { document, isVisible, domClick, realClick, cdp, waitFor, parseNumber, assertDocument } = adapter;
    if (typeof prefix !== 'string' || !prefix ||
        !['number', 'string'].includes(typeof percent) || !String(percent).trim()) {
      throw new Error('Invalid markup percentage or document prefix');
    }
    percent = Number(percent);
    if (!Number.isFinite(percent) || percent < 0) throw new Error('Invalid markup percentage');
    const guard = async () => {
      if (await assertDocument() !== prefix) throw new Error('Wrong realization document');
    };
    const visible = id => {
      const node = document.getElementById(id);
      return node && isVisible(node) ? node : null;
    };
    const dialogs = () => [...document.querySelectorAll(`input[id$="${suffix}"]`)].filter(isVisible);
    const dialog = () => {
      const nodes = dialogs();
      if (nodes.length > 1) throw new Error('Ambiguous markup dialog');
      return nodes[0];
    };
    // Pick only a visible leaf: ancestors often repeat all submenu text.
    const leaf = (container, text) => [...container.querySelectorAll('*')].find(node =>
      isVisible(node) && norm(node.textContent) === text &&
      ![...node.querySelectorAll('*')].some(child => isVisible(child) && norm(child.textContent) === text));
    const wait = (fn, what) => waitFor(fn, adapter.timeout ?? 15000, what);
    await guard();
    let input = dialog();
    if (!input) {
      const toolbar = visible(`${prefix}_ТоварыЗаполнить`);
      if (!toolbar) throw new Error('Missing realization fill toolbar');
      await guard();
      await domClick(toolbar);
      const menu = await wait(() => visible(`${prefix}_ТоварыЗаполнить_submenu`), 'fill submenu');
      const item = leaf(menu, label);
      if (!item) throw new Error('Missing cost plus percentage menu item');
      await guard();
      await domClick(item);
      input = await wait(dialog, 'markup dialog');
    }
    const dialogPrefix = input.id.slice(0, -suffix.length);
    const liveInput = () => {
      const node = dialog();
      if (node && node.id !== `${dialogPrefix}${suffix}`) throw new Error('Markup dialog changed');
      return node;
    };
    const controls = () => {
      const input = liveInput();
      if (!input) return null;
      const rounding = visible(`${dialogPrefix}_ПорядокОкругления_i0`);
      const dropdown = visible(`${dialogPrefix}_ПорядокОкругления_DLB`);
      const roundUp = visible(`${dialogPrefix}_ВсегдаВБольшуюСторону`);
      const submit = visible(`${dialogPrefix}_ФормаЗаполнить`);
      if (!rounding || rounding.tagName !== 'INPUT' || !dropdown || !roundUp || !submit) {
        return null;
      }
      return { input, rounding, dropdown, roundUp, submit };
    };
    const selected = node => node.classList.contains('select');
    await wait(controls, 'Missing markup dialog control / dialog ready');
    await guard();
    await realClick(liveInput());
    const focused = () => {
      const node = liveInput();
      return node && !node.disabled && !node.readOnly && document.activeElement === node;
    };
    await wait(focused, 'markup input focus');
    await cdp({ type: 'selectAll', mac: adapter.mac });
    if (!focused()) throw new Error('Markup input focus lost before typing');
    await cdp({ type: 'text', text: String(percent) });
    await cdp({ type: 'key', key: 'Tab' });
    await wait(() => parseNumber(liveInput()?.value) === percent, 'markup percentage validation');
    let current = await wait(controls, 'markup dialog ready');
    if (parseNumber(current.rounding.value) !== 0.01) {
      await guard();
      await domClick(current.dropdown);
      const option = await wait(() => leaf(document, '0.01'), 'visible rounding option 0.01');
      await domClick(option);
    }
    await wait(() => parseNumber(controls()?.rounding.value) === 0.01, 'rounding validation');
    current = await wait(controls, 'markup dialog ready');
    if (selected(current.roundUp)) await domClick(current.roundUp);
    await wait(() => controls() && !selected(controls().roundUp), 'round-up disabled');
    await guard();
    current = await wait(controls, 'markup dialog ready');
    if (parseNumber(current.input.value) !== percent || parseNumber(current.rounding.value) !== 0.01 || selected(current.roundUp)) {
      throw new Error('Markup settings failed validation');
    }
    try {
      await domClick(current.submit);
      await wait(() => !liveInput(), 'markup dialog closed');
    } catch (cause) {
      const error = new Error('Markup submission outcome unknown; verify document before retrying', { cause });
      error.code = 'MARKUP_SUBMIT_UNKNOWN';
      throw error;
    }
    await guard();
    const result = await wait(() => {
      const totalInput = visible(`${prefix}_ИтогиВсего_i0`);
      if (!totalInput || totalInput.tagName !== 'INPUT' || !String(totalInput.value).trim()) return null;
      const total = parseNumber(totalInput.value);
      return Number.isFinite(total) && total >= 0 ? { total } : null;
    }, 'realization grand total ready');
    await guard();
    const { total } = result;
    return { percent, rounding: 0.01, total };
  }
  const api = { apply };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ReceiptMarkup = api;
})(globalThis);
