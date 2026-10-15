'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildContext, dayResult, summarize, overtimeAt, hasTarget, showsDaySaldo, showsDaySoll } = require('../src/services/worktime');
const { monthView } = require('../src/services/overview');
const { Client, start, registerAndSetup } = require('./helpers');

// F9 (Feiertage nicht angerechnet) und F10 (Wochensoll).

const h = (hh, mm = 0) => hh * 60 + mm;
const user = { id: 'u', state: 'NI', tracking_start: '2026-09-01', overtime_start_minutes: 0, vacation_days_default: 30 };
const blk = (date, hours) => ({ user_id: 'u', date, start_min: h(8), end_min: h(8) + hours * 60 });
const day = (date, extra) => ({ user_id: 'u', date, manual_break_min: 0, absence_type: null, absence_fraction: null, note: '', ...extra });
const model = (extra) => ({ id: 's', valid_from: null, valid_to: null, weekly_min: h(24), workdays: [1, 2, 3], ...extra });

function ctx({ schedule, blocks = [], days = [], today = '2027-06-01' }) {
  // Manuelle Pause 0 bei allen Tagen mit Zeiten, damit Ist = Blockzeit
  const breakDays = blocks.map((b) => day(b.date, {})).filter((d) => !days.some((x) => x.date === d.date));
  return buildContext({ user, blocks, days: [...days, ...breakDays], schedules: [schedule], entitlements: [], today });
}

test('F9: Feiertag nicht angerechnet – normales Tagessoll', () => {
  const credited = ctx({ schedule: model({ workdays: [1, 2, 3, 4, 5], weekly_min: h(20) }) });
  const notCredited = ctx({ schedule: model({ workdays: [1, 2, 3, 4, 5], weekly_min: h(20), holidays_credited: false }) });
  // 25.12.2026 ist ein Freitag
  assert.equal(dayResult(credited, '2026-12-25').soll, 0);
  assert.equal(dayResult(notCredited, '2026-12-25').soll, h(4));
  assert.equal(dayResult(notCredited, '2026-12-25').holidayCredited, false);
  assert.equal(dayResult(notCredited, '2026-12-25').saldo, -h(4), 'nicht gearbeitet → Minus, muss nachgeholt werden');
  assert.equal(hasTarget(credited, '2026-12-25'), false);
  assert.equal(hasTarget(notCredited, '2026-12-25'), true, 'Urlaub am Feiertag möglich');
  assert.equal(summarize(notCredited, '2026-12-21', '2026-12-27').soll, h(20));
  assert.equal(summarize(credited, '2026-12-21', '2026-12-27').soll, h(16));
});

test('F10: Wochensoll – egal an welchen Tagen gearbeitet wird', () => {
  // KW 42/2026: übliche Tage Mo–Mi, gearbeitet Mo, Do, Fr je 8 h
  const c = ctx({ schedule: model({ distribution: 'weekly' }), blocks: [blk('2026-10-12', 8), blk('2026-10-15', 8), blk('2026-10-16', 8)] });
  const week = summarize(c, '2026-10-12', '2026-10-18');
  assert.equal(week.ist, h(24));
  assert.equal(week.soll, h(24));
  assert.equal(week.saldo, 0);
  const wed = dayResult(c, '2026-10-14');
  assert.equal(showsDaySaldo(wed), false, 'kein Tagessaldo beim Wochensoll');
  assert.equal(showsDaySoll(wed), false);
  assert.equal(wed.hints.length, 0);
  assert.equal(dayResult(c, '2026-10-15').hints.includes('Arbeit an einem freien Tag'), false);
  assert.equal(overtimeAt(c, '2026-10-18') - overtimeAt(c, '2026-10-11'), 0, 'Woche ändert das Konto nicht');
});

