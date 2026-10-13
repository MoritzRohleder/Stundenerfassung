'use strict';

// Zeiten werden intern als ganze Minuten gerechnet (Spec P4).

const MINUS = '−';

/**
 * Uhrzeit lesen: "8", "8:15", "08:15", "0815", "815", "8.15".
 * Gibt Minuten seit 00:00 zurück oder null bei ungültiger Eingabe.
 * "24:00" ist nur erlaubt, wenn allow24 gesetzt ist (Ende eines Blocks).
 */
function parseClock(input, { allow24 = false } = {}) {
  if (input === undefined || input === null) return null;
  const s = String(input).trim();
  if (s === '') return null;
  let h;
  let m;
  let match = s.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (match) {
    h = Number(match[1]);
    m = match[2] === undefined ? 0 : Number(match[2]);
  } else if ((match = s.match(/^(\d{1,2})(\d{2})$/))) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else {
    return null;
  }
  if (m > 59) return null;
  if (h === 24 && m === 0 && allow24) return 1440;
  if (h > 23) return null;
  return h * 60 + m;
}

/** Minuten seit 00:00 als "HH:MM". */
function formatClock(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Dauer als "7:30" (ohne Einheit, Vorzeichen nur bei negativen Werten). */
function formatHM(min) {
  const sign = min < 0 ? MINUS : '';
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

/** Dauer dezimal als "7,50". */
function formatDec(min) {
  const sign = min < 0 ? MINUS : '';
  const value = Math.round((Math.abs(min) / 60) * 100) / 100;
  return sign + value.toFixed(2).replace('.', ',');
}

/** Saldo mit Vorzeichen: "+1:15" / "−0:30" / "±0:00". */
function formatSignedHM(min) {
  if (min === 0) return '±0:00';
  return (min > 0 ? '+' : '') + formatHM(min);
}

function formatSignedDec(min) {
  if (min === 0) return '±0,00';
  return (min > 0 ? '+' : '') + formatDec(min);
}

/**
 * Dauer lesen, z. B. Wochenarbeitszeit oder Startsaldo:
 * "40", "38,5", "38.5", "38:30", "+1:30", "-2,5", "−0:45".
 * Gibt Minuten zurück (gerundet) oder null.
 */
function parseDuration(input, { allowNegative = false } = {}) {
  if (input === undefined || input === null) return null;
  let s = String(input).trim().replace(/\s+/g, '').replace(MINUS, '-').replace(/h$/i, '');
  if (s === '') return null;
  let sign = 1;
  if (s[0] === '+' || s[0] === '-') {
    if (s[0] === '-') sign = -1;
    s = s.slice(1);
  }
  let minutes;
  let match;
  if ((match = s.match(/^(\d{1,4}):(\d{2})$/))) {
    if (Number(match[2]) > 59) return null;
    minutes = Number(match[1]) * 60 + Number(match[2]);
  } else if ((match = s.match(/^(\d{1,4})(?:[.,](\d{1,2}))?$/))) {
    const hours = Number(`${match[1]}.${match[2] || '0'}`);
    minutes = Math.round(hours * 60);
  } else {
    return null;
  }
  if (sign < 0 && !allowNegative) return null;
  return sign * minutes || 0;
}

/** Urlaubstage lesen ("30", "12,5"); nur ganze und halbe Tage. */
function parseDays(input) {
  if (input === undefined || input === null) return null;
  const s = String(input).trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (Math.round(n * 2) !== n * 2) return null;
  return n;
}

function formatDays(n) {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  return s.replace('-', MINUS);
}

module.exports = {
  MINUS,
  parseClock,
  formatClock,
  formatHM,
  formatDec,
  formatSignedHM,
  formatSignedDec,
  parseDuration,
  parseDays,
  formatDays,
};
