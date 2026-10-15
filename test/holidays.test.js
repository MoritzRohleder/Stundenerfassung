'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { easterSunday, holidaysOf, holidayName, STATES } = require('../src/services/holidays');

test('Ostersonntag', () => {
  assert.equal(easterSunday(2024), '2024-03-31');
  assert.equal(easterSunday(2025), '2025-04-20');
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
  assert.equal(easterSunday(2038), '2038-04-25');
});

test('Bundesweite Feiertage 2026', () => {
  const h = holidaysOf(2026, 'NI');
  assert.equal(h.get('2026-04-03'), 'Karfreitag');
  assert.equal(h.get('2026-04-06'), 'Ostermontag');
  assert.equal(h.get('2026-05-14'), 'Christi Himmelfahrt');
  assert.equal(h.get('2026-05-25'), 'Pfingstmontag');
  assert.equal(h.get('2026-10-03'), 'Tag der Deutschen Einheit');
  assert.equal(h.get('2026-10-31'), 'Reformationstag');
  assert.equal(h.size, 10);
});

test('Länderspezifische Feiertage', () => {
  assert.equal(holidayName('2026-06-04', 'NW'), 'Fronleichnam');
  assert.equal(holidayName('2026-06-04', 'NI'), null);
  assert.equal(holidayName('2026-11-18', 'SN'), 'Buß- und Bettag');
  assert.equal(holidayName('2026-11-18', 'BY'), null);
  assert.equal(holidayName('2026-01-06', 'BY'), 'Heilige Drei Könige');
  assert.equal(holidayName('2026-03-08', 'BE'), 'Internationaler Frauentag');
  assert.equal(holidayName('2026-09-20', 'TH'), 'Weltkindertag');
  assert.equal(holidayName('2026-11-01', 'BW'), 'Allerheiligen');
  assert.equal(holidayName('2026-08-15', 'SL'), 'Mariä Himmelfahrt');
  assert.equal(holidayName('2026-08-15', 'BY'), null);
  assert.equal(holidayName('2026-12-24', 'BY'), null);
  assert.equal(holidayName('2017-10-31', 'BY'), 'Reformationstag');
});

test('Anzahl Feiertage 2026 je Bundesland', () => {
  const expected = { BW: 12, BY: 12, BE: 10, BB: 12, HB: 10, HH: 10, HE: 10, MV: 11, NI: 10, NW: 11, RP: 11, SL: 12, SN: 11, ST: 11, SH: 10, TH: 11 };
  for (const code of Object.keys(STATES)) {
    assert.equal(holidaysOf(2026, code).size, expected[code], code);
  }
});
