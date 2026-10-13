'use strict';

const { parseDuration, parseDays } = require('../utils/time');
const { parseDateInput } = require('../utils/date');
const { STATES } = require('./holidays');
const { validatePeriod } = require('./schedules');

// Formulare für Einrichtung, Einstellungen und Arbeitszeitmodelle.
// Keine Standardwerte: alle Pflichtfelder müssen ausgefüllt werden (E-26).

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Allgemeine Einstellungen: Bundesland, Beginn, Startsaldo, Urlaubsanspruch. */
function parseGeneral(body) {
  const errors = [];
  const state = STATES[body.state] ? body.state : null;
  if (!state) errors.push('Bitte ein Bundesland auswählen.');

  const trackingStart = parseDateInput(body.tracking_start);
  if (!trackingStart) errors.push('Bitte den Beginn der Erfassung als Datum angeben.');

  let overtime = parseDuration(body.overtime_start, { allowNegative: true });
  if (overtime === null) {
    errors.push('Bitte den Startsaldo der Überstunden angeben (z. B. 0, 12:30 oder 4,5).');
  } else if (body.overtime_sign === 'minus' && overtime > 0) {
    overtime = -overtime;
  }

  const vacation = parseDays(body.vacation_days_default);
  if (vacation === null) errors.push('Bitte den Urlaubsanspruch pro Jahr in ganzen oder halben Tagen angeben.');

  return {
    errors,
    values: {
      state,
      tracking_start: trackingStart,
      overtime_start_minutes: overtime,
      vacation_days_default: vacation,
    },
  };
}

/** Arbeitszeitmodell (Standard oder Zeitraum). */
function parseSchedule(body, { isPeriod, schedules = [], id = null }) {
  const errors = [];
  const weekly = parseDuration(body.weekly);
  if (weekly === null) errors.push('Bitte die Wochenarbeitszeit angeben (z. B. 40, 38,5 oder 38:30).');
  else if (weekly > 7 * 24 * 60) errors.push('Die Wochenarbeitszeit ist zu groß.');

  const workdays = [...new Set(toArray(body.workdays).map(Number))]
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    .sort();
  if (workdays.length === 0) errors.push('Bitte mindestens einen Arbeitstag auswählen.');

  const values = { weekly_min: weekly, workdays, note: String(body.note || '').trim().slice(0, 100) };

  if (isPeriod) {
    values.valid_from = parseDateInput(body.valid_from);
    values.valid_to = body.valid_to ? parseDateInput(body.valid_to) : null;
    if (!values.valid_from) errors.push('Bitte ein gültiges Startdatum angeben.');
    if (body.valid_to && !values.valid_to) errors.push('Das Enddatum ist ungültig.');
    if (values.valid_from && errors.length === 0) {
      const msg = validatePeriod({ ...values, id }, schedules);
      if (msg) errors.push(msg);
    }
  } else {
    values.valid_from = null;
    values.valid_to = null;
  }
  return { errors, values };
}

module.exports = { parseGeneral, parseSchedule, toArray };
