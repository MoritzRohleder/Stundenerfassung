'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeBreak } = require('../src/services/breaks');

const b = (s, e) => ({ start_min: s, end_min: e });
const h = (hh, mm = 0) => hh * 60 + mm;

test('Ein Block ohne Pause: automatische Pause, starr (E-21)', () => {
  assert.equal(computeBreak([b(h(8), h(14))]).istMin, h(6));
  const r610 = computeBreak([b(h(8), h(14, 10))]);
  assert.equal(r610.breakMin, 30);
  assert.equal(r610.istMin, h(5, 40));
  assert.equal(r610.breakSource, 'auto');
  assert.equal(computeBreak([b(h(8), h(17))]).istMin, h(8, 30));
  const r910 = computeBreak([b(h(8), h(17, 10))]);
  assert.equal(r910.breakMin, 45);
  assert.equal(r910.istMin, h(8, 25));
  assert.equal(r910.breakTooShort, false);
});

test('Ein Block mit manueller Pause', () => {
  const r = computeBreak([b(h(8), h(16, 45))], 45);
  assert.equal(r.breakSource, 'manual');
  assert.equal(r.istMin, h(8));
  assert.equal(r.breakTooShort, false);
  const short = computeBreak([b(h(8), h(17))], 15);
  assert.equal(short.istMin, h(8, 45));
  assert.equal(short.breakTooShort, true);
  assert.equal(computeBreak([b(h(8), h(16))], 0).istMin, h(8));
});

test('Mehrere Blöcke: Lücken sind die Pause', () => {
  const r = computeBreak([b(h(12, 45), h(16)), b(h(7, 30), h(12))]);
  assert.equal(r.breakSource, 'gaps');
  assert.equal(r.breakMin, 45);
  assert.equal(r.istMin, h(7, 45));
  assert.equal(r.breakTooShort, false);
});

test('Mehrere Blöcke mit zu kurzer Lücke: nur Hinweis (E-22)', () => {
  const r = computeBreak([b(h(7), h(12)), b(h(12, 10), h(17))]);
  assert.equal(r.istMin, h(9, 50));
  assert.equal(r.breakMin, 10);
  assert.equal(r.breakTooShort, true);
  assert.equal(r.requiredBreakMin, 45);
});

test('Kein Block', () => {
  const r = computeBreak([]);
  assert.equal(r.istMin, 0);
  assert.equal(r.breakSource, null);
});
