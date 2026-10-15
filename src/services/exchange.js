'use strict';

const { parseClock, formatClock } = require('../utils/time');
const { isValidISO } = require('../utils/date');
const { ABSENCE_TYPES } = require('./worktime');
const { STATES } = require('./holidays');
const { validatePeriod } = require('./schedules');

// Datensicherung als JSON: Export aller Daten eines Nutzers und Import (Spec 7.5, F-42/F-43).
// Uhrzeiten stehen lesbar als "HH:MM", Dauern in Minuten.

const FORMAT = 'stundenerfassung-export';
const VERSION = 1;
const MAX_ERRORS = 20;

async function buildExport(repos, user, appVersion) {
  const [blocks, days, schedules, entitlements] = await Promise.all([
    repos.timeBlocks.forUser(user.id),
    repos.days.forUser(user.id),
    repos.workSchedules.forUser(user.id),
    repos.vacationEntitlements.forUser(user.id),
  ]);

  const byDate = new Map();
  const entry = (date) => {
    if (!byDate.has(date)) {
      byDate.set(date, { date, blocks: [], manual_break_min: null, absence_type: null, absence_fraction: null, note: '' });
    }
    return byDate.get(date);
  };
  for (const b of [...blocks].sort((x, y) => x.start_min - y.start_min)) {
    entry(b.date).blocks.push({ start: formatClock(b.start_min), end: formatClock(b.end_min) });
  }
  for (const d of days) {
    Object.assign(entry(d.date), {
      manual_break_min: d.manual_break_min ?? null,
      absence_type: d.absence_type || null,
      absence_fraction: d.absence_type ? d.absence_fraction : null,
      note: d.note || '',
    });
  }

  return {
    format: FORMAT,
    version: VERSION,
    app_version: appVersion,
    exported_at: new Date().toISOString(),
    username: user.username,
    settings: {
      state: user.state,
      tracking_start: user.tracking_start,
      overtime_start_minutes: user.overtime_start_minutes,
      vacation_days_default: user.vacation_days_default,
    },
    work_schedules: schedules
      .sort((a, b) => (a.valid_from || '').localeCompare(b.valid_from || ''))
      .map((s) => ({
        valid_from: s.valid_from,
        valid_to: s.valid_to,
        weekly_min: s.weekly_min,
        workdays: s.workdays,
        distribution: s.distribution === 'weekly' ? 'weekly' : 'fixed',
        holidays_credited: s.holidays_credited !== false,
        note: s.note || '',
      })),
    vacation_entitlements: entitlements
      .sort((a, b) => a.year - b.year)
      .map((e) => ({ year: e.year, days: e.days ?? null, carryover_days: e.carryover_days ?? null })),
    days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function isHalfStep(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && Math.round(n * 2) === n * 2;
}

/**
 * Prüft eine Sicherungsdatei vollständig. Gibt { errors, data } zurück;
 * data ist normalisiert (Minuten statt Uhrzeiten) und nur gesetzt, wenn es keine Fehler gibt.
 */
function parseImport(text) {
  const errors = [];
  const err = (msg) => {
    if (errors.length < MAX_ERRORS) errors.push(msg);
  };

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { errors: ['Die Datei ist keine gültige JSON-Datei.'], data: null };
  }
  if (!raw || raw.format !== FORMAT) {
    return { errors: ['Das ist keine Sicherungsdatei der Stundenerfassung.'], data: null };
  }
  if (raw.version !== VERSION) {
    return { errors: [`Diese Dateiversion (${raw.version}) wird nicht unterstützt.`], data: null };
  }

  // Einstellungen
  const s = raw.settings || {};
  const settings = {
    state: s.state,
    tracking_start: s.tracking_start,
    overtime_start_minutes: s.overtime_start_minutes,
    vacation_days_default: s.vacation_days_default,
  };
  if (!STATES[settings.state]) err('Einstellungen: unbekanntes Bundesland.');
  if (!isValidISO(settings.tracking_start)) err('Einstellungen: ungültiger Beginn der Erfassung.');
  if (!Number.isInteger(settings.overtime_start_minutes)) err('Einstellungen: ungültiger Startsaldo.');
  if (!isHalfStep(settings.vacation_days_default)) err('Einstellungen: ungültiger Urlaubsanspruch.');

  // Arbeitszeitmodelle
  const schedules = [];
  for (const [i, ws] of (Array.isArray(raw.work_schedules) ? raw.work_schedules : []).entries()) {
    const label = `Arbeitszeitmodell ${i + 1}`;
    const item = {
      valid_from: ws.valid_from || null,
      valid_to: ws.valid_to || null,
      weekly_min: ws.weekly_min,
      workdays: Array.isArray(ws.workdays) ? [...new Set(ws.workdays)].sort() : [],
      // Fehlen die Felder (ältere Sicherung), gilt der übliche Fall.
      distribution: ws.distribution ?? 'fixed',
      holidays_credited: ws.holidays_credited ?? true,
      note: typeof ws.note === 'string' ? ws.note.slice(0, 100) : '',
    };
    if (!Number.isInteger(item.weekly_min) || item.weekly_min < 0 || item.weekly_min > 10080) err(`${label}: ungültige Wochenarbeitszeit.`);
    if (item.workdays.length === 0 || item.workdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) err(`${label}: ungültige Arbeitstage.`);
    if (!['fixed', 'weekly'].includes(item.distribution)) err(`${label}: unbekannte Verteilung „${item.distribution}“.`);
    if (typeof item.holidays_credited !== 'boolean') err(`${label}: holidays_credited muss true oder false sein.`);
    if (item.valid_from && !isValidISO(item.valid_from)) err(`${label}: ungültiges Startdatum.`);
    if (item.valid_to && !isValidISO(item.valid_to)) err(`${label}: ungültiges Enddatum.`);
    if (!item.valid_from && item.valid_to) err(`${label}: Enddatum ohne Startdatum.`);
    schedules.push(item);
  }
  const defaults = schedules.filter((x) => !x.valid_from);
  if (defaults.length !== 1) err('Die Datei muss genau ein Standard-Arbeitszeitmodell enthalten.');
  if (errors.length === 0) {
    const withIds = schedules.map((x, i) => ({ ...x, id: String(i) }));
    for (const p of withIds.filter((x) => x.valid_from)) {
      const msg = validatePeriod(p, withIds);
      if (msg) err(`Zeitraum ab ${p.valid_from}: ${msg}`);
    }
  }

  // Urlaubsansprüche
  const entitlements = [];
  const years = new Set();
  for (const e of Array.isArray(raw.vacation_entitlements) ? raw.vacation_entitlements : []) {
    if (!Number.isInteger(e.year) || e.year < 1900 || e.year > 2200 || years.has(e.year)) {
      err(`Urlaubsanspruch: ungültiges oder doppeltes Jahr (${e.year}).`);
      continue;
    }
    years.add(e.year);
    const days = e.days ?? null;
    const carry = e.carryover_days ?? null;
    if (days !== null && !isHalfStep(days)) err(`Urlaubsanspruch ${e.year}: ungültige Tage.`);
    if (carry !== null && !isHalfStep(carry)) err(`Urlaubsanspruch ${e.year}: ungültiger Übertrag.`);
    entitlements.push({ year: e.year, days, carryover_days: carry });
  }

  // Tage
  const days = [];
  const dates = new Set();
  for (const d of Array.isArray(raw.days) ? raw.days : []) {
    if (!d || !isValidISO(d.date) || dates.has(d.date)) {
      err(`Ungültiger oder doppelter Tag (${d && d.date}).`);
      continue;
    }
    dates.add(d.date);
    const label = `Tag ${d.date}`;
    const blocks = [];
    for (const b of Array.isArray(d.blocks) ? d.blocks : []) {
      const start = parseClock(b && b.start);
      const end = parseClock(b && b.end, { allow24: true });
      if (start === null || end === null || end <= start) {
        err(`${label}: ungültiger Zeitblock ${b && b.start}–${b && b.end}.`);
        continue;
      }
      blocks.push({ start_min: start, end_min: end });
    }
    blocks.sort((a, b) => a.start_min - b.start_min);
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].start_min < blocks[i - 1].end_min) err(`${label}: Zeitblöcke überschneiden sich.`);
    }
    const manual = d.manual_break_min ?? null;
    if (manual !== null) {
      if (!Number.isInteger(manual) || manual < 0) err(`${label}: ungültige Pause.`);
      else if (blocks.length !== 1) err(`${label}: eine manuelle Pause ist nur bei genau einem Zeitblock möglich.`);
      else if (manual > blocks[0].end_min - blocks[0].start_min) err(`${label}: die Pause ist länger als die Arbeitszeit.`);
    }
    const type = d.absence_type || null;
    let fraction = null;
    if (type) {
      if (!ABSENCE_TYPES[type]) err(`${label}: unbekannte Abwesenheit „${type}“.`);
      fraction = d.absence_fraction;
      if (fraction !== 1 && fraction !== 0.5) err(`${label}: Abwesenheit muss ganz (1) oder halb (0.5) sein.`);
      else if (fraction === 0.5 && ABSENCE_TYPES[type] && !ABSENCE_TYPES[type].halfAllowed) {
        err(`${label}: ${ABSENCE_TYPES[type].label} gibt es nur als ganzen Tag.`);
      }
    }
    const note = typeof d.note === 'string' ? d.note.trim() : '';
    if (note.length > 200) err(`${label}: die Notiz ist länger als 200 Zeichen.`);
    days.push({ date: d.date, blocks, manual_break_min: manual, absence_type: type, absence_fraction: fraction, note });
  }

  if (errors.length >= MAX_ERRORS) errors.push('… weitere Fehler werden nicht angezeigt.');
  if (errors.length) return { errors, data: null };
  return { errors: [], data: { settings, schedules, entitlements, days } };
}

