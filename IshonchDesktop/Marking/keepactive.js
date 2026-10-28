// 1C (va soliq) sahifasi boshqa tab ochiq tursa ham "ko'rinib turgandek" ishlashi uchun:
// sahifaga doim ko'rinadi deyiladi, requestAnimationFrame esa haqiqatan yashirin bo'lsa taymerga o'tadi.
(() => {
  if (window.__mkKeepActive) return;
  window.__mkKeepActive = true;
  const proto = Document.prototype;
  const realHidden = Object.getOwnPropertyDescriptor(proto, 'hidden')?.get;
  const isReallyHidden = () => (realHidden ? realHidden.call(document) : false);
  try {
    Object.defineProperty(proto, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(proto, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(proto, 'webkitHidden', { configurable: true, get: () => false });
    Object.defineProperty(proto, 'webkitVisibilityState', { configurable: true, get: () => 'visible' });
  } catch { /* standart holat qoladi */ }
  document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
  document.addEventListener('webkitvisibilitychange', (e) => e.stopImmediatePropagation(), true);
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => (isReallyHidden() ? -setTimeout(() => cb(performance.now()), 16) : raf(cb));
  window.cancelAnimationFrame = (id) => (id < 0 ? clearTimeout(-id) : caf(id));
})();
