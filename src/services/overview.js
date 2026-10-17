'use strict';

const { toISO, daysInMonth, isoWeek, isoWeekday, addDays, startOfWeek, eachDay } = require('../utils/date');
const { buildContext, dayResult, summarize, overtimeAt, overtimeByMonth } = require('./worktime');
const { vacationYear, trackingYear } = require('./vacation');

// Daten für Dashboard, Monats- und Jahresübersicht (Spec F-30 bis F-35).

async function loadContext(repos, user, today) {
  const [blocks, days, schedules, entitlements] = await Promise.all([
    repos.timeBlocks.forUser(user.id),
    repos.days.forUser(user.id),
    repos.workSchedules.forUser(user.id),
    repos.vacationEntitlements.forUser(user.id),
  ]);
  return buildContext({ user, blocks, days, schedules, entitlements, today });
}

function monthRange(year, month) {
  return { from: toISO(year, month, 1), to: toISO(year, month, daysInMonth(year, month)) };
}

/** Monatsübersicht: Tageszeilen mit Wochen-Zwischenzeilen. */
function monthView(ctx, year, month) {
  const { from, to } = monthRange(year, month);
  const rows = [];
  // Laufender Stand des Überstundenkontos am Ende jedes Tages (nur gewertete Tage bis heute).
  let running = overtimeAt(ctx, addDays(from, -1));
  for (const iso of eachDay(from, to)) {
    const r = dayResult(ctx, iso);
    let overtime = null;
    if (r.tracked && r.status !== 'future') {
      running += r.counted;
      overtime = running;
    }
    rows.push({ kind: 'day', ...r, overtime });
    if (isoWeekday(iso) === 7 || iso === to) {
      const monday = startOfWeek(iso);
      const weekFrom = monday < from ? from : monday;
      const sunday = addDays(monday, 6);
      rows.push({
        kind: 'week',
        week: isoWeek(iso).week,
        partial: monday < from || sunday > to,
        ...summarize(ctx, weekFrom, iso),
        overtime: weekFrom <= ctx.today && iso >= (ctx.user.tracking_start || '9999') ? overtimeAt(ctx, iso) : null,
      });
    }
  }
  const summary = summarize(ctx, from, to);
  const overtimeEnd = to < ctx.user.tracking_start || from > ctx.today ? null : overtimeAt(ctx, to);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    year,
    month,
    rows,
    summary,
    overtimeEnd,
    isCurrent: ctx.today >= from && ctx.today <= to,
    prev,
    next,
  };
}

/** Jahre, für die es Daten gibt (für die Auswahlliste). */
function availableYears(ctx) {
  const todayYear = Number(ctx.today.slice(0, 4));
  const candidates = [todayYear];
  const ty = trackingYear(ctx.user);
  if (ty) candidates.push(ty);
  if (ctx.firstDate) candidates.push(Number(ctx.firstDate.slice(0, 4)));
  if (ctx.lastDate) candidates.push(Number(ctx.lastDate.slice(0, 4)));
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const years = [];
  for (let y = max; y >= min; y--) years.push(y);
  return years;
}

/** Jahresübersicht: 12 Monate mit Summen und Überstundenkonto. */
function yearView(ctx, year) {
  const overtime = overtimeByMonth(ctx, year);
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const { from, to } = monthRange(year, m);
    months.push({
      month: m,
      ...summarize(ctx, from, to),
      overtimeEnd: overtime[m - 1],
      isCurrent: ctx.today >= from && ctx.today <= to,
      isFuture: from > ctx.today,
    });
  }
  const total = summarize(ctx, toISO(year, 1, 1), toISO(year, 12, 31));
  const lastKnown = overtime.filter((v) => v !== null);
  return {
    year,
    months,
    total,
    overtimeEnd: lastKnown.length ? lastKnown[lastKnown.length - 1] : null,
    vacation: vacationYear(ctx, year),
    years: availableYears(ctx),
  };
}

/** Dashboard: heute, Woche, Monat, Überstundenkonto, Urlaub. */
function dashboardView(ctx) {
  const today = ctx.today;
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const monday = startOfWeek(today);
  const { from, to } = monthRange(year, month);
  return {
    today: dayResult(ctx, today),
    week: { number: isoWeek(today).week, ...summarize(ctx, monday, addDays(monday, 6)) },
    month: { year, month, ...summarize(ctx, from, to) },
    overtime: overtimeAt(ctx, today),
    vacation: vacationYear(ctx, year),
  };
}

module.exports = { loadContext, monthView, yearView, dashboardView, availableYears };