/**
 * Übernimmt geprüfte Importdaten.
 * mode 'replace': alle Daten des Nutzers werden durch die Datei ersetzt.
 * mode 'days':    nur die Tage aus der Datei werden übernommen (gleiche Tage werden überschrieben).
 */
async function applyImport(repos, userId, data, mode) {
  const stats = { days: 0, blocks: 0, schedules: 0, entitlements: 0 };
  await repos.transaction(async () => {
    if (mode === 'replace') {
      await repos.timeBlocks.removeForUser(userId);
      await repos.days.removeForUser(userId);
      await repos.workSchedules.removeForUser(userId);
      await repos.vacationEntitlements.removeForUser(userId);
      await repos.users.update(userId, { ...data.settings, setup_done: true });
      for (const s of data.schedules) {
        await repos.workSchedules.create({ user_id: userId, ...s });
        stats.schedules += 1;
      }
      for (const e of data.entitlements) {
        await repos.vacationEntitlements.create({ user_id: userId, ...e });
        stats.entitlements += 1;
      }
    }
    for (const d of data.days) {
      await repos.timeBlocks.removeForDay(userId, d.date);
      await repos.days.removeForDay(userId, d.date);
      for (const b of d.blocks) {
        await repos.timeBlocks.create({ user_id: userId, date: d.date, ...b });
        stats.blocks += 1;
      }
      if (d.manual_break_min !== null || d.absence_type || d.note) {
        await repos.days.create({
          user_id: userId,
          date: d.date,
          manual_break_min: d.manual_break_min,
          absence_type: d.absence_type,
          absence_fraction: d.absence_fraction,
          note: d.note,
        });
      }
      stats.days += 1;
    }
  });
  return stats;
}

module.exports = { FORMAT, VERSION, buildExport, parseImport, applyImport };
