/* Durable receipt migration. Draft cleanup must never reset ledger evidence. */
(function (root) {
  'use strict';
  const SCHEMA_VERSION = 1;
  function migrate(saved, version, defaults, ledger) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !Array.isArray(saved.items)) throw new Error('Invalid saved receipt');
    if (saved.schemaVersion !== undefined && (!Number.isInteger(saved.schemaVersion) || saved.schemaVersion < 0 || saved.schemaVersion > SCHEMA_VERSION)) throw new Error('Unsupported saved schema');
    const state = { ...defaults(), ...saved };
    state.items = saved.items.map(item => ledger.normalizeItem({ ...item }));
    if (saved.history !== undefined && !Array.isArray(saved.history)) throw new Error('Invalid receipt history');
    if (saved.log !== undefined && !Array.isArray(saved.log)) throw new Error('Invalid receipt log');
    if (!['idle','running','paused','stopped','done'].includes(state.status)) throw new Error('Invalid receipt status');
    if (!Number.isInteger(state.index) || state.index < 0 || state.index > state.items.length) throw new Error('Invalid receipt cursor');
    if (state.inFlight && (typeof state.inFlight !== 'object' || !Number.isInteger(state.inFlight.index) || !state.items[state.inFlight.index] || !Number.isFinite(state.inFlight.confirmedPlaced) || state.inFlight.confirmedPlaced < state.items[state.inFlight.index].placed || state.inFlight.confirmedPlaced > state.items[state.inFlight.index].qty)) throw new Error('Invalid transfer evidence');
    const progress = !!state.inFlight || state.items.some(i => i.placed > 0 || i.deducted > 0);
    const completed = state.status === 'done' && !state.inFlight && !state.legacyModeBlocked;
    const active = !completed && (progress || !!state.document || !!state.current || state.phase === 'pricing' || !!state.documentNeedsAck || !!state.legacyModeBlocked);
    const upgrade = saved.version !== version || saved.schemaVersion !== SCHEMA_VERSION;
    const legacy = state.mode === 'unmarked';
    state.mode = 'marked';
    state.stepMode = false;
    state.legacyModeBlocked = !!state.legacyModeBlocked || (legacy && progress && !completed);
    if ((upgrade && !active) || (legacy && !active)) {
      state.plan = null;
      state.log = [];
      state.index = 0;
      state.current = null;
      state.status = 'idle';
      state.phase = 'transfer';
      state.document = null;
      state.documentNeedsAck = false;
      state.pricingPercent = null;
      state.receiptTarget = null;
      state.pricingResult = null;
      state.incomplete = false;
      state.items.forEach(i => {
        if (completed) ledger.next(i);
        i.qty = 0; i.status = 'pending'; i.note = '';
      });
    }
    if (state.status === 'running' || state.legacyModeBlocked || (upgrade && active)) state.status = 'paused';
    state.documentNeedsAck = !!state.documentNeedsAck || !!state.document || !!state.inFlight || (upgrade && active);
    state.version = version;
    state.schemaVersion = SCHEMA_VERSION;
    return state;
  }
  const api = Object.freeze({ migrate, SCHEMA_VERSION });
  root.ReceiptStateMigration = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
