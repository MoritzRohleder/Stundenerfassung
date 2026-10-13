'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildContext, dayResult, summarize, overtimeAt, overtimeByMonth } = require('../src/services/worktime');
const { vacationYear } = require('../src/services/vacation');
const { monthView, yearView } = require('../src/services/overview');

const h = (hh, mm = 0) => hh * 60 + mm;
const user = {
  id: 'u',
  state: 'NI',
  tracking_start: '2026-10-01',
  overtime_start_minutes: 120,
  vacation_days_default: 30,
};
const std = { id: 's', user_id: 'u', valid_from: null, valid_to: null, weekly_min: 40 * 60, workdays: [1, 2, 3, 4, 5] };

function ctx({ blocks = [], days = [], schedules = [std], entitlements = [], today = '2026-10-14', u = user } = {}) {
  return buildContext({ user: u, blocks, days, schedules, entitlements, today });
}
const blk = (date, s, e) => ({ user_id: 'u', date, start_min: s, end_min: e });
const day = (date, extra) => ({ user_id: 'u', date, manual_break_min: null, absence_type: null, absence_fraction: null, note: '', ...extra });

test('Beispiele aus Spec 8.2', () => {
  // 2026-10-12 ist ein Montag
  const c = ctx({
    blocks: [
      blk('2026-10-05', h(8), h(16, 45)),
      blk('2026-10-06', h(8), h(16, 45)),
      blk('2026-10-07', h(7, 30), h(12)),
      blk('2026-10-07', h(12, 45), h(16)),
      blk('2026-10-08', h(8), h(12)),
    ],
    days: [
      day('2026-10-06', { manual_break_min: 45 }),
      day('2026-10-08', { absence_type: 'vacation', absence_fraction: 0.5 }),
      day('2026-10-09', { absence_type: 'comp_time', absence_fraction: 1 }),
    ],
  });
  assert.equal(dayResult(c, '2026-10-05').saldo, 15);
  assert.equal(dayResult(c, '2026-10-06').saldo, 0);
  assert.equal(dayResult(c, '2026-10-07').saldo, -15);
  const half = dayResult(c, '2026-10-08');
  assert.equal(half.soll, h(4));
  assert.equal(half.saldo, 0);
  assert.equal(dayResult(c, '2026-10-09').saldo, -h(8), 'Freizeitausgleich baut Überstunden ab');
  const holiday = dayResult(c, '2026-10-03');
  assert.equal(holiday.holiday, 'Tag der Deutschen Einheit');
  assert.equal(holiday.soll, 0);
});

test('Urlaub und Krankheit senken das Soll, Feiertag hat Soll 0', () => {
  const c = ctx({ days: [day('2026-10-05', { absence_type: 'vacation', absence_fraction: 1 }), day('2026-10-06', { absence_type: 'sick', absence_fraction: 1 })] });
  assert.equal(dayResult(c, '2026-10-05').soll, 0);
  assert.equal(dayResult(c, '2026-10-06').soll, 0);
  assert.equal(dayResult(c, '2026-10-07').soll, h(8));
  assert.equal(dayResult(c, '2026-10-10').soll, 0, 'Samstag');
});

test('Tage vor dem Beginn der Erfassung zählen nicht', () => {
  const c = ctx({ blocks: [blk('2026-09-30', h(8), h(12))] });
  const r = dayResult(c, '2026-09-30');
  assert.equal(r.tracked, false);
  assert.equal(r.soll, 0);
  assert.equal(r.ist, h(4));
  assert.equal(r.counted, 0);
});

test('Minusstunden zählen erst nach Ablauf des Tages (E-23)', () => {
  const today = '2026-10-14';
  const minus = ctx({ blocks: [blk(today, h(8), h(10))], today });
  assert.equal(dayResult(minus, today).saldo, -h(6));
  assert.equal(dayResult(minus, today).counted, 0);
  const plus = ctx({ blocks: [blk(today, h(7), h(17))], today });
  assert.equal(dayResult(plus, today).counted, h(10) - 45 - h(8));
  const future = ctx({ today: '2026-10-13' });
  assert.equal(dayResult(future, '2026-10-14').counted, 0);
});

