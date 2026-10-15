'use strict';

const time = require('./time');
const date = require('./date');
const { STATES } = require('../services/holidays');
const { ABSENCE_TYPES, showsDaySoll, showsDaySaldo, isOffDay, holidayText } = require('../services/worktime');

// Hilfsfunktionen für die Templates.

/** CSS-Klasse für einen Saldo (Farbe ist nie das einzige Merkmal – das Vorzeichen steht immer dabei). */
function saldoClass(min) {
  if (min > 0) return 'plus';
  if (min < 0) return 'minus';
  return 'zero';
}

function absenceLabel(type, fraction) {
  if (!type) return '';
  const t = ABSENCE_TYPES[type];
  return fraction === 0.5 ? `½ ${t.label}` : t.label;
}

function absenceShort(type, fraction) {
  if (!type) return '';
  const t = ABSENCE_TYPES[type];
  return fraction === 0.5 ? `½${t.short}` : t.short;
}

function monthUrl(iso) {
  return `/monat/${iso.slice(0, 4)}/${Number(iso.slice(5, 7))}`;
}

const BREAK_SOURCES = { auto: 'automatisch', manual: 'manuell', gaps: 'Lücken' };

module.exports = {
  fmt: {
    hm: time.formatHM,
    dec: time.formatDec,
    signedHM: time.formatSignedHM,
    signedDec: time.formatSignedDec,
    clock: time.formatClock,
    days: time.formatDays,
    date: date.formatDE,
    dateInput: date.formatDateInput,
    dateShort: date.formatDEShort,
    weekday: (iso) => date.WEEKDAYS_SHORT[date.isoWeekday(iso) - 1],
    weekdayLong: (iso) => date.WEEKDAYS_LONG[date.isoWeekday(iso) - 1],
    month: (m) => date.MONTHS[m - 1],
  },
  saldoClass,
  showsDaySoll,
  showsDaySaldo,
  isOffDay,
  holidayText,
  absenceLabel,
  absenceShort,
  monthUrl,
  BREAK_SOURCES,
  STATES,
  ABSENCE_TYPES,
  WEEKDAYS_SHORT: date.WEEKDAYS_SHORT,
  WEEKDAYS_LONG: date.WEEKDAYS_LONG,
};
