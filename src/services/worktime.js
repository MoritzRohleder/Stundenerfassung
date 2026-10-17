'use strict';

const { isoWeekday, eachDay, addDays, toISO, daysInMonth } = require('../utils/date');
const { computeBreak } = require('./breaks');
const { holidayName, halfDayName } = require('./holidays');
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

/** Ob ein Modell Feiertage auf das Soll anrechnet (F9, Default ja). */
function holidaysCredited(schedule) {
  return !schedule || schedule.holidays_credited !== false;
}

/** Ob ein Modell ein Wochensoll statt fester Arbeitstage hat (F10, Default fest). */
function isWeekly(schedule) {
  return Boolean(schedule && schedule.distribution === 'weekly');
}

/**
 * Ob an einem Tag überhaupt Soll anfällt (üblicher Arbeitstag und kein angerechneter Feiertag).
 * Nur an solchen Tagen sind Abwesenheiten möglich.
 */
function hasTarget(ctx, iso) {
  const schedule = scheduleFor(ctx.schedules, iso);
  if (dailyTarget(schedule, isoWeekday(iso)) <= 0) return false;
  return !(holidayName(iso, ctx.user.state) && holidaysCredited(schedule));
}

/** Werte eines Tages ohne die Wertung fürs Überstundenkonto. */
function dayBase(ctx, iso) {
  const key = `base-${iso}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
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
  const weekly = isWeekly(schedule);
  const credited = holidaysCredited(schedule);
  // Heiligabend/Silvester: halber Arbeitstag – wie Feiertage nur, wenn das Modell Feiertage anrechnet.
  const halfDay = holiday ? null : halfDayName(iso);
  const halfDayCredited = Boolean(halfDay) && credited;
  const dayFactor = halfDayCredited ? 0.5 : 1;
  const tracked = Boolean(user.tracking_start && iso >= user.tracking_start);

  const absenceType = day && day.absence_type ? day.absence_type : null;
  const absenceFraction = absenceType ? day.absence_fraction : 0;
  const share = absenceType && ABSENCE_TYPES[absenceType].reducesTarget ? absenceFraction : 0;

  // Beim Wochensoll liegt das Soll rechnerisch auf den üblichen Tagen; so wird eine Woche
  // über eine Monatsgrenze nach den üblichen Tagen aufgeteilt (F10).
  const soll = !tracked || (holiday && credited) ? 0 : Math.round(target * dayFactor * (1 - share));
  const ist = br.istMin;
  const saldo = tracked ? ist - soll : 0;

  let status;
  if (iso < today) status = 'past';
  else if (iso === today) status = 'today';
  else status = 'future';

  const hints = [];
  if (br.breakTooShort) hints.push(`Mindestpause unterschritten (${br.requiredBreakMin} min nötig)`);
  if (ist > LONG_DAY_MIN) hints.push('Mehr als 10 Stunden gearbeitet');
  if (blocks.length && holiday) hints.push('Arbeit an einem Feiertag');
  else if (blocks.length && !isWorkday && !weekly) hints.push('Arbeit an einem freien Tag');
  if (blocks.length && absenceType && absenceFraction === 1) hints.push('Zeiten an einem ganzen Abwesenheitstag');

  const result = {
    date: iso,
    weekday,
    blocks,
    day,
    note: day && day.note ? day.note : '',
    ...br,
    holiday,
    holidayCredited: Boolean(holiday) && credited,
    halfDay,
    halfDayCredited,
    // Abwesenheit in Tagen: an einem halben Arbeitstag zählt ein freier Tag nur halb (z. B. ½ Urlaubstag).
    absenceDays: absenceType ? absenceFraction * dayFactor : 0,
    isWorkday,
    weekly,
    target,
    tracked,
    absenceType,
    absenceFraction,
    soll,
    ist,
    saldo,
    status,
    hints,
    isEmpty: blocks.length === 0 && !day,
  };
  ctx.cache.set(key, result);
  return result;
}

/**
 * Wertung der Tage einer Woche mit Wochensoll (F10): Map Datum → gewertete Minuten.
 * Nach Ablauf der Woche zählt jeder Tag mit Ist − Soll (Summe = Wochensaldo);
 * in der laufenden Woche zählt nur ein Plus gegenüber dem ganzen Wochensoll, gebucht auf heute.
 */
function weeklyCounted(ctx, iso) {
  const monday = addDays(iso, 1 - isoWeekday(iso));
  const key = `week-${monday}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  const days = eachDay(monday, addDays(monday, 6))
    .map((d) => dayBase(ctx, d))
    .filter((r) => r.weekly && r.tracked);
  const map = new Map();
  const sunday = addDays(monday, 6);
  if (sunday < ctx.today) {
    for (const r of days) map.set(r.date, r.ist - r.soll);
  } else if (monday <= ctx.today) {
    const plus = Math.max(0, days.reduce((sum, r) => sum + r.ist - r.soll, 0));
    if (plus) map.set(ctx.today, plus);
  }
  ctx.cache.set(key, map);
  return map;
}