test('Überstundenkonto: Startsaldo + abgelaufene Tage', () => {
  // 01.10.–13.10.2026: Arbeitstage 1,2,5,6,7,8,9,12,13 (03.10. ist Samstag und Feiertag)
  const blocks = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13']
    .map((d) => blk(d, h(8), h(16, 30))); // 8:30 Block − 30 Pause = 8:00
  blocks.push(blk('2026-10-13', h(17), h(18))); // + zweiter Block → Lücke 30 min, Ist 9:30
  const c = ctx({ blocks, today: '2026-10-14' });
  assert.equal(dayResult(c, '2026-10-13').ist, h(9, 30));
  assert.equal(overtimeAt(c, '2026-10-13'), 120 + h(1, 30));
  // heute (14.10.) ohne Erfassung → kein Minus
  assert.equal(overtimeAt(c, '2026-10-14'), 120 + h(1, 30));
  // Monatsende in der Zukunft = Stand heute
  assert.equal(overtimeAt(c, '2026-10-31'), 120 + h(1, 30));
  const s = summarize(c, '2026-10-01', '2026-10-31');
  assert.equal(s.saldo, h(1, 30));
  assert.equal(s.soll, 22 * h(8) - 0, 'Oktober 2026 in NI: 22 Arbeitstage');
  assert.equal(s.sollElapsed, 9 * h(8));
});

test('Konto am Monatsende in der Jahresübersicht', () => {
  const c = ctx({ today: '2026-12-01', u: { ...user, tracking_start: '2026-11-30', overtime_start_minutes: 0 } });
  const months = overtimeByMonth(c, 2026);
  assert.equal(months[9], null, 'Oktober liegt vor dem Beginn');
  assert.equal(months[10], -h(8), '30.11. ohne Erfassung');
  assert.equal(months[11], -h(8), 'heute zählt kein Minus');
});

test('Zeitraum mit anderer Wochenarbeitszeit', () => {
  const period = { id: 'p', user_id: 'u', valid_from: '2026-10-12', valid_to: '2026-10-16', weekly_min: 20 * 60, workdays: [1, 2, 3, 4, 5] };
  const c = ctx({ schedules: [std, period] });
  assert.equal(dayResult(c, '2026-10-09').soll, h(8));
  assert.equal(dayResult(c, '2026-10-12').soll, h(4));
  assert.equal(dayResult(c, '2026-10-19').soll, h(8));
});

test('Urlaubskonto mit Übertrag und geplanten Tagen', () => {
  const days = [
    day('2026-10-05', { absence_type: 'vacation', absence_fraction: 1 }),
    day('2026-10-06', { absence_type: 'vacation', absence_fraction: 0.5 }),
    day('2026-12-21', { absence_type: 'vacation', absence_fraction: 1 }),
    day('2027-01-04', { absence_type: 'vacation', absence_fraction: 1 }),
  ];
  const entitlements = [{ user_id: 'u', year: 2026, days: 10, carryover_days: null }];
  const c = ctx({ days, entitlements });
  const v26 = vacationYear(c, 2026);
  assert.equal(v26.entitlement, 10);
  assert.equal(v26.carryover, 0);
  assert.equal(v26.taken, 2.5);
  assert.equal(v26.planned, 1);
  assert.equal(v26.rest, 7.5);
  const v27 = vacationYear(c, 2027);
  assert.equal(v27.entitlement, 30);
  assert.equal(v27.carryover, 7.5);
  assert.equal(v27.rest, 36.5);
  assert.equal(vacationYear(c, 2025), null);
});

test('Monatsübersicht mit Wochen-Zwischenzeilen', () => {
  const c = ctx();
  const v = monthView(c, 2026, 10);
  const weeks = v.rows.filter((r) => r.kind === 'week');
  assert.equal(v.rows.filter((r) => r.kind === 'day').length, 31);
  assert.deepEqual(weeks.map((w) => w.week), [40, 41, 42, 43, 44]);
  assert.equal(weeks[0].partial, true, 'KW 40 beginnt im September');
  assert.equal(weeks[0].soll, 2 * h(8), 'Do+Fr, Sa ist Feiertag');
  assert.equal(weeks[4].partial, true, 'KW 44 endet im November');
  assert.equal(weeks[1].partial, false);
});

test('Jahresübersicht', () => {
  const c = ctx();
  const y = yearView(c, 2026);
  assert.equal(y.months.length, 12);
  assert.equal(y.months[0].soll, 0, 'vor Beginn der Erfassung');
  assert.deepEqual(y.years, [2026]);
});
