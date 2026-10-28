// Runs in the my.soliq.uz page itself (MAIN world). The 1C extension asks for checks while the 1C tab
// is in front, so this page works hidden: it is told it is visible, and requestAnimationFrame — which
// a hidden tab never fires — falls back to a timer while the tab is really hidden.
(function () {
  if (window.__mxikKeepActive) return;
  window.__mxikKeepActive = true;
  const proto = Document.prototype;
  const realHidden = Object.getOwnPropertyDescriptor(proto, "hidden")?.get;
  const isReallyHidden = () => (realHidden ? realHidden.call(document) : false);
  try {
    Object.defineProperty(proto, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(proto, "visibilityState", { configurable: true, get: () => "visible" });
  } catch (_) { /* keep the defaults */ }
  document.addEventListener("visibilitychange", e => e.stopImmediatePropagation(), true);
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  // timer-based frames get negative ids so they never collide with real ones
  window.requestAnimationFrame = cb => (isReallyHidden() ? -setTimeout(() => cb(performance.now()), 16) : raf(cb));
  window.cancelAnimationFrame = id => (id < 0 ? clearTimeout(-id) : caf(id));
})();