/** Alle Werte eines Tages inklusive Wertung fürs Überstundenkonto (counted). */
function dayResult(ctx, iso) {
  if (ctx.cache.has(iso)) return ctx.cache.get(iso);
  const base = dayBase(ctx, iso);
  let counted = 0;
  if (base.weekly) {
    counted = weeklyCounted(ctx, iso).get(iso) || 0;
  } else if (iso === ctx.today && ctx.today && weeklyCounted(ctx, iso).has(iso)) {
    // Heute gilt ein festes Modell, aber ein Plus aus Wochensoll-Tagen dieser Woche wird auf heute gebucht.
    counted = weeklyCounted(ctx, iso).get(iso) + (base.tracked ? Math.max(0, base.saldo) : 0);
  } else if (base.tracked) {
    // Minusstunden zählen erst nach Ablauf des Tages (E-23).
    if (base.status === 'past') counted = base.saldo;
    else if (base.status === 'today') counted = Math.max(0, base.saldo);
  }
  const result = { ...base, counted };
  ctx.cache.set(iso, result);
  return result;
}

// --- Anzeige-Regeln für Tageszeilen (Oberfläche, Excel, PDF) ---

/** Tagessoll anzeigen? Beim Wochensoll steht das Soll nur in der Wochenzeile. */
function showsDaySoll(r) {
  return Boolean(r.soll) && !r.weekly;
}

/** Tagessaldo anzeigen? Nur für abgelaufene Tage bzw. heute mit Zeiten, nicht beim Wochensoll. */
function showsDaySaldo(r) {
  if (r.weekly || !r.tracked || !(r.soll || r.ist)) return false;
  return r.status === 'past' || (r.status === 'today' && r.blocks.length > 0);
}

/** Tag als frei darstellen (grau)? */
function isOffDay(r) {
  return r.holidayCredited || !r.isWorkday;
}

/** Ob an einem Tag nur ein halber Arbeitstag anfällt (Heiligabend/Silvester, F-15). */
function isHalfWorkday(ctx, iso) {
  return Boolean(halfDayName(iso)) && !holidayName(iso, ctx.user.state) && holidaysCredited(scheduleFor(ctx.schedules, iso));
}

function holidayText(r) {
  if (r.halfDay) return r.halfDayCredited && r.target > 0 ? `${r.halfDay} (halber Arbeitstag)` : r.halfDay;
  if (!r.holiday) return '';
  // Der Zusatz ist nur interessant, wenn der Feiertag auf einen (üblichen) Arbeitstag fällt.
  return !r.holidayCredited && r.target > 0 ? `${r.holiday} (nicht angerechnet)` : r.holiday;
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
    if (r.absenceType === 'vacation') sum.vacationDays += r.absenceDays;
    if (r.absenceType === 'sick') sum.sickDays += r.absenceDays;
    if (r.absenceType === 'comp_time') sum.compDays += r.absenceDays;
    if (r.absenceType === 'other_paid') sum.otherDays += r.absenceDays;
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
  isHalfWorkday,
  showsDaySoll,
  showsDaySaldo,
  isOffDay,
  holidayText,
  holidaysCredited,
  isWeekly,
  weeklyCounted,
  buildContext,
  modelTarget,
  hasTarget,
  dayResult,
  summarize,
  overtimeAt,
  overtimeByMonth,
  weekDays,
};
