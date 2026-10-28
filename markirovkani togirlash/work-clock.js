/* Working-time clock of the current task (Olish or one receipt run).
 * Only time spent in the "running" status counts: pauses are excluded.
 * The clock is plain JSON so it persists inside the saved state and can be
 * shown by the side panel, which ticks it every second on its own.
 */
(function (root) {
  'use strict';
  const LABELS = { run: 'Chek', capture: 'Olish' };

  function start(task, now = Date.now()) {
    return { task, startedAt: now, activeMs: 0, since: now, endedAt: null };
  }

  // Moves the clock along with the task status; returns the same object.
  function sync(clock, status, now = Date.now()) {
    if (!clock || clock.endedAt != null) return clock;
    if (status === 'running') {
      clock.since ??= now;
      return clock;
    }
    if (clock.since != null) {
      clock.activeMs += Math.max(0, now - clock.since);
      clock.since = null;
    }
    if (status === 'done' || status === 'idle' || status === 'stopped') clock.endedAt = now;
    return clock;
  }

  function elapsed(clock, now = Date.now()) {
    if (!clock) return 0;
    return Math.max(0, (clock.activeMs || 0) + (clock.since != null ? now - clock.since : 0));
  }

  function duration(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  }

  function text(clock, status, now = Date.now()) {
    if (!clock) return '';
    const begun = new Date(clock.startedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const state = clock.endedAt != null ? ' • tugadi' : status === 'paused' ? ' • pauza (vaqt hisoblanmaydi)' : '';
    return `⏱ ${LABELS[clock.task] || clock.task}: ${duration(elapsed(clock, now))} ishladi • ${begun} da boshlandi${state}`;
  }

  const api = Object.freeze({ start, sync, elapsed, duration, text });
  root.WorkClock = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
