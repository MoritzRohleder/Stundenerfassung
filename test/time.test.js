'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../src/utils/time');

test('parseClock liest verschiedene Formate', () => {
  assert.equal(t.parseClock('8'), 480);
  assert.equal(t.parseClock('8:15'), 495);
  assert.equal(t.parseClock('08:15'), 495);
  assert.equal(t.parseClock('0815'), 495);
  assert.equal(t.parseClock('815'), 495);
  assert.equal(t.parseClock('8.15'), 495);
  assert.equal(t.parseClock('23:59'), 1439);
  assert.equal(t.parseClock('24:00'), null);
  assert.equal(t.parseClock('24:00', { allow24: true }), 1440);
  assert.equal(t.parseClock('8:60'), null);
  assert.equal(t.parseClock('25'), null);
  assert.equal(t.parseClock('abc'), null);
  assert.equal(t.parseClock(''), null);
});

test('Dauer wird als h:mm und dezimal formatiert', () => {
  assert.equal(t.formatHM(450), '7:30');
  assert.equal(t.formatDec(450), '7,50');
  assert.equal(t.formatDec(20), '0,33');
  assert.equal(t.formatSignedHM(75), '+1:15');
  assert.equal(t.formatSignedHM(-30), '−0:30');
  assert.equal(t.formatSignedHM(0), '±0:00');
  assert.equal(t.formatClock(495), '08:15');
});

test('parseDuration liest Stunden und Vorzeichen', () => {
  assert.equal(t.parseDuration('40'), 2400);
  assert.equal(t.parseDuration('38,5'), 2310);
  assert.equal(t.parseDuration('38.5'), 2310);
  assert.equal(t.parseDuration('38:30'), 2310);
  assert.equal(t.parseDuration('0'), 0);
  assert.equal(t.parseDuration('-2'), null);
  assert.equal(t.parseDuration('-2,5', { allowNegative: true }), -150);
  assert.equal(t.parseDuration('−0:45', { allowNegative: true }), -45);
  assert.equal(t.parseDuration('+1:30', { allowNegative: true }), 90);
  assert.equal(t.parseDuration('1:75'), null);
  assert.equal(t.parseDuration(''), null);
});

test('parseDays erlaubt nur ganze und halbe Tage', () => {
  assert.equal(t.parseDays('30'), 30);
  assert.equal(t.parseDays('12,5'), 12.5);
  assert.equal(t.parseDays('12,3'), null);
  assert.equal(t.parseDays('-1'), null);
  assert.equal(t.formatDays(12.5), '12,5');
});
