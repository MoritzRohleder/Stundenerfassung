'use strict';

const { parseClock, formatClock } = require('../utils/time');
const { ABSENCE_TYPES, hasTarget, isHalfWorkday } = require('./worktime');

// Prüfen und Speichern eines Arbeitstages (Spec F-20, F-23).

const NOTE_MAX = 200;

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Liest das Formular eines Tages.
 * Gibt { errors, input, blocks, day } zurück; input enthält die Rohwerte zum erneuten Anzeigen.
 */
function parseDayForm(body, ctx, date) {
  const starts = toArray(body.start);
  const ends = toArray(body.end);
  const rows = [];
  const errors = [];
  const blocks = [];
  const count = Math.max(starts.length, ends.length);

  for (let i = 0; i < count; i++) {
    const startRaw = String(starts[i] || '').trim();
    const endRaw = String(ends[i] || '').trim();
    rows.push({ start: startRaw, end: endRaw });
    if (!startRaw && !endRaw) continue;
    const start = parseClock(startRaw);
    const end = parseClock(endRaw, { allow24: true });
    const label = `Zeile ${blocks.length + 1}`;
    if (start === null || end === null) {
      errors.push(`${label}: Bitte Beginn und Ende als Uhrzeit angeben (z. B. 08:00).`);
      continue;
    }
    if (end <= start) {
      errors.push(`${label}: Das Ende (${formatClock(end)}) muss nach dem Beginn (${formatClock(start)}) liegen.`);
      continue;
    }
    blocks.push({ start_min: start, end_min: end });
  }

  blocks.sort((a, b) => a.start_min - b.start_min);
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].start_min < blocks[i - 1].end_min) {
      errors.push(
        `Die Zeiten ${formatClock(blocks[i - 1].start_min)}–${formatClock(blocks[i - 1].end_min)} und ` +
          `${formatClock(blocks[i].start_min)}–${formatClock(blocks[i].end_min)} überschneiden sich.`,
      );
    }
  }

  const breakRaw = String(body.manual_break || '').trim();
  let manualBreak = null;
  if (breakRaw !== '') {
    if (!/^\d{1,3}$/.test(breakRaw)) {
      errors.push('Die Pause bitte in ganzen Minuten angeben.');
    } else if (blocks.length > 1) {
      errors.push('Bei mehreren Zeitblöcken ergibt sich die Pause aus den Lücken – bitte das Pausenfeld leer lassen.');
    } else if (blocks.length === 0) {
      errors.push('Eine Pause kann nur zusammen mit einem Zeitblock eingetragen werden.');
    } else {
      manualBreak = Number(breakRaw);
      const blockMin = blocks[0].end_min - blocks[0].start_min;
      if (manualBreak > blockMin) errors.push('Die Pause ist länger als die gearbeitete Zeit.');
    }
  }

  const absenceType = body.absence_type && ABSENCE_TYPES[body.absence_type] ? body.absence_type : null;
  let absenceFraction = null;
  if (absenceType) {
    absenceFraction = body.absence_fraction === '0.5' ? 0.5 : 1;
    if (absenceFraction === 0.5 && !ABSENCE_TYPES[absenceType].halfAllowed) {
      errors.push(`${ABSENCE_TYPES[absenceType].label} gibt es nur als ganzen Tag.`);
    } else if (absenceFraction === 0.5 && isHalfWorkday(ctx, date)) {
      errors.push('Dieser Tag ist schon ein halber Arbeitstag – bitte „ganzer Tag“ wählen (zählt als halber Tag).');
    }
    if (!hasTarget(ctx, date)) {
      errors.push('An diesem Tag ist keine Arbeitszeit vorgesehen (Wochenende, Feiertag oder freier Tag) – eine Abwesenheit ist nicht nötig.');
    }
  }

  const note = String(body.note || '').trim();
  if (note.length > NOTE_MAX) errors.push(`Die Notiz darf höchstens ${NOTE_MAX} Zeichen lang sein.`);

  return {
    errors,
    input: {
      rows,
      manual_break: breakRaw,
      absence_type: absenceType || '',
      absence_fraction: absenceFraction === 0.5 ? '0.5' : '1',
      note,
    },
    blocks,
    day: {
      manual_break_min: manualBreak,
      absence_type: absenceType,
      absence_fraction: absenceFraction,
      note,
    },
  };
}

/** Speichert Zeitblöcke und Zusatzangaben eines Tages atomar. */
async function saveDay(repos, userId, date, blocks, day) {
  await repos.transaction(async () => {
    await repos.timeBlocks.removeForDay(userId, date);
    for (const b of blocks) await repos.timeBlocks.create({ user_id: userId, date, ...b });
    const existing = await repos.days.find(userId, date);
    const hasDayData = day.manual_break_min !== null || day.absence_type || day.note;
    if (!hasDayData) {
      if (existing) await repos.days.remove(existing.id);
    } else if (existing) {
      await repos.days.update(existing.id, day);
    } else {
      await repos.days.create({ user_id: userId, date, ...day });
    }
  });
}

async function clearDay(repos, userId, date) {
  await repos.transaction(async () => {
    await repos.timeBlocks.removeForDay(userId, date);
    await repos.days.removeForDay(userId, date);
  });
}

module.exports = { parseDayForm, saveDay, clearDay, NOTE_MAX };
