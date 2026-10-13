'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/utils/date');

test('Wochentage und Kalenderwochen nach ISO', () => {
  assert.equal(d.isoWeekday('2026-10-12'), 1);
  assert.equal(d.isoWeekday('2026-10-18'), 7);
  assert.deepEqual(d.isoWeek('2026-10-13'), { year: 2026, week: 42 });
  assert.deepEqual(d.isoWeek('2027-01-01'), { year: 2026, week: 53 });
  assert.deepEqual(d.isoWeek('2024-12-30'), { year: 2025, week: 1 });
  assert.equal(d.startOfWeek('2026-10-15'), '2026-10-12');
});

test('Datumsrechnung über Monats- und Schaltjahresgrenzen', () => {
  assert.equal(d.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(d.addDays('2027-02-28', 1), '2027-03-01');
  assert.equal(d.addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(d.daysInMonth(2028, 2), 29);
  assert.equal(d.diffDays('2026-01-01', '2026-12-31'), 364);
});

test('Datumseingaben werden geprüft', () => {
  assert.equal(d.isValidISO('2026-02-30'), false);
  assert.equal(d.isValidISO('2026-02-28'), true);
  assert.equal(d.parseDateInput('13.10.2026'), '2026-10-13');
  assert.equal(d.parseDateInput('31.04.2026'), null);
  assert.equal(d.formatDE('2026-10-13'), '13.10.2026');
});