test('F10: Minus erst nach Ablauf der Woche, Plus sofort', () => {
  const schedule = model({ distribution: 'weekly' });
  const blocks = [blk('2026-10-12', 8), blk('2026-10-13', 8)];
  // Mittwoch der Woche: 16 h von 24 h → noch kein Minus
  const during = ctx({ schedule, blocks, today: '2026-10-14' });
  assert.equal(summarize(during, '2026-10-12', '2026-10-18').saldo, 0);
  // Nach der Woche: −8 h
  const after = ctx({ schedule, blocks, today: '2026-10-19' });
  assert.equal(summarize(after, '2026-10-12', '2026-10-18').saldo, -h(8));
  // Plus während der Woche zählt sofort (auf heute gebucht)
  const plus = ctx({ schedule, blocks: [blk('2026-10-12', 10), blk('2026-10-13', 10), blk('2026-10-14', 6)], today: '2026-10-14' });
  assert.equal(dayResult(plus, '2026-10-14').counted, h(2));
  assert.equal(summarize(plus, '2026-10-12', '2026-10-18').saldo, h(2));
});

test('F10: Woche über die Monatsgrenze wird nach den üblichen Tagen aufgeteilt', () => {
  // KW 40/2026: Mo 28.09.–So 04.10.; übliche Tage Mo–Mi liegen alle im September
  const c = ctx({ schedule: model({ distribution: 'weekly' }), blocks: [blk('2026-09-28', 8), blk('2026-09-29', 8), blk('2026-10-01', 8)] });
  assert.equal(summarize(c, '2026-09-28', '2026-09-30').soll, h(24));
  assert.equal(summarize(c, '2026-10-01', '2026-10-04').soll, 0);
  const oct = monthView(c, 2026, 10);
  const kw40 = oct.rows.find((r) => r.kind === 'week' && r.week === 40);
  assert.equal(kw40.soll, 0);
  assert.equal(kw40.saldo, h(8), 'Do im Oktober gearbeitet');
  assert.equal(summarize(c, '2026-09-28', '2026-10-04').saldo, 0, 'Woche insgesamt ausgeglichen');
});

test('F10: Urlaub am üblichen Tag mindert das Wochensoll', () => {
  const c = ctx({
    schedule: model({ distribution: 'weekly' }),
    days: [day('2026-10-13', { absence_type: 'vacation', absence_fraction: 1, manual_break_min: null })],
  });
  assert.equal(summarize(c, '2026-10-12', '2026-10-18').soll, h(16));
  assert.equal(hasTarget(c, '2026-10-15'), false, 'kein üblicher Tag → keine Abwesenheit');
});

test('F9 + F10: Werkstudent – 24 h pro Woche trotz Feiertag', () => {
  // Ostermontag 29.03.2027 ist ein üblicher Tag (Mo)
  const credited = ctx({ schedule: model({ distribution: 'weekly' }) });
  const student = ctx({ schedule: model({ distribution: 'weekly', holidays_credited: false }) });
  assert.equal(summarize(credited, '2027-03-29', '2027-04-04').soll, h(16));
  assert.equal(summarize(student, '2027-03-29', '2027-04-04').soll, h(24));
});

test('Arbeitszeitmodell mit Wochensoll über die Oberfläche', async (t) => {
  const s = await start('2026-10-14');
  t.after(() => s.stop());
  const c = new Client(s.base);
  await registerAndSetup(c);
  const form = await c.get('/einstellungen/arbeitszeit/neu');
  assert.match(form.text, /name="distribution" value="fixed" checked/, 'üblicher Fall vorausgewählt');
  assert.match(form.text, /name="holidays_credited" value="ja" checked/);

  const period = new URLSearchParams({ valid_from: '12.10.2026', weekly: '24', distribution: 'weekly', holidays_credited: 'nein' });
  for (const d of ['1', '2', '3']) period.append('workdays', d);
  assert.equal((await c.post('/einstellungen/arbeitszeit/neu', period, '/einstellungen/arbeitszeit/neu')).status, 302);
  const list = await c.get('/einstellungen/arbeitszeit');
  assert.match(list.text, /Wochensoll/);
  assert.match(list.text, /Feiertage nicht angerechnet/);

  const dayPage = await c.get('/tag/2026-10-15');
  assert.match(dayPage.text, /kein üblicher Arbeitstag/);
  assert.match(dayPage.text, /Wochensoll<\/dt>/);
  assert.match(dayPage.text, /Noch offen/);

  const backup = JSON.parse((await c.download('/daten/sicherung')).buffer.toString('utf8'));
  const p = backup.work_schedules.find((x) => x.valid_from === '2026-10-12');
  assert.equal(p.distribution, 'weekly');
  assert.equal(p.holidays_credited, false);
});
