'use strict';

// Datumswerte sind intern ISO-Strings "JJJJ-MM-TT". Gerechnet wird in UTC,
// damit Sommerzeit-Umstellungen keine Tage verschieben.

const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function toISO(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function isValidISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const { y, m, d } = parts(iso);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function utc(iso) {
  const { y, m, d } = parts(iso);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const dt = new Date(ms);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function addDays(iso, n) {
  return fromUTC(utc(iso) + n * 86400000);
}

function diffDays(a, b) {
  return Math.round((utc(b) - utc(a)) / 86400000);
}

/** ISO-Wochentag: 1 = Montag … 7 = Sonntag. */
function isoWeekday(iso) {
  const wd = new Date(utc(iso)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** ISO-Kalenderwoche { year, week }. */
function isoWeek(iso) {
  const thursday = addDays(iso, 4 - isoWeekday(iso));
  const year = parts(thursday).y;
  const week = Math.floor(diffDays(toISO(year, 1, 1), thursday) / 7) + 1;
  return { year, week };
}

/** Montag der Woche, in der der Tag liegt. */
function startOfWeek(iso) {
  return addDays(iso, 1 - isoWeekday(iso));
}

/** Alle Tage von from bis to (einschließlich). */
function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Heutiges Datum in der Zeitzone des Prozesses (TZ). */
function todayISO(now = new Date()) {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** "13.10.2026" */
function formatDE(iso) {
  const { y, m, d } = parts(iso);
  return `${pad(d)}.${pad(m)}.${y}`;
}

/** "13.10." */
function formatDEShort(iso) {
  const { m, d } = parts(iso);
  return `${pad(d)}.${pad(m)}.`;
}

/** Wert für ein Datumsfeld: ISO wird als "TT.MM.JJJJ" angezeigt, alles andere bleibt (Fehleingaben). */
function formatDateInput(value) {
  if (!value) return '';
  return isValidISO(value) ? formatDE(value) : String(value);
}

/** Datum lesen: "TT.MM.JJJJ", "T.M.JJJJ", "TT.MM.JJ", "TT,MM,JJJJ", "TTMMJJJJ" oder ISO. */
function parseDateInput(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (isValidISO(s)) return s;
  // Punkt oder Komma als Trenner (Handy-Zahlentastatur) oder nur Ziffern: 13102026, 131026
  const match = s.match(/^(\d{1,2})[.,](\d{1,2})[.,](\d{2}|\d{4})$/) || s.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    const iso = toISO(year, Number(match[2]), Number(match[1]));
    if (isValidISO(iso)) return iso;
  }
  return null;
}

module.exports = {
  WEEKDAYS_SHORT,
  WEEKDAYS_LONG,
  MONTHS,
  toISO,
  parts,
  isValidISO,
  daysInMonth,
  addDays,
  diffDays,
  isoWeekday,
  isoWeek,
  startOfWeek,
  eachDay,
  todayISO,
  formatDE,
  formatDEShort,
  parseDateInput,
  formatDateInput,
};
