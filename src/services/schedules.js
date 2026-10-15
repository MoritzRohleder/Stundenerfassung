'use strict';

// Arbeitszeitmodelle: Standardmodell + Zeiträume (Spec 5.2, 6.3).

function isDefault(schedule) {
  return !schedule.valid_from;
}

function defaultSchedule(schedules) {
  return schedules.find(isDefault) || null;
}

function periods(schedules) {
  return schedules.filter((s) => !isDefault(s)).sort((a, b) => a.valid_from.localeCompare(b.valid_from));
}

/** Das Modell, das an einem Tag gilt. */
function scheduleFor(schedules, iso) {
  for (const p of periods(schedules)) {
    if (p.valid_from <= iso && (!p.valid_to || iso <= p.valid_to)) return p;
  }
  return defaultSchedule(schedules);
}

/** Tagessoll laut Modell (ohne Feiertage/Abwesenheiten), kaufmännisch gerundet. */
function dailyTarget(schedule, weekday) {
  if (!schedule || !schedule.workdays.includes(weekday)) return 0;
  return Math.round(schedule.weekly_min / schedule.workdays.length);
}

/**
 * Prüft einen Zeitraum gegen die übrigen Zeiträume.
 * Gibt eine Fehlermeldung oder null zurück.
 */
function validatePeriod(candidate, schedules) {
  if (!candidate.valid_from) return 'Bitte ein Startdatum angeben.';
  if (candidate.valid_to && candidate.valid_to < candidate.valid_from) {
    return 'Das Enddatum liegt vor dem Startdatum.';
  }
  const others = periods(schedules).filter((p) => p.id !== candidate.id);
  const candEnd = candidate.valid_to || '9999-12-31';
  for (const p of others) {
    const pEnd = p.valid_to || '9999-12-31';
    if (candidate.valid_from <= pEnd && p.valid_from <= candEnd) {
      return 'Der Zeitraum überschneidet sich mit einem anderen Zeitraum.';
    }
  }
  // Offen darf nur der zeitlich letzte Zeitraum sein (E-20).
  if (!candidate.valid_to && others.some((p) => p.valid_from > candidate.valid_from)) {
    return 'Nur der zeitlich letzte Zeitraum darf ohne Enddatum sein.';
  }
  return null;
}

module.exports = { isDefault, defaultSchedule, periods, scheduleFor, dailyTarget, validatePeriod };
