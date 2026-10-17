'use strict';

const { toISO, addDays, isoWeekday } = require('../utils/date');

// Gesetzliche Feiertage je Bundesland (Spec 6.7). Keine externe Datenquelle.

const STATES = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

/** Ostersonntag nach dem Gauß/Meeus-Algorithmus (gregorianisch). */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISO(year, month, day);
}

/** Buß- und Bettag: Mittwoch vor dem 23. November. */
function repentanceDay(year) {
  let d = toISO(year, 11, 22);
  while (isoWeekday(d) !== 3) d = addDays(d, -1);
  return d;
}

function compute(year, state) {
  const easter = easterSunday(year);
  const list = [
    [toISO(year, 1, 1), 'Neujahr', 'all'],
    [toISO(year, 1, 6), 'Heilige Drei Könige', ['BW', 'BY', 'ST']],
    [toISO(year, 3, 8), 'Internationaler Frauentag', year >= 2023 ? ['BE', 'MV'] : year >= 2019 ? ['BE'] : []],
    [addDays(easter, -2), 'Karfreitag', 'all'],
    [easter, 'Ostersonntag', ['BB']],
    [addDays(easter, 1), 'Ostermontag', 'all'],
    [toISO(year, 5, 1), 'Tag der Arbeit', 'all'],
    [addDays(easter, 39), 'Christi Himmelfahrt', 'all'],
    [addDays(easter, 49), 'Pfingstsonntag', ['BB']],
    [addDays(easter, 50), 'Pfingstmontag', 'all'],
    [addDays(easter, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']],
    [toISO(year, 8, 15), 'Mariä Himmelfahrt', ['SL']],
    [toISO(year, 9, 20), 'Weltkindertag', year >= 2019 ? ['TH'] : []],
    [toISO(year, 10, 3), 'Tag der Deutschen Einheit', 'all'],
    [
      toISO(year, 10, 31),
      'Reformationstag',
      year === 2017 ? 'all' : year >= 2018 ? ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'] : ['BB', 'MV', 'SN', 'ST', 'TH'],
    ],
    [toISO(year, 11, 1), 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']],
    [repentanceDay(year), 'Buß- und Bettag', ['SN']],
    [toISO(year, 12, 25), '1. Weihnachtstag', 'all'],
    [toISO(year, 12, 26), '2. Weihnachtstag', 'all'],
  ];
  const map = new Map();
  for (const [date, name, states] of list) {
    if (states === 'all' || states.includes(state)) map.set(date, name);
  }
  return map;
}

const cache = new Map();

/** Map ISO-Datum → Name aller Feiertage des Jahres im Bundesland. */
function holidaysOf(year, state) {
  const key = `${year}-${state}`;
  if (!cache.has(key)) cache.set(key, compute(year, state));
  return cache.get(key);
}

/** Name des Feiertags oder null. */
function holidayName(iso, state) {
  if (!state) return null;
  return holidaysOf(Number(iso.slice(0, 4)), state).get(iso) || null;
}

/**
 * Halbe Arbeitstage: Heiligabend und Silvester (kein gesetzlicher Feiertag, Soll halbiert).
 * Gibt den Namen oder null zurück.
 */
function halfDayName(iso) {
  const md = iso.slice(5);
  if (md === '12-24') return 'Heiligabend';
  if (md === '12-31') return 'Silvester';
  return null;
}

module.exports = { STATES, easterSunday, holidaysOf, holidayName, halfDayName };
