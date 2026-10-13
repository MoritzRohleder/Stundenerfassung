'use strict';

const { isoWeekday, eachDay, addDays, toISO, daysInMonth } = require('../utils/date');
const { computeBreak } = require('./breaks');
const { holidayName } = require('./holidays');
const { scheduleFor, dailyTarget } = require('./schedules');

// Ist, Soll, Saldo und Überstundenkonto (Spec 6.1–6.5).

const ABSENCE_TYPES = {
  vacation: { label: 'Urlaub', short: 'U', reducesTarget: true, halfAllowed: true },
  sick: { label: 'Krank', short: 'K', reducesTarget: true, halfAllowed: false },
  comp_time: { label: 'Freizeitausgleich', short: 'FA', reducesTarget: false, halfAllowed: true },
  other_paid: { label: 'Sonstige Freistellung', short: 'S', reducesTarget: true, halfAllowed: true },
};

const LONG_DAY_MIN = 10 * 60;

/**
 * Kontext eines Nutzers für alle Berechnungen.
 * blocks/days sind die gespeicherten Datensätze des Nutzers.
 */
function buildContext({ user, blocks, days, schedules, entitlements = [], today }) {
  const blocksByDate = new Map();
  for (const b of blocks) {
    if (!blocksByDate.has(b.date)) blocksByDate.set(b.date, []);
    blocksByDate.get(b.date).push(b);
  }
  for (const list of blocksByDate.values()) list.sort((a, b) => a.start_min - b.start_min);
  const daysByDate = new Map(days.map((d) => [d.date, d]));
  const dates = [...blocksByDate.keys(), ...daysByDate.keys()].sort();
  return {
    user,
    schedules,
    entitlements,
    today,
    blocksByDate,
    daysByDate,
    firstDate: dates[0] || null,
    lastDate: dates[dates.length - 1] || null,
    cache: new Map(),
  };
}

/** Sollzeit laut Modell an einem Tag, ohne Feiertag/Abwesenheit. */
function modelTarget(ctx, iso) {
  return dailyTarget(scheduleFor(ctx.schedules, iso), isoWeekday(iso));
}

/** Ob an einem Tag überhaupt Soll anfällt (Arbeitstag, kein Feiertag). */
function hasTarget(ctx, iso) {
  return modelTarget(ctx, iso) > 0 && !holidayName(iso, ctx.user.state);
}

/** Alle Werte eines Tages. */
function dayResult(ctx, iso) {
  if (ctx.cache.has(iso)) return ctx.cache.get(iso);
  const { user, today } = ctx;
  const blocks = ctx.blocksByDate.get(iso) || [];
  const day = ctx.daysByDate.get(iso) || null;
  const manualBreak = day && day.manual_break_min !== undefined ? day.manual_break_min : null;
  const br = computeBreak(blocks, manualBreak);

  const weekday = isoWeekday(iso);
  const holiday = holidayName(iso, user.state);
  const schedule = scheduleFor(ctx.schedules, iso);
  const target = dailyTarget(schedule, weekday);
  const isWorkday = Boolean(schedule && schedule.workdays.includes(weekday));
  const tracked = Boolean(user.tracking_start && iso >= user.tracking_start);

  const absenceType = day && day.absence_type ? day.absence_type : null;
  const absenceFraction = absenceType ? day.absence_fraction : 0;
  const share = absenceType && ABSENCE_TYPES[absenceType].reducesTarget ? absenceFraction : 0;

  const soll = !tracked || holiday ? 0 : Math.round(target * (1 - share));
  const ist = br.istMin;
  const saldo = tracked ? ist - soll : 0;

  let status;
  if (iso < today) status = 'past';
  else if (iso === today) status = 'today';
  else status = 'future';

  // Minusstunden zählen erst nach Ablauf des Tages (E-23).
  let counted = 0;
  if (tracked) {
    if (status === 'past') counted = saldo;
    else if (status === 'today') counted = Math.max(0, saldo);
  }

  const hints = [];
  if (br.breakTooShort) hints.push(`Mindestpause unterschritten (${br.requiredBreakMin} min nötig)`);
  if (ist > LONG_DAY_MIN) hints.push('Mehr als 10 Stunden gearbeitet');
  if (blocks.length && holiday) hints.push('Arbeit an einem Feiertag');
  else if (blocks.length && !isWorkday) hints.push('Arbeit an einem freien Tag');
  if (blocks.length && absenceType && absenceFraction === 1) hints.push('Zeiten an einem ganzen Abwesenheitstag');

  const result = {
    date: iso,
    weekday,
    blocks,
    day,
    note: day && day.note ? day.note : '',
    ...br,
    holiday,
    isWorkday,
    target,
    tracked,
    absenceType,
    absenceFraction,
    soll,
    ist,
    saldo,
    counted,
    status,
    hints,
    isEmpty: blocks.length === 0 && !day,
  };
  ctx.cache.set(iso, result);
  return result;
}

/** Summen über einen Zeitraum (einschließlich). */
function summarize(ctx, from, to) {
  const sum = {
    from,
    to,
    ist: 0,
    soll: 0,
    sollElapsed: 0,
    saldo: 0,
    vacationDays: 0,
    sickDays: 0,
    compDays: 0,
    otherDays: 0,
    workedDays: 0,
  };
  for (const iso of eachDay(from, to)) {
    const r = dayResult(ctx, iso);
    sum.ist += r.ist;
    sum.soll += r.soll;
    if (r.status === 'past') sum.sollElapsed += r.soll;
    sum.saldo += r.counted;
    if (r.blocks.length) sum.workedDays += 1;
    if (r.absenceType === 'vacation') sum.vacationDays += r.absenceFraction;
    if (r.absenceType === 'sick') sum.sickDays += r.absenceFraction;
    if (r.absenceType === 'comp_time') sum.compDays += r.absenceFraction;
    if (r.absenceType === 'other_paid') sum.otherDays += r.absenceFraction;
  }
  return sum;
}

/** Überstundenkonto am Ende des Tages iso (nur gewertete Tage bis heute). */
function overtimeAt(ctx, iso) {
  const { user } = ctx;
  if (!user.tracking_start) return 0;
  let total = user.overtime_start_minutes || 0;
  const end = iso < ctx.today ? iso : ctx.today;
  if (end < user.tracking_start) return total;
  for (const d of eachDay(user.tracking_start, end)) total += dayResult(ctx, d).counted;
  return total;
}

/** Überstundenkonto am Ende jedes Monats eines Jahres (Index 0 = Januar). */
function overtimeByMonth(ctx, year) {
  const out = [];
  let running = overtimeAt(ctx, toISO(year - 1, 12, 31));
  const { user } = ctx;
  for (let m = 1; m <= 12; m++) {
    const from = toISO(year, m, 1);
    const to = toISO(year, m, daysInMonth(year, m));
    if (user.tracking_start && from <= ctx.today && to >= user.tracking_start) {
      const start = from < user.tracking_start ? user.tracking_start : from;
      const end = to < ctx.today ? to : ctx.today;
      if (start <= end) for (const d of eachDay(start, end)) running += dayResult(ctx, d).counted;
      out.push(running);
    } else {
      out.push(null);
    }
  }
  return out;
}

/** Tage der Woche (Mo–So), in der iso liegt. */
function weekDays(iso) {
  const monday = addDays(iso, 1 - isoWeekday(iso));
  return eachDay(monday, addDays(monday, 6));
}

module.exports = {
  ABSENCE_TYPES,
  buildContext,
  modelTarget,
  hasTarget,
  dayResult,
  summarize,
  overtimeAt,
  overtimeByMonth,
  weekDays,
};
