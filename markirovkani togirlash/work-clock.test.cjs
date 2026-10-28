'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const clock = require('./work-clock.js');

test('counts only running time and ends with the task', () => {
  const c = clock.start('run', 1000);
  assert.equal(clock.elapsed(c, 4000), 3000);
  clock.sync(c, 'paused', 5000);
  assert.equal(c.activeMs, 4000);
  assert.equal(clock.elapsed(c, 60000), 4000); // pause is not counted
  clock.sync(c, 'running', 70000);
  assert.equal(clock.elapsed(c, 72000), 6000);
  clock.sync(c, 'done', 73000);
  assert.equal(c.endedAt, 73000);
  assert.equal(clock.elapsed(c, 999999), 7000);
  clock.sync(c, 'running', 1000000); // an ended clock never restarts
  assert.equal(clock.elapsed(c, 2000000), 7000);
});

test('formats hours, minutes and seconds and labels the state', () => {
  assert.equal(clock.duration(0), '0:00:00');
  assert.equal(clock.duration(3723000), '1:02:03');
  const c = clock.start('capture', 0);
  assert.match(clock.text(c, 'running', 61000), /^⏱ Olish: 0:01:01 ishladi/);
  clock.sync(c, 'paused', 61000);
  assert.match(clock.text(c, 'paused', 99000), /0:01:01 ishladi .* pauza/);
  clock.sync(c, 'idle', 99000);
  assert.match(clock.text(c, 'idle', 99000), /tugadi$/);
  assert.equal(clock.text(null, 'idle'), '');
});
